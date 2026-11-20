// node --test extension/test/site.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const site = new URL("../../site/", import.meta.url);
const about = readFileSync(new URL("index.html", site), "utf8");

test("About page keeps the fixed wording", () => {
  for (const s of ["cannot guarantee", "I-983", "Ask your DSO", "not legal advice", "Not affiliated", "federal-contract",
                   "Company names never leave your browser", "first 3 characters of the hash", "Not found", "couldn’t check", "Questions to ask before you accept", "Coming soon", "no dates"]) {
    assert.ok(about.toLowerCase().includes(s.toLowerCase()), "missing: " + s);
  }
});

test("About page makes no third-party requests (links are fine, loads are not)", () => {
  assert.ok(!/<(script|link|img|iframe)[^>]+(src|href)=["']https?:/i.test(about.replace(/<a [^>]*>/gi, "")), "external resource found");
  assert.ok(!/@import|url\(https?:/i.test(about));
});

test("About page uses the icon files and the speed test moved off the home page", () => {
  assert.ok(about.includes('href="icon.svg"') && about.includes('href="favicon-32.png"'));
  assert.ok(existsSync(new URL("speedtest.html", site)));
  assert.ok(!about.includes("createShardClient"));
});
