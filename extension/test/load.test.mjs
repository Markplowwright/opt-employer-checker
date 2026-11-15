// node --test extension/test/load.test.mjs   (Node 18+)
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { loadGzJson, lookup } from "../lib/load.js";

const fake = (obj) => async () => new Response(gzipSync(Buffer.from(JSON.stringify(obj))), { status: 200 });

test("loads and unzips a gzipped JSON index", async () => {
  const idx = { acme: { n: 1, open: 1, recs: [] } };
  const { data, stats } = await loadGzJson("x", { fetchImpl: fake(idx) });
  assert.deepEqual(data, idx);
  assert.ok(stats.compressedBytes > 0 && stats.jsonChars > 0);
  assert.equal(lookup(data, "acme").open, 1);
  assert.equal(lookup(data, "nope"), null);
});

test("reports progress", async () => {
  let seen = 0;
  await loadGzJson("x", { fetchImpl: fake({ a: 1 }), onProgress: (r) => (seen = r) });
  assert.ok(seen > 0);
});

test("throws on HTTP error", async () => {
  await assert.rejects(loadGzJson("x", { fetchImpl: async () => new Response("", { status: 404 }) }), /HTTP 404/);
});
