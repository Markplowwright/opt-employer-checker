// Looks up employers for the content script. Runs in the service worker so the memory cache is shared by all tabs
// and the disk cache (Cache Storage) survives restarts. Only a short hash prefix leaves the browser, never the name.
import { createShardClient2 } from "./lib/shards2.js";

const BASE = "https://markplowwright.github.io/opt-employer-checker/";   // About page and privacy policy
const DATA = BASE + "v2/";                                               // format-2 data; the root tree is format 1, kept for older versions
let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    caches.delete("opt-shards-v1").catch(() => {});   // format-1 shards from earlier versions; no longer used
    clientPromise = caches.open("opt-shards-v2").then((cache) => createShardClient2({ base: DATA, cache }));
  }
  return clientPromise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "lookup" || !Array.isArray(msg.names)) return false;
  getClient()
    .then((c) => c.lookupMany(msg.names.slice(0, 60).map(String)))
    .then((map) => sendResponse({ results: Object.fromEntries(map) }))
    .catch(() => sendResponse({ results: null }));
  return true; // keep the channel open for the async answer
});

// The toolbar icon opens the data site's About page (what it does, data date and sources, privacy).
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: BASE }));
