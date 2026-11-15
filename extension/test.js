import { loadGzJson, lookup } from "./lib/load.js";

const BASE = "https://github.com/Markplowwright/opt-employer-checker/releases/download/data-latest/";
const log = document.getElementById("log");
const say = (m) => (log.textContent += m + "\n");

document.getElementById("go").onclick = async () => {
  log.textContent = "";
  document.getElementById("res").innerHTML = "";
  try {
    say("step 1: fetching meta.json from " + BASE);
    let metaResp;
    try {
      metaResp = await fetch(BASE + "meta.json");
    } catch (e) {
      say(`FAILED at step 1 (network/CORS): ${e.name}: ${e.message}`);
      say("Hints: check chrome://extensions > OPT Employer Checker > Details > Site access; pause any ad blocker (AdGuard, uBlock) and retry; open the meta.json URL in a new tab to see if it loads.");
      say("Final URL tried: " + BASE + "meta.json");
      return;
    }
    say(`step 1 OK: HTTP ${metaResp.status}, final URL host ${new URL(metaResp.url).host}`);
    const meta = await metaResp.json();
    say(`meta: ${meta.records_unique.toLocaleString()} records, data date ${meta.data_date}, coverage ${meta.coverage_pct}%`);
    let last = 0;
    const { data, stats } = await loadGzJson(BASE + "index.json.gz", {
      onProgress: (r, t) => { if (r - last > 2e6) { last = r; say(`downloaded ${(r / 1e6).toFixed(1)} MB`); } },
    });
    say(`OK: ${Object.keys(data).length.toLocaleString()} name keys`);
    say(`download+unzip ${stats.downloadAndUnzipMs} ms, JSON.parse ${stats.parseMs} ms, ${(stats.jsonChars / 1e6).toFixed(0)}M characters`);
    if (performance.memory) say(`JS heap used: ${(performance.memory.usedJSHeapSize / 1e6).toFixed(0)} MB`);
    const rows = ["cognizant technology solutions us", "infosys", "university of chicago", "fairdinkum consulting", "no such employer xyz"]
      .map((k) => { const e = lookup(data, k); return `<tr><td>${k}</td><td class="${e ? "ok" : "bad"}">${e ? `${e.n} record(s), ${e.open} open` : "not found in our data"}</td></tr>`; });
    document.getElementById("res").innerHTML = "<tr><th>Key</th><th>Result</th></tr>" + rows.join("");
  } catch (e) {
    say("FAILED: " + e.message);
  }
};
