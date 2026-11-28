import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildView, summary } = require("../content/view.js");

const META = { data_date: "2026-11-13", coverage_pct: 76.7, h1b_full_fy: 2025, h1b_partial_fy: 2026 };
const found = (entry) => ({ found: true, key: "k", entry, meta: META });

// Real shapes from the index: Infosys has one open and one ended enrollment.
const INFOSYS = { n: "Infosys Limited", r: [{ e: "2024-09-27", z: "j", s: "TX" }, { n: "Infosys", e: "2024-08-09", t: "2026-01-06", z: "j", s: "NY" }],
  h: { 2023: [3449, 83], 2024: [8141, 101], 2025: [2856, 31], 2026: [4206, 129] } };

test("open enrollment: Enrolled, tags, H-1B chip uses the last FULL year", () => {
  const v = buildView("Infosys Limited", found(INFOSYS));
  assert.equal(v.tone, "ok"); assert.equal(v.eChip, "E-Verify: enrolled");
  assert.equal(v.h1b.chip, "H-1B: 2,856 · FY2025");
  assert.deepEqual(v.records.map((r) => r.tag), ["Open", "Ended 2026-01-06"]);
  assert.equal(v.dataDate, "2026-11-13");
  assert.match(v.h1b.note, /FY2026 is partial/);
  assert.equal(v.h1b.bars.at(-1).partial, true);
});

test("all enrollments ended: Enrollment ended with the latest end date", () => {
  const v = buildView("Cognizant", found({ n: "Cognizant", r: [{ e: "2021-11-19", t: "2026-05-16" }, { e: "2007-11-08", t: "2016-01-07" }] }));
  assert.equal(v.tone, "ended"); assert.equal(v.headline, "Latest enrollment ended 2026-05-16.");
  assert.match(v.note, /one could be missing/);
});

test("single ended enrollment wording", () => {
  const v = buildView("Madden", found({ n: "Madden", r: [{ e: "2008-07-09", t: "2008-10-02" }] }));
  assert.equal(v.headline, "Only enrollment on file ended 2008-10-02.");
});

test("scheduled end date shows 'Ends <date>' and is still open", () => {
  const v = buildView("Zeta", found({ n: "Zeta", r: [{ e: "2024-02-02", x: "2026-12-31" }] }));
  assert.equal(v.tone, "ok"); assert.equal(v.records[0].tag, "Ends 2026-12-31");
  assert.equal(v.headline, "Enrolled, with an end date listed: 2026-12-31.");
});

test("Open-with-an-earlier-end-date (u=1) is open but says so", () => {
  const v = buildView("Murky", found({ n: "Murky", r: [{ e: "2022-03-03", t: "2021-01-01", u: 1 }] }));
  assert.equal(v.tone, "ok"); assert.match(v.records[0].meta, /earlier end date/);
});

test("not found is never a verdict", () => {
  const v = buildView("Axonic", { found: false, key: "axonic", meta: META });
  assert.equal(v.tone, "none"); assert.equal(v.chip, "Not found");
  assert.match(v.note, /Not found is not a verdict/); assert.match(v.note, /76.7%/);
  assert.equal(v.h1b.chip, "H-1B: none found");
});

test("H-1B-only company: E-Verify not found but H-1B shown", () => {
  const v = buildView("H Only", found({ n: "H ONLY LLC", r: [], h: { 2025: [12, 0] } }));
  assert.equal(v.tone, "none"); assert.equal(v.h1b.chip, "H-1B: 12 · FY2025");
});

test("only partial-year approvals: chip says partial", () => {
  const v = buildView("Equinox", found({ n: "Equinox", r: [{ e: "2021-10-28" }], h: { 2026: [1, 0] } }));
  assert.equal(v.h1b.chip, "H-1B: 1 · FY2026*");
});

test("network error is 'couldn't check', not 'not found'", () => {
  const v = buildView("X", { error: "HTTP 503" });
  assert.equal(v.tone, "error"); assert.match(v.headline, /couldn.t reach the data/);
  assert.doesNotMatch(v.chip, /Not found/);
});

test("older data without H-1B hides the H-1B chip instead of guessing", () => {
  const v = buildView("Old", { found: true, key: "old", entry: { n: "Old", r: [{ e: "2020-01-01" }] }, meta: { data_date: "2026-11-13" } });
  assert.equal(v.h1b.available, false);
});

test("staffing hint text and summary line", () => {
  const v = buildView("Acme Solutions", found({ n: "Acme Solutions", f: ["solutions"], r: [{ e: "2020-01-01" }], h: { 2025: [5, 0] } }));
  assert.match(v.staffing, /weak hint/); assert.match(v.staffing, /provides and supervises/);
  assert.equal(summary(v), "1 enrollment on file · H-1B FY2025: 5");
});

test("compact H-1B text for small card chips (full year, partial year, none)", () => {
  assert.equal(buildView("Infosys", found(INFOSYS)).h1b.mini, "H-1B 2,856");
  assert.equal(buildView("Equinox", found({ n: "Equinox", r: [{ e: "2021-10-28" }], h: { 2026: [1, 0] } })).h1b.mini, "H-1B 1*");
  assert.equal(buildView("Axonic", { found: false, key: "axonic", meta: META }).h1b.mini, "H-1B 0");
});

// ---- format 2 (data under /v2/) ----
const META2 = { format: 2, data_date: "2026-11-13", coverage_pct: 99, h1b_full_fy: 2025, h1b_partial_fy: 2026 };
const f2 = (matchKind, records, extra = {}) => ({ found: true, matchKind, key: "k", entry: { n: "Legal Name LLC", r: records }, records, h1b: null, meta: META2, ...extra });

test("v2 exact + plain open record is green", () => {
  const v = buildView("Acme", f2("exact", [{ e: "2020-01-01" }]));
  assert.equal(v.tone, "ok"); assert.equal(v.eChip, "E-Verify: enrolled");
});

test("v2 scheduled end (after the DATA date) is amber with the date", () => {
  const v = buildView("Zeta", f2("exact", [{ e: "2024-02-02", x: "2026-12-31" }]));
  assert.equal(v.tone, "warn"); assert.equal(v.chip, "Enrolled, ends 2026-12-31");
});

test("v2 end date on or before the data date, or u=1, is amber 'unclear' (Truist case)", () => {
  assert.equal(buildView("T", f2("exact", [{ e: "2020-01-01", x: "2026-11-01" }])).chip, "Enrolled, unclear");
  const v = buildView("Truist Bank", f2("exact", [{ e: "2019-01-01", t: "2018-01-01", u: 1 }, { e: "2020-01-01", t: "2019-06-01", u: 1 }]));
  assert.equal(v.tone, "warn"); assert.equal(v.chip, "Enrolled, unclear");
});

test("v2 any plain open record beats amber ones; ended-only is 'ended' with the new wording", () => {
  assert.equal(buildView("A", f2("exact", [{ e: "2020-01-01", x: "2027-01-01" }, { e: "2021-01-01" }])).tone, "ok");
  const v = buildView("Cognizant", f2("exact", [{ e: "2021-11-19", t: "2026-05-16" }]));
  assert.equal(v.tone, "ended"); assert.match(v.note, /Other legal entities of this employer may be enrolled/);
  assert.match(v.headline, /under this exact name ended 2026-05-16/);
});

test("v2 non-exact matches are purple, show the legal name and the legal-name note, never green", () => {
  for (const kind of ["brand", "dots", "us", "paren"]) {
    const v = buildView("Name", f2(kind, [{ e: "2020-01-01", n: "Legal Name Inc" }]));
    assert.equal(v.tone, "related", kind);
    assert.match(v.headline, /Legal Name Inc/);
    assert.match(v.note, /offer letter or Form I-983/);
    assert.equal(v.records[0].tone, "ok");   // each related record keeps its own status
  }
});

test("v2 related records show their OWN status (an ended record stays ended)", () => {
  const v = buildView("Capgemini", f2("brand", [{ e: "2020-01-01", t: "2022-01-01", n: "Capgemini America Inc" }]));
  assert.equal(v.tone, "related"); assert.equal(v.records[0].tone, "ended");
});

test("v2 H-1B: shown for exact, dots and brand matches (from the name's own entry); hidden for us/paren fallbacks", () => {
  const h = { n: "Legal", r: [], h: { 2025: [12, 0, 3] } };
  assert.equal(buildView("Legal", f2("exact", [{ e: "2020-01-01" }], { h1b: h })).h1b.chip, "H-1B: 12 · FY2025");
  assert.equal(buildView("Legal", f2("brand", [{ e: "2020-01-01", n: "X" }], { h1b: h })).h1b.chip, "H-1B: 12 · FY2025");
  assert.equal(buildView("Legal", f2("us", [{ e: "2020-01-01" }], { h1b: h })).h1b.available, false);
});

test("v2 not found is not a verdict; H-1B-only company still shows its H-1B", () => {
  const v = buildView("Axonic", { found: false, key: "axonic", h1b: { n: "Axonic", r: [], h: { 2025: [5, 0, 1] } }, meta: META2 });
  assert.equal(v.tone, "none"); assert.match(v.note, /Not found is not a verdict/); assert.equal(v.h1b.chip, "H-1B: 5 · FY2025");
});

test("v2 a name with no usable letters is 'couldn't check', never 'not found'", () => {
  const v = buildView("株式会社ソニー", { unsupported: true, key: "", meta: META2 });
  assert.equal(v.tone, "error"); assert.equal(v.chip, "Couldn’t check"); assert.doesNotMatch(v.headline + v.note, /Not found/);
});
