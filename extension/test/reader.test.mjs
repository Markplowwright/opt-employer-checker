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
  const d = OptReader.readDetail(document, { pathname: "/jobs/collections/recommended/", search: "" });
  assert.equal(d.name, "Infosys Limited");
});

test("fails quiet on a page it does not understand", () => {
  const { document: other } = parseHTML("<html><body><div class='x'>hello</div></body></html>");
  assert.deepEqual(OptReader.readCards(other), []);
  assert.equal(OptReader.readDetail(other), null);
});

const { document: nd } = parseHTML(readFileSync(new URL("./fixtures/jobs-page-new.html", import.meta.url), "utf8"));

test("newer layout: employer is the first non-location <p> in each job card", () => {
  const cards = OptReader.readCards(nd);
  assert.deepEqual(cards.map((c) => c.name), ["Legora", "Equinox Holdings"]);
});

test("newer layout: detail pane employer is the company link outside the cards, not 'employees' links", () => {
  const d = OptReader.readDetail(nd, { pathname: "/jobs/search-results/", search: "?currentJobId=111" });
  assert.equal(d.name, "Legora");
});

const load = (f) => parseHTML(readFileSync(new URL("./fixtures/" + f, import.meta.url), "utf8")).document;

test("job tracker: 'Employer · Location' lines give the employer", () => {
  const cards = OptReader.readCards(load("jobs-tracker.html"));
  assert.deepEqual(cards.map((c) => c.name), ["Milliman", "Equinox"]);   // ATS suffix dropped
});

test("single job page: employer link confirmed by the page title; 'Show Premium Insights' is ignored", () => {
  const d = OptReader.readDetail(load("job-view.html"), { pathname: "/jobs/view/4486644520/", search: "" });
  assert.equal(d.name, "Jobot");
  assert.equal(OptReader.titleEmployer(load("job-view.html")), "Jobot");
});

test("no title confirmation means no chip (never guess an employer)", () => {
  const doc = load("job-view.html"); doc.title = "Something else";
  assert.equal(OptReader.readDetail(doc, { pathname: "/jobs/view/1/", search: "" }), null);
});

test("company page Jobs tab: employer from the title, anchored to the heading", () => {
  const d = OptReader.readDetail(load("company-jobs.html"), { pathname: "/company/legora/jobs/", search: "" });
  assert.equal(d.name, "Legora"); assert.equal(d.anchor.tagName, "H1");
});

test("jobs home has no selected job, so no detail chip", () => {
  assert.equal(OptReader.readDetail(load("jobs-page-new.html"), { pathname: "/jobs/", search: "" }), null);
});

test("which paths the reader runs on", () => {
  for (const p of ["/jobs/", "/jobs", "/jobs/search-results/", "/jobs/view/1/", "/jobs/collections/recommended/", "/jobs-tracker/", "/my-items/saved-jobs/", "/company/legora/jobs/"]) assert.ok(OptReader.applies({ pathname: p }), p);
  for (const p of ["/feed/", "/in/someone/", "/company/legora/", "/messaging/", "/"]) assert.ok(!OptReader.applies({ pathname: p }), p);
});

test("a page with nothing recognisable gives nothing, on every reader", () => {
  const doc = parseHTML("<html><head><title>x</title></head><body><p>hello</p></body></html>").document;
  assert.deepEqual(OptReader.readCards(doc), []);
  assert.equal(OptReader.readDetail(doc, { pathname: "/jobs/view/1/", search: "" }), null);
});

test("jobs home: the left sidebar profile card + footer is not a job card", () => {
  const foot = Array.from({ length: 13 }, (_, i) => "<p>Footer link " + i + "</p>").join("");
  const { document: d } = parseHTML('<html><head><title>Jobs | LinkedIn</title></head><body><aside><div><img src="me"><p>Premium</p><p>New York City Metropolitan Area</p>' + foot + '</div></aside></body></html>');
  assert.deepEqual(OptReader.readCards(d), []);
});

test("a 'Premium' label line is never taken as the employer", () => {
  const { document: d } = parseHTML('<html><body><div><img src="x"><a href="/jobs/view/9/">t</a><p>Premium</p><p>Acme Corp</p><p>Austin, TX (On-site)</p></div></body></html>');
  assert.deepEqual(OptReader.readCards(d).map((c) => c.name), ["Acme Corp"]);
});

test("title line slot: chips go after the title link, never inside it", () => {
  const doc = load("jobs-page-new.html");
  const cards = OptReader.readCards(doc);
  const slot = OptReader.titleSlot(cards[0].el, cards[0].anchor);
  assert.equal(slot.mode, "after"); assert.equal(slot.ref.tagName, "A");
  const tr = load("jobs-tracker.html"), tc = OptReader.readCards(tr);
  assert.equal(OptReader.titleSlot(tc[0].el, tc[0].anchor).ref.tagName, "A");
});

test("title line slot: classic card, chips after the title link", () => {
  const cards = OptReader.readCards(document);
  const slot = OptReader.titleSlot(cards[0].el, cards[0].anchor);
  assert.ok(slot && slot.ref.className.includes("job-card-list__title--link"));
});

test("title line slot: title inside layout-only wrappers, chips go into the title's own <p>", () => {
  const { document: d } = parseHTML('<html><body><div id="card"><img src="x"><div><div id="wrap"><p id="t"><span>Help Desk (Verified job)</span><span>Help Desk</span></p></div><div><p id="co">Acme Corp</p></div><p>Austin, TX (On-site)</p></div></div></body></html>');
  const card = d.getElementById("card"), anchor = d.getElementById("co");
  const slot = OptReader.titleSlot(card, anchor);
  assert.equal(slot.mode, "append"); assert.equal(slot.ref.id, "t");
});

test("jobs home: wrapper link around the whole card, bullet separators, many fields; sidebar still ignored", () => {
  const d = load("jobs-home.html");
  const cards = OptReader.readCards(d);
  assert.deepEqual(cards.map((c) => c.name), ["SISL Global", "Embrava"]);
});

test("jobs home: chips go into the title's text block, not after a link that wraps the whole card", () => {
  const d = load("jobs-home.html");
  const [a, b] = OptReader.readCards(d);
  const s1 = OptReader.titleSlot(a.el, a.anchor);
  assert.equal(s1.mode, "append"); assert.equal(s1.ref.tagName, "P");
  assert.equal(OptReader.titleSlot(b.el, b.anchor).ref.tagName, "P");
});
