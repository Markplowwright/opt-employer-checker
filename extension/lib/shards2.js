// Format-2 lookups (data under .../v2/). The older shards.js stays as it is for format 1.
// Same privacy rule: the host only sees 3-hex-character hash prefixes. Failure is an error, never "not found".
//
// lookupName(raw) returns one of
//   { unsupported: true, key: "" , meta }                       the name has no usable letters or digits -> "couldn't check"
//   { found: false, key, h1b, meta }                            no E-Verify records under any key tried (h1b may still exist)
//   { found: true, matchKind, key, entry, records, h1b, meta }  matchKind: exact | dots | brand | us | paren
// Green is possible only for "exact". Every other kind is a lead and is shown purple with the legal name.
import { canonKey, strictKey, dropUs } from "./normalize2.js";
import { shardPrefix } from "./shards.js";

export const FORMAT = 2;
export const MAX_KEYS_PER_NAME = 4;   // primary + us/usa + two parenthetical keys; caps the shard requests for a miss

export function candidateKeys(raw) {
  const k1 = canonKey(raw);
  const out = [];
  if (!k1) return out;
  out.push({ key: k1, kind: "primary" });
  const us = dropUs(k1);
  if (us) out.push({ key: us, kind: "us" });
  const s = String(raw);
  if (s.includes("(")) {
    const dropped = canonKey(s.replace(/\([^)]*\)/g, " "));
    if (dropped && dropped !== k1) out.push({ key: dropped, kind: "paren" });
    const m = s.match(/\(([^)]*)\)/);
    const inside = m ? canonKey(m[1]) : "";
    if (inside && inside !== k1 && inside !== dropped) out.push({ key: inside, kind: "paren" });
  }
  return out.slice(0, MAX_KEYS_PER_NAME);
}

export function createShardClient2({ base, fetchImpl = (...a) => fetch(...a), cache = null } = {}) {
  const root = base.endsWith("/") ? base : base + "/";
  const memory = new Map();
  const stats = { memoryHits: 0, diskHits: 0, networkFetches: 0, networkBytes: 0 };
  let metaPromise = null;

  async function getMeta() {
    if (!metaPromise) {
      metaPromise = fetchImpl(root + "meta.json", { cache: "no-cache" }).then(async (r) => {
        if (!r.ok) throw new Error("meta HTTP " + r.status);
        const m = await r.json();
        if (m.format !== FORMAT) throw new Error("wrong data format " + m.format);   // never read another format as correct
        return m;
      });
      metaPromise.catch(() => { metaPromise = null; });
    }
    return metaPromise;
  }

  async function loadShard(prefix) {
    if (memory.has(prefix)) { stats.memoryHits++; return memory.get(prefix); }
    const p = (async () => {
      const meta = await getMeta();
      const url = root + meta.shard_path + prefix + ".json";
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
    p.catch(() => memory.delete(prefix));
    return p;
  }

  async function entryFor(key) {
    const shard = await loadShard(await shardPrefix(key));
    return Object.hasOwn(shard, key) ? shard[key] : null;
  }

  async function lookupName(raw) {
    const meta = await getMeta();
    const cands = candidateKeys(raw);
    if (!cands.length) return { unsupported: true, key: "", meta };
    const primary = await entryFor(cands[0].key);
    const h1b = primary && primary.h ? primary : null;      // H-1B only from the name itself, never from a fallback
    const strict = strictKey(raw);
    for (let i = 0; i < cands.length; i++) {
      const { key, kind } = cands[i];
      const entry = i === 0 ? primary : await entryFor(key);
      if (!entry || !entry.r || !entry.r.length) continue;
      if (kind !== "primary") return { found: true, matchKind: kind, key, entry, records: entry.r, h1b, meta };
      if (entry.b) return { found: true, matchKind: "brand", key, entry, records: entry.r, h1b, meta };
      const exact = entry.r.filter((r) => (r.sk || key) === strict);
      if (exact.length) return { found: true, matchKind: "exact", key, entry, records: exact, h1b, meta };
      return { found: true, matchKind: "dots", key, entry, records: entry.r, h1b, meta };
    }
    return { found: false, key: cands[0].key, h1b, meta };
  }

  async function lookupMany(rawNames) {
    const unique = [...new Set(rawNames)];
    const out = new Map();
    await Promise.all(unique.map(async (n) => {
      try { out.set(n, await lookupName(n)); } catch (e) { out.set(n, { error: String(e.message || e) }); }
    }));
    return out;
  }

  return { lookupName, lookupMany, getMeta, stats };
}
