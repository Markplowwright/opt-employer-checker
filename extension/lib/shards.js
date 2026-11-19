// Hash-prefix shard lookups. The host only ever sees a 3-hex-character prefix, never the company name.
// Three cache layers: memory (this worker), Cache Storage (disk, survives restarts), network.
// Failure is reported as an error, never as "not found".
import { normalizeName } from "./normalize.js";

export const PREFIX_HEX = 3;

export async function shardPrefix(key, prefixHex = PREFIX_HEX) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  let hex = "";
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, prefixHex);
}

export function createShardClient({ base, fetchImpl = (...a) => fetch(...a), cache = null } = {}) {
  const root = base.endsWith("/") ? base : base + "/";
  const memory = new Map();   // prefix -> Promise<object>
  const stats = { memoryHits: 0, diskHits: 0, networkFetches: 0, networkBytes: 0 };
  let metaPromise = null;

  async function getMeta() {
    // meta.json is the only unversioned file; always revalidate so a new data date is noticed.
    if (!metaPromise) {
      metaPromise = fetchImpl(root + "meta.json", { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error("meta HTTP " + r.status);
        return r.json();
      });
      metaPromise.catch(() => { metaPromise = null; });
    }
    return metaPromise;
  }

  async function loadShard(prefix) {
    if (memory.has(prefix)) { stats.memoryHits++; return memory.get(prefix); }
    const p = (async () => {
      const meta = await getMeta();
      const url = root + meta.shard_path + prefix + ".json"; // versioned path: safe to cache forever
      if (cache) {
        const hit = await cache.match(url);
        if (hit) { stats.diskHits++; return hit.json(); }
      }
      const resp = await fetchImpl(url);
      if (!resp.ok) throw new Error("shard " + prefix + " HTTP " + resp.status);
      const clone = cache ? resp.clone() : null;
      const text = await resp.text();
      stats.networkFetches++;
      stats.networkBytes += Number(resp.headers.get("content-length")) || text.length;
      if (cache) await cache.put(url, clone);
      return JSON.parse(text);
    })();
    memory.set(prefix, p);
    p.catch(() => memory.delete(prefix)); // do not cache failures
    return p;
  }

  // One company. Returns {found, key, entry?, meta}; throws on network failure.
  async function lookupName(rawName) {
    const key = normalizeName(rawName);
    if (!key) return { found: false, key, meta: await getMeta() };
    const [shard, meta] = await Promise.all([loadShard(await shardPrefix(key)), getMeta()]);
    const entry = Object.hasOwn(shard, key) ? shard[key] : null;
    return entry ? { found: true, key, entry, meta } : { found: false, key, meta };
  }

  // A whole results list: unique companies, shards fetched in parallel.
  async function lookupMany(rawNames) {
    const unique = [...new Set(rawNames)];
    const out = new Map();
    await Promise.all(unique.map(async (n) => {
      try { out.set(n, await lookupName(n)); }
      catch (e) { out.set(n, { error: String(e.message || e) }); }
    }));
    return out;
  }

  return { lookupName, lookupMany, getMeta, stats };
}
