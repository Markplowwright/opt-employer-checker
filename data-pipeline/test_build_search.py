import json
import random
import string

import build_search as bs


def ev_line(name, recs, f=None):
    o = {"n": name, "r": recs}
    if f:
        o["f"] = f
    return o


H = {"years": {"2025": {"ia": 5, "ca": 3, "oa": 2, "id": 1, "cd": 0, "od": 0}, "2026": {"ia": 1, "ca": 0, "oa": 0, "id": 0, "cd": 0, "od": 0}}}


def test_everify_row_open_ended_and_unclear():
    row = bs.everify_row("acme", ev_line("Acme Inc", [
        {"e": "2020-01-02", "z": "c", "s": "NY,CA"},
        {"e": "2024-05-06", "t": "2025-01-01", "z": "e", "s": "TX"},
        {"e": "2022-03-03", "t": "2021-01-01", "u": 1, "z": "b"},   # dashboard says Open but a past end date exists
    ]))
    assert row["ev_total"] == 3 and row["ev_open"] == 2
    assert row["size"] == "e" and row["states"] == ["CA", "NY", "TX"]
    assert row["enrolled_year"] == 2024 and row["staffing"] == 0


def test_union_includes_h1b_only_and_everify_only_and_both():
    ev = {"both": bs.everify_row("both", ev_line("Both Inc", [{"e": "2020-01-01"}])),
          "evonly": bs.everify_row("evonly", ev_line("EV Only", [{"e": "2019-01-01", "t": "2020-01-01"}], f=["staffing"]))}
    h1b = {"both": dict(name="BOTH INC", staffing=[], states=["NY"], **H),
           "h1bonly": dict(name="H1B ONLY LLC", staffing=["consulting"], states=["WA", "CA"], **H)}
    rows = {r[0]: r for r in bs.combine(ev, h1b, 2025, 2026)}
    assert set(rows) == {"both", "evonly", "h1bonly"}
    assert rows["both"][1] == "Both Inc"                    # E-Verify display name wins
    assert rows["both"][7] == 10 and rows["both"][8] == 1   # approvals = ia+ca+oa
    assert rows["evonly"][7] == 0 and rows["evonly"][9] == 1
    assert rows["h1bonly"][2] == 0 and rows["h1bonly"][3] == 0   # E-Verify: not found
    assert rows["h1bonly"][5] == "CA,WA" and rows["h1bonly"][9] == 1


def test_rows_sorted_and_keys_ascii():
    ev = {k: bs.everify_row(k, ev_line(k, [{"e": "2020-01-01"}])) for k in ["zeta", "alpha 2", "alpha"]}
    rows = bs.combine(ev, {}, 2025, 2026)
    keys = [r[0] for r in rows]
    assert keys == sorted(keys) == ["alpha", "alpha 2", "zeta"]
    assert all(k.isascii() for k in keys)


def _fake_rows(n, seed=1):
    rnd = random.Random(seed)
    keys = set()
    while len(keys) < n:
        keys.add("".join(rnd.choice(string.ascii_lowercase + "  0") for _ in range(rnd.randint(2, 9))).strip() or "x")
    return [[k, k.title(), 1, 1, "a", "NY", 2020, 0, 0, 0] for k in sorted(keys)]


def test_chunks_cover_all_rows_and_never_split_a_key():
    rows = _fake_rows(2500)
    chunks = bs.chunk_rows(rows, 400)
    assert sum(len(c) for c in chunks) == len(rows)
    assert [r for c in chunks for r in c] == rows
    fence = bs.fence_for(chunks)
    assert fence[0]["f"] == "c000.json" and fence[-1]["n"] == len(chunks[-1])


def test_prefix_lookup_matches_brute_force():
    rows = _fake_rows(3000, seed=7)
    chunks = bs.chunk_rows(rows, 250)
    fence = bs.fence_for(chunks)
    rnd = random.Random(3)
    prefixes = {"", "a", "ab", "zz", "0", " "} | {r[0][:rnd.randint(1, 4)] for r in rnd.sample(rows, 200)}
    for p in prefixes:
        want = {r[0] for r in rows if r[0].startswith(p)}
        got = {r[0] for i in bs.chunks_for_prefix(fence, p) for r in chunks[i] if r[0].startswith(p)}
        assert got == want, p


def test_write_search_files_and_determinism(tmp_path):
    rows = _fake_rows(700)
    meta = {"data_date": "2026-11-13", "built": "x", "ndjson": {"size_codes": {"a": "1 to 4"}}}
    a = bs.write_search(rows, str(tmp_path / "a"), meta, {"built": "h"}, 2025, 2026, per_chunk=300)
    bs.write_search(rows, str(tmp_path / "b"), meta, {"built": "h"}, 2025, 2026, per_chunk=300)
    assert a["rows"] == 700 and len(a["chunks"]) == 3 and a["row_fields"] == bs.ROW_FIELDS
    d1, d2 = tmp_path / "a/search/2026-11-13", tmp_path / "b/search/2026-11-13"
    assert (d1 / "c001.json").read_bytes() == (d2 / "c001.json").read_bytes()
    assert json.loads((d1 / "c000.json").read_text())[0][0] == rows[0][0]
