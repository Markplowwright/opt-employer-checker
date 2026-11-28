// node --test extension/test/   Parity: the JS rule E must give the same keys as data-pipeline/normalize_v2.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonKey, strictKey, dropUs } from "../lib/normalize2.js";

const vectors = JSON.parse(readFileSync(new URL("./vectors2.json", import.meta.url), "utf8"));

test("rule E matches Python on every shared vector (loose and strict keys)", () => {
  assert.ok(vectors.length >= 3000);
  for (const [name, loose, strict] of vectors) {
    assert.equal(canonKey(name), loose, "loose: " + name);
    assert.equal(strictKey(name), strict, "strict: " + name);
  }
});

test("names the rule must keep apart, and names it must join", () => {
  assert.notEqual(canonKey("S&P Global"), canonKey("SP Global, Inc."));
  assert.notEqual(canonKey("P&G Hospitality Inc"), canonKey("PG Hospitality, LLC"));
  assert.notEqual(canonKey("Clark"), canonKey("Clark & Company LLC"));
  assert.equal(canonKey("IBM"), canonKey("IBM Corp"));
  assert.equal(canonKey("Morrison Foerster"), canonKey("Morrison & Foerster LLP"));
  assert.equal(canonKey("Ørsted Inc"), canonKey("Orsted"));
});

test("dots: loose ignores them, strict keeps them, dotted legal endings are endings", () => {
  assert.equal(canonKey("Kingswood U.S."), canonKey("KINGSWOOD US, LLC"));
  assert.notEqual(strictKey("Kingswood U.S."), strictKey("KINGSWOOD US, LLC"));
  assert.equal(strictKey("Point72 L.P."), strictKey("Point72"));
});

test("names with no Latin letters give an empty key (the lookup must say 'couldn't check')", () => {
  for (const n of ["株式会社ソニー", "Яндекс", "شركة النفط", "", "   "]) assert.equal(canonKey(n), "", n);
});

test("US/USA fallback key", () => {
  assert.equal(dropUs("bank of china usa"), "bank of china");
  assert.equal(dropUs("kpmg us"), "kpmg");
  assert.equal(dropUs("us"), null);
  assert.equal(dropUs("us bank"), null);
});
