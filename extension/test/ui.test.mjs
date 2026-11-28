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

// ---- collapsed enrollment list (real DOM via linkedom) ----
test("popup details: more than two enrollments show two rows and a 'Show all N' button that expands and collapses", async () => {
  const { parseHTML } = await import("linkedom");
  const { document, window } = parseHTML("<html><body><button id=a>x</button></body></html>");
  Object.assign(globalThis, { document, window });
  window.innerWidth = 1200; window.innerHeight = 800;
  const { createRequire } = await import("node:module");
  const OptUI = createRequire(import.meta.url)("../content/ui.js");
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ enrolled: "2020-01-" + String(i + 10), meta: "NY", tag: "Open", open: true, tone: "ok", state: "open" }));
  const view = (n) => ({ name: "Amazon", key: "amazon", tone: "ok", chip: "Enrolled", eChip: "E-Verify: enrolled", eAria: "x", headline: "Enrolled.", note: "n", records: rows(n),
    h1b: { available: true, chip: "H-1B: 5", mini: "H-1B 5", aria: "a", bars: [], note: "note", short: "", scope: "exact name only" }, staffing: "", dataDate: "2026-11-13" });
  const anchor = document.getElementById("a"); anchor.getBoundingClientRect = () => ({ left: 10, right: 50, top: 10, bottom: 30 });
  const open = (v) => {
    OptUI.openPopup(v, anchor, "");
    const host = [...document.body.children].find((c) => c.shadowRoot); const sr = host.shadowRoot;
    sr.querySelector("button.btn").click();   // Show details
    return sr;
  };
  const sr = open(view(32));
  const recEls = () => [...sr.querySelectorAll(".rec")];
  const text = (root) => root.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.equal(recEls().length, 32);
  assert.equal(recEls().filter((r) => !r.hidden).length, 2);
  assert.match(text(sr), /32 on file/);
  const more = [...sr.querySelectorAll("button.btn")].find((b) => /Show all 32 enrollments/.test(b.textContent));
  assert.ok(more); assert.equal(more.getAttribute("aria-expanded"), "false");
  assert.ok(text(sr).indexOf("H-1B petitions approved") > text(sr).indexOf("Show all 32"));   // H-1B follows the short list
  more.click();
  assert.equal(recEls().filter((r) => !r.hidden).length, 32); assert.match(more.textContent, /Show fewer enrollments/); assert.equal(more.getAttribute("aria-expanded"), "true");
  more.click();
  assert.equal(recEls().filter((r) => !r.hidden).length, 2);
  OptUI.closePopup();
  const sr2 = open(view(2));   // two or fewer: no button, no hidden rows
  assert.equal([...sr2.querySelectorAll(".rec")].filter((r) => r.hidden).length, 0);
  assert.ok(![...sr2.querySelectorAll("button.btn")].some((b) => /Show all/.test(b.textContent)));
  OptUI.closePopup();
});
