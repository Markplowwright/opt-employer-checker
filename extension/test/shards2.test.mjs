import { test } from "node:test";
import assert from "node:assert/strict";
import { shardPrefix } from "../lib/shards.js";
import { canonKey } from "../lib/normalize2.js";
import { createShardClient2, candidateKeys } from "../lib/shards2.js";

// A fake site: entries keyed by rule-E key, grouped into shards by the real hash prefix.
async function fakeSite(entries, { format = 2, calls = [] } = {}) {
  const shards = {};
  for (const [key, e] of Object.entries(entries)) {
    const p = await shardPrefix(key);
    (shards[p] ||= {})[key] = e;
  }
  const meta = { format, data_date: "2026-11-13", shard_path: "v/", prefix_hex: 3 };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("meta.json")) return new Response(JSON.stringify(meta));
    const m = url.match(/v\/([0-9a-f]{3})\.json$/);
    return new Response(JSON.stringify(shards[m[1]] || {}));
  };
  return { fetchImpl, calls };
}
const rec = (extra = {}) => ({ e: "2020-01-01", z: "d", s: "NY", ...extra });

test("exact match: strict key equal -> exact", async () => {
  const { fetchImpl } = await fakeSite({ "morrison foerster": { n: "Morrison & Foerster LLP", r: [rec()] } });
  const c = createShardClient2({ base: "http://x/", fetchImpl });
  const r = await c.lookupName("Morrison Foerster");
  assert.equal(r.found, true); assert.equal(r.matchKind, "exact"); assert.equal(r.records.length, 1);
});

test("dots only: same loose key, different dots -> dots (purple), not exact", async () => {
  const { fetchImpl } = await fakeSite({ "kingswood us": { n: "KINGSWOOD US, LLC", r: [rec({ sk: "kingswood us" })] } });
  const c = createShardClient2({ base: "http://x/", fetchImpl });
  assert.equal((await c.lookupName("Kingswood U.S.")).matchKind, "dots");
  assert.equal((await c.lookupName("Kingswood US")).matchKind, "exact");
});

test("record without sk means strict key equals the entry key", async () => {
  const { fetchImpl } = await fakeSite({ "acme": { n: "Acme", r: [rec()] } });
  assert.equal((await createShardClient2({ base: "http://x/", fetchImpl }).lookupName("ACME, Inc.")).matchKind, "exact");
});

test("brand entry is never exact; H-1B on the same key is still reported", async () => {
  const { fetchImpl } = await fakeSite({ capgemini: { b: 1, n: "CAPGEMINI", r: [rec({ n: "Capgemini America Inc" })], h: { 2025: [4, 0, 1] } } });
  const r = await createShardClient2({ base: "http://x/", fetchImpl }).lookupName("Capgemini");
  assert.equal(r.matchKind, "brand"); assert.ok(r.h1b);
});

test("US/USA fallback is purple; H-1B comes from the related entry and is marked as such (h1bVia)", async () => {
  const { fetchImpl } = await fakeSite({ "bank of china": { n: "Bank of China", r: [rec()], h: { 2025: [61, 2, 13] } } });
  const r = await createShardClient2({ base: "http://x/", fetchImpl }).lookupName("Bank of China USA");
  assert.equal(r.matchKind, "us"); assert.ok(r.h1b); assert.equal(r.h1bVia, "bank of china");
  assert.equal(r.h1b.h[2025][0], 61);
});

test("a name's own H-1B data wins over a fallback's (h1bVia stays null)", async () => {
  const { fetchImpl } = await fakeSite({ "acme usa": { n: "Acme USA", r: [], h: { 2025: [3, 0, 1] } }, acme: { n: "Acme", r: [rec()], h: { 2025: [99, 0, 1] } } });
  const r = await createShardClient2({ base: "http://x/", fetchImpl }).lookupName("Acme USA");
  assert.equal(r.matchKind, "us"); assert.equal(r.h1b.h[2025][0], 3); assert.equal(r.h1bVia, null);
});

test("comma parts: the part with two or more words is tried; single words are not", async () => {
  const { fetchImpl } = await fakeSite({ "university of pennsylvania health system": { n: "University of Pennsylvania Health System", r: [rec()] }, boston: { n: "Boston", r: [rec()] } });
  const c = createShardClient2({ base: "http://x/", fetchImpl });
  const r = await c.lookupName("Penn Medicine, University of Pennsylvania Health System");
  assert.equal(r.found, true); assert.equal(r.matchKind, "part"); assert.equal(r.key, "university of pennsylvania health system");
  assert.equal((await c.lookupName("Smith Holdings, Boston")).found, false);
});

test("candidateKeys: primary, us, brackets, comma parts, in that order, at most 4", async () => {
  const { candidateKeys } = await import("../lib/shards2.js");
  assert.deepEqual(candidateKeys("Alpha Beta US").map((k) => k.kind), ["primary", "us"]);
  const ks = candidateKeys("Alpha Beta (Gamma Delta), Epsilon Zeta, Eta Theta, Iota Kappa");
  assert.deepEqual(ks.map((k) => k.kind), ["primary", "paren", "paren", "part"]);
  assert.equal(candidateKeys("Penn Medicine, University of Pennsylvania Health System")[1].kind, "part");
});

test("parenthetical fallbacks: drop the brackets, then use the text inside", async () => {
  const a = await fakeSite({ "major league baseball": { n: "Major League Baseball", r: [rec()] } });
  assert.equal((await createShardClient2({ base: "http://x/", fetchImpl: a.fetchImpl }).lookupName("Major League Baseball (MLB)")).matchKind, "paren");
  const b = await fakeSite({ "valuation research": { n: "Valuation Research", r: [rec()] } });
  assert.equal((await createShardClient2({ base: "http://x/", fetchImpl: b.fetchImpl }).lookupName("VRC (Valuation Research)")).matchKind, "paren");
});

test("H-1B-only entry: E-Verify not found, H-1B reported; fallbacks still tried for E-Verify", async () => {
  const { fetchImpl } = await fakeSite({ "acme usa": { n: "Acme USA", r: [], h: { 2025: [3, 0, 1] } }, acme: { n: "Acme", r: [rec()] } });
  const r = await createShardClient2({ base: "http://x/", fetchImpl }).lookupName("Acme USA");
  assert.equal(r.matchKind, "us"); assert.ok(r.h1b);
});

test("nothing anywhere -> found:false; empty key -> unsupported (never 'not found')", async () => {
  const { fetchImpl } = await fakeSite({ acme: { n: "Acme", r: [rec()] } });
  const c = createShardClient2({ base: "http://x/", fetchImpl });
  assert.equal((await c.lookupName("Zzyzx Holdings")).found, false);
  assert.equal((await c.lookupName("株式会社ソニー")).unsupported, true);
});

test("wrong data format is an error, not a result", async () => {
  const { fetchImpl } = await fakeSite({}, { format: 1 });
  await assert.rejects(createShardClient2({ base: "http://x/", fetchImpl }).lookupName("Acme"), /wrong data format/);
});

test("a failed shard request is an error, never 'not found'", async () => {
  const fetchImpl = async (url) => url.endsWith("meta.json") ? new Response(JSON.stringify({ format: 2, shard_path: "v/" })) : new Response("", { status: 404 });
  const c = createShardClient2({ base: "http://x/", fetchImpl });
  await assert.rejects(c.lookupName("Acme"), /HTTP 404/);
  const many = await c.lookupMany(["Acme"]);
  assert.ok(many.get("Acme").error);
});

test("request count is capped and a hit stops early", async () => {
  assert.ok(candidateKeys("Foo Bar USA (Baz) (Qux)").length <= 4);
  const calls = [];
  const { fetchImpl } = await fakeSite({ acme: { n: "Acme", r: [rec()] } }, { calls });
  await createShardClient2({ base: "http://x/", fetchImpl }).lookupName("Acme");
  assert.equal(calls.filter((u) => !u.endsWith("meta.json")).length, 1);
  assert.equal(canonKey("Acme"), "acme");
});
