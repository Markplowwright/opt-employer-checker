// node --test extension/test/   (Node 18+)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeName } from "../lib/normalize.js";
import { shardPrefix, createShardClient } from "../lib/shards.js";

const vectors = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

test("normalizer matches the Python normalizer on 1,780 real name/key pairs (all 280 non-ASCII names + a random sample)", () => {
  assert.ok(vectors.length >= 1700);
  for (const [name, key] of vectors) assert.equal(normalizeName(name), key, name);
});

test("normalizer basics", () => {
  assert.equal(normalizeName("Café Noir, L.L.C."), "cafe noir");
  assert.equal(normalizeName("AT&T Inc."), "at and t");
  assert.equal(normalizeName(""), "");
});

test("shard prefix equals Python's sha256 prefix", async () => {
  // values produced by data-pipeline/build_shards.shard_prefix
  assert.equal(await shardPrefix("acme"), "822");
  assert.equal(await shardPrefix("steve madden"), "157");
  assert.equal((await shardPrefix("x", 5)).length, 5);
});

function fakeSite(shardsByPrefix, calls) {
  const meta = { data_date: "2026-11-13", shard_path: "2026-11-13/", prefix_hex: 3 };
  return async (url) => {
    calls.push(String(url));
    if (url.endsWith("meta.json")) return new Response(JSON.stringify(meta));
    const p = url.split("/").pop().replace(".json", "");
    if (!(p in shardsByPrefix)) return new Response("nope", { status: 404 });
    return new Response(JSON.stringify(shardsByPrefix[p]), { headers: { "content-length": "99" } });
  };
}

test("lookup finds exact keys, treats hash neighbours as not found, and caches", async () => {
  const p = await shardPrefix("acme");
  const calls = [];
  const c = createShardClient({
    base: "https://x.test/d",
    fetchImpl: fakeSite({ [p]: { acme: { n: "Acme Inc", r: [{ e: "2020-01-01" }] }, other: { n: "Other", r: [] } } }, calls),
  });
  const hit = await c.lookupName("ACME, Inc.");
  assert.equal(hit.found, true);
  assert.equal(hit.entry.n, "Acme Inc");
  await c.lookupName("Acme Inc");
  assert.equal(c.stats.networkFetches, 1);
  assert.ok(c.stats.memoryHits >= 1);
  // a different name that happens to share the shard must not match
  const miss = await createShardClient({ base: "https://x.test/d", fetchImpl: fakeSite({ [p]: { other: { n: "O", r: [] } } }, []) }).lookupName("Acme");
  assert.equal(miss.found, false);
});

test("requests never contain the company name", async () => {
  const calls = [];
  const p = await shardPrefix("secret");
  const c = createShardClient({ base: "https://x.test/d/", fetchImpl: fakeSite({ [p]: {} }, calls) });
  await c.lookupName("Secret Co LLC");
  for (const u of calls) assert.ok(!/secret/i.test(u), u);
});

test("network failure is an error, not 'not found', and is retried next time", async () => {
  let fail = true;
  const p = await shardPrefix("acme");
  const inner = fakeSite({ [p]: { acme: { n: "Acme", r: [] } } }, []);
  const c = createShardClient({ base: "https://x.test/d", fetchImpl: async (u, o) => (fail && !u.endsWith("meta.json") ? new Response("x", { status: 503 }) : inner(u, o)) });
  await assert.rejects(() => c.lookupName("acme"), /HTTP 503/);
  fail = false;
  assert.equal((await c.lookupName("acme")).found, true);
  const many = await createShardClient({ base: "https://x.test/d", fetchImpl: async () => new Response("x", { status: 500 }) }).lookupMany(["a", "b"]);
  assert.ok(many.get("a").error);
});

test("lookupMany fetches each needed shard once, in parallel, for duplicate names", async () => {
  const calls = [];
  const pa = await shardPrefix("acme");
  const c = createShardClient({ base: "https://x.test/d", fetchImpl: fakeSite({ [pa]: { acme: { n: "Acme", r: [] } } }, calls) });
  const res = await c.lookupMany(["Acme Inc", "Acme Inc", "ACME LLC"]);
  assert.equal(calls.filter((u) => u.endsWith(pa + ".json")).length, 1);
  assert.equal(res.get("Acme Inc").found, true);
});
