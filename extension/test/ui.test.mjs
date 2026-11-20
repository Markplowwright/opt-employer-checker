// node --test extension/test/ui.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../content/ui.js", import.meta.url), "utf8");

test("detail chips keep an auto right margin so they stay next to the company name", () => {
  // LinkedIn's company row spreads its items apart on wide windows; the margin absorbs the free space.
  assert.match(src, /"display:block;margin:0 auto 0 12px"/);
});

test("list-card chips stay inline on the title line", () => {
  assert.match(src, /display:inline-block;vertical-align:middle;margin-left:8px/);
});

test("detail chips use the medium size (22px), list cards the small one (20px)", () => {
  assert.match(src, /\.row\.m button\.chip\{min-height:22px/);
  assert.match(src, /\.row\.s button\.chip\{min-height:20px/);
  assert.match(src, /class: compact \? "row s" : "row m"/);
});
