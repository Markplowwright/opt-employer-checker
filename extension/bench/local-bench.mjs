// Local timing of the shard lookup path using the REAL shards.
//   node extension/bench/local-bench.mjs <site_dir> [latencyMs=80]
// Serves <site_dir> over HTTP with gzip and an artificial per-request delay (stand-in for network
// round-trip + server time), then times: first lookup, repeat lookup, and a 25-company list.
// This does NOT measure the real internet; use extension/speedtest.html against the live site for that.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createShardClient } from "../lib/shards.js";

const [dir, latencyArg] = process.argv.slice(2);
if (!dir) throw new Error("usage: local-bench.mjs <site_dir> [latencyMs]");
const latency = Number(latencyArg ?? 80);
let served = 0, servedBytes = 0;

const server = http.createServer(async (req, res) => {
  try {
    const raw = await readFile(path.join(dir, decodeURIComponent(req.url.split("?")[0])));
    const body = gzipSync(raw, { level: 6 });
    await new Promise((r) => setTimeout(r, latency));
    served++; servedBytes += body.length;
    res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip", "content-length": body.length });
    res.end(body);
  } catch { res.writeHead(404); res.end("no"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

// 25 real employers from the data (first 5 are well-known names), as a LinkedIn list might show.
const names = ["Cognizant Technology Solutions", "Infosys Limited", "Steven Madden, Ltd.", "Accenture LLP", "Deloitte Consulting LLP",
  "Amazon.com Services LLC", "Google LLC", "Microsoft Corporation", "JPMorgan Chase & Co.", "IBM", "Capital One", "Wells Fargo",
  "Oracle America, Inc.", "Tata Consultancy Services", "Wipro Limited", "HCL America Inc", "Salesforce, Inc.", "Adobe Inc.",
  "Goldman Sachs", "Bank of America", "Walmart Inc", "Target Corporation", "Verizon", "Intel Corporation", "Cisco Systems, Inc."];

const ms = (t0) => Math.round(performance.now() - t0);
const c = createShardClient({ base });
let t = performance.now();
const first = await c.lookupName(names[0]);
const firstMs = ms(t);   // includes meta.json + shard (2 round trips)
t = performance.now(); await c.lookupName(names[0]); const repeatMs = ms(t);
t = performance.now();
const list = await c.lookupMany(names);
const listMs = ms(t);
const found = [...list.values()].filter((r) => r.found).length, errors = [...list.values()].filter((r) => r.error).length;
t = performance.now(); await c.lookupMany(names); const listAgainMs = ms(t);

console.log(JSON.stringify({
  simulatedLatencyMs: latency,
  firstLookupMs: firstMs, repeatLookupMs: repeatMs,
  list25ColdMs: listMs, list25WarmMs: listAgainMs,
  listFound: found, listErrors: errors,
  requestsServed: served, gzipKBServed: Math.round(servedBytes / 1000),
  note: "first lookup included the meta.json round trip",
}, null, 1));
server.close();
