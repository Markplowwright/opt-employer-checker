"""Tests for build_shards_v2: regrouping by rule E, brand (DBA) guards, strict keys and H-1B re-keying."""
import gzip
import json
import os
import tempfile
import unittest

import build_shards_v2 as b2
from normalize_v2 import canon_key


def write_index(path, lines):
    with gzip.open(path, "wt", encoding="utf-8") as f:
        for o in lines:
            f.write(json.dumps(o) + "\n")


def build(lines, h1b=None):
    tmp = tempfile.mkdtemp()
    write_index(os.path.join(tmp, "index.ndjson.gz"), lines)
    json.dump({"data_date": "2026-11-13", "built": "x", "ndjson": {"lines": len(lines)}}, open(os.path.join(tmp, "meta.json"), "w"))
    h1b_dir = None
    if h1b is not None:
        h1b_dir = os.path.join(tmp, "h1b")
        os.makedirs(h1b_dir)
        json.dump(h1b, open(os.path.join(h1b_dir, "h1b.json"), "w"))
        json.dump({"years_fetched": [2025, 2026], "built": "x"}, open(os.path.join(h1b_dir, "h1b_meta.json"), "w"))
    out = os.path.join(tmp, "out")
    b2.main(tmp, out, h1b_dir)
    meta = json.load(open(os.path.join(out, "meta.json")))
    entries = {}
    for name in os.listdir(os.path.join(out, meta["shard_path"])):
        entries.update(json.load(open(os.path.join(out, meta["shard_path"], name))))
    return meta, entries


def line(name, recs, key=None):
    return {"k": key or canon_key(name), "n": name, "r": recs}


class BuildV2(unittest.TestCase):
    def test_format_and_regrouping(self):
        meta, e = build([line("Morrison & Foerster LLP", [{"e": "2020-01-01"}], key="morrison and foerster"),
                         line("Morrison Foerster", [{"e": "2021-01-01"}], key="morrison foerster")])
        self.assertEqual(meta["format"], 2)
        self.assertEqual(len(e["morrison foerster"]["r"]), 2)        # both spellings now share one key
        self.assertNotIn("morrison and foerster", e)

    def test_strict_key_only_when_dots_inside(self):
        _, e = build([line("Kingswood US, LLC", [{"e": "2020-01-01"}]), line("Kingswood U.S.", [{"e": "2021-01-01"}])])
        recs = {r["e"]: r for r in e["kingswood us"]["r"]}
        self.assertNotIn("sk", recs["2020-01-01"])
        self.assertEqual(recs["2021-01-01"]["sk"], "kingswood uxdotxs")

    def test_brand_entry_and_guards(self):
        legal = line("Capgemini America Inc", [{"e": "2020-01-01", "d": "Capgemini"}])
        junk = line("Acme Holdings LLC", [{"e": "2020-01-01", "d": "Soldier"}])          # shares no word with the legal name -> G5
        digits = line("Foo Bar LLC", [{"e": "2020-01-01", "d": "Foo Bar 12345"}])        # digits -> G4 (also same key as legal)
        own = line("Beta LLC", [{"e": "2020-01-01", "d": "Capgemini Beta"}])
        _, e = build([legal, junk, digits, own])
        self.assertTrue(e["capgemini"]["b"])
        self.assertEqual(e["capgemini"]["r"][0]["n"], "Capgemini America Inc")
        self.assertNotIn("soldier", e)

    def test_legal_name_wins_over_brand_g1(self):
        a = line("Delta LLC", [{"e": "2020-01-01"}])
        b = line("Delta Airways Corporation", [{"e": "2020-01-01", "d": "Delta"}])
        _, e = build([a, b])
        self.assertNotIn("b", e["delta"])

    def test_h1b_rekeyed_and_summed_and_kept_on_brand(self):
        yrs = lambda ia: {"2025": {"ia": ia, "ca": 1, "oa": 0, "id": 0, "cd": 0, "od": 0}}
        h1b = {"morrison and foerster": {"name": "Morrison & Foerster LLP", "years": yrs(4)},
               "morrison foerster": {"name": "Morrison Foerster", "years": yrs(2)},
               "capgemini": {"name": "CAPGEMINI", "years": yrs(1)}}
        _, e = build([line("Morrison Foerster", [{"e": "2020-01-01"}]),
                      line("Capgemini America Inc", [{"e": "2020-01-01", "d": "Capgemini"}])], h1b)
        self.assertEqual(e["morrison foerster"]["h"]["2025"], [8, 0, 6])      # summed: (4+1)+(2+1) approved, 6 new
        self.assertTrue(e["capgemini"]["b"] and e["capgemini"]["r"])           # brand records survive
        self.assertEqual(e["capgemini"]["h"]["2025"], [2, 0, 1])

    def test_empty_key_records_are_skipped_and_counted(self):
        meta, e = build([line("株式会社ソニー", [{"e": "2020-01-01"}], key="x"), line("Acme", [{"e": "2020-01-01"}])])
        self.assertEqual(list(e), ["acme"])


if __name__ == "__main__":
    unittest.main()
