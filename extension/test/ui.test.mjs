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

test("popup title bar is a drag handle and the popup is clamped inside the window", async () => {
  assert.match(src, /cursor:grab;touch-action:none/);
  assert.match(src, /hd\.addEventListener\("pointerdown"/);
  assert.match(src, /new ResizeObserver\(onResize\)/);
  const { createRequire } = await import("node:module");
  const { clampPos } = createRequire(import.meta.url)("../content/ui.js");
  const c = (l, t) => clampPos(l, t, 300, 400, 1000, 700, 8);
  assert.deepEqual(c(500, 200), { left: 500, top: 200 });
  assert.deepEqual(c(900, 600), { left: 692, top: 292 });   // pushed back up/left so the bottom-right stays visible
  assert.deepEqual(c(-50, -50), { left: 8, top: 8 });
  assert.deepEqual(clampPos(10, 10, 300, 900, 1000, 700, 8), { left: 10, top: 8 }); // taller than window: top stays reachable
});
