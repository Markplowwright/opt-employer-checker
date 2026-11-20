// Looks up employers for the content script. Runs in the service worker so the memory cache is shared by all tabs
// and the disk cache (Cache Storage) survives restarts. Only a short hash prefix leaves the browser, never the name.
import { createShardClient } from "./lib/shards.js";

const BASE = "https://markplowwright.github.io/opt-employer-checker/";
let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = caches.open("opt-shards-v1").then((cache) => createShardClient({ base: BASE, cache }));
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

// The toolbar icon opens the data site's speed-test page (handy for checking the data is reachable).
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: BASE }));
