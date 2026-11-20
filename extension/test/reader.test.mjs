import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseHTML } from "linkedom";

const require = createRequire(import.meta.url);
const OptReader = require("../content/reader.js");
const html = readFileSync(new URL("./fixtures/jobs-page.html", import.meta.url), "utf8");
const { document } = parseHTML(html);

test("reads company names from drawn cards, skips cards LinkedIn has not drawn yet", () => {
  const cards = OptReader.readCards(document);
  assert.deepEqual(cards.map((c) => c.name), ["Infosys Limited", "Equinox", "Jobot"]);
  assert.equal(cards[0].jobId, "urn:li:jobPosting:1001");
});

test("falls back to the logo alt text when a card has no subtitle", () => {
  const cards = OptReader.readCards(document);
  assert.equal(cards[2].name, "Jobot");
});

test("anchor is the subtitle when present (chips go right after it)", () => {
  const cards = OptReader.readCards(document);
  assert.ok(cards[0].anchor.className.includes("artdeco-entity-lockup__subtitle"));
});

test("reads the employer from the detail pane and collapses whitespace", () => {
  const d = OptReader.readDetail(document);
  assert.equal(d.name, "Infosys Limited");
});

test("fails quiet on a page it does not understand", () => {
  const { document: other } = parseHTML("<html><body><div class='x'>hello</div></body></html>");
  assert.deepEqual(OptReader.readCards(other), []);
  assert.equal(OptReader.readDetail(other), null);
});
