import gzip
import hashlib
import json

import build_shards as bs


def _ndjson(path, rows):
    with gzip.open(path, "wt", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False) + "\n")


ROWS = [
    {"k": "acme", "n": "Acme Inc", "r": [{"e": "2020-01-01"}]},
    {"k": "café noir", "n": "Café Noir LLC", "f": ["staffing"], "r": [{"e": "2019-05-05", "t": "2021-01-01"}]},
    {"k": "zeta", "n": "Zeta Corp", "r": [{"e": "2024-02-02", "x": "2026-12-31"}]},
]


def test_prefix_matches_plain_sha256():
    want = hashlib.sha256("acme".encode("utf-8")).hexdigest()[:3]
    assert bs.shard_prefix("acme") == want
    assert len(bs.shard_prefix("anything")) == 3


def test_all_prefixes_count_and_shape():
    p = bs.all_prefixes()
    assert len(p) == 4096 and p[0] == "000" and p[-1] == "fff"


def test_split_round_trip_and_every_key_lands_in_its_prefix(tmp_path):
    src = tmp_path / "index.ndjson.gz"
    _ndjson(src, ROWS)
    shards = bs.split_ndjson_gz(src)
    assert len(shards) == 4096
    found = {}
    for prefix, content in shards.items():
        for key, obj in content.items():
            assert bs.shard_prefix(key) == prefix
            assert "k" not in obj
            found[key] = obj
    assert set(found) == {"acme", "café noir", "zeta"}
    assert found["café noir"]["f"] == ["staffing"]
    assert found["zeta"]["r"][0]["x"] == "2026-12-31"


def test_write_shards_creates_every_file_and_meta(tmp_path):
    src = tmp_path / "index.ndjson.gz"
    _ndjson(src, ROWS)
    out = tmp_path / "site"
    meta = bs.write_shards(
        bs.split_ndjson_gz(src), str(out), "2026-11-13",
        {"built": "2026-11-17", "source": "s", "ndjson": {"sha256": "abc", "size_codes": {"a": "1 to 4"}}},
    )
    files = sorted(p.name for p in (out / "2026-11-13").iterdir())
    assert len(files) == 4096 and files[0] == "000.json"
    assert meta["name_keys"] == 3 and meta["shard_path"] == "2026-11-13/"
    on_disk = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert on_disk["prefix_hex"] == 3 and on_disk["ndjson_sha256"] == "abc"
    shard = json.loads((out / "2026-11-13" / (bs.shard_prefix("acme") + ".json")).read_text(encoding="utf-8"))
    assert shard["acme"]["n"] == "Acme Inc"
    empty = [p for p in (out / "2026-11-13").iterdir() if p.read_text() == "{}"]
    assert len(empty) >= 4000


def test_output_is_reproducible(tmp_path):
    src = tmp_path / "index.ndjson.gz"
    _ndjson(src, ROWS)
    a, b = tmp_path / "a", tmp_path / "b"
    for d in (a, b):
        bs.write_shards(bs.split_ndjson_gz(src), str(d), "2026-11-13", {"built": "x"})
    pa = bs.shard_prefix("zeta") + ".json"
    assert (a / "2026-11-13" / pa).read_bytes() == (b / "2026-11-13" / pa).read_bytes()


H = {"name": "H ONLY LLC", "staffing": ["consulting"], "states": ["CA"],
     "years": {"2025": {"ia": 5, "ca": 3, "oa": 2, "id": 1, "cd": 1, "od": 0}, "2026": {"ia": 1, "ca": 0, "oa": 0, "id": 0, "cd": 0, "od": 0}}}


def test_merge_h1b_adds_totals_and_h1b_only_companies(tmp_path):
    src = tmp_path / "index.ndjson.gz"
    _ndjson(src, ROWS)
    shards = bs.split_ndjson_gz(src)
    h1b = {"acme": dict(H, name="ACME INC", staffing=[]), "h only": H}
    added = bs.merge_h1b(shards, h1b)
    assert added == 1
    acme = shards[bs.shard_prefix("acme")]["acme"]
    assert acme["h"] == {"2025": [10, 2], "2026": [1, 0]} and acme["n"] == "Acme Inc" and "f" not in acme
    only = shards[bs.shard_prefix("h only")]["h only"]
    assert only["r"] == [] and only["n"] == "H ONLY LLC" and only["f"] == ["consulting"]


def test_write_shards_records_h1b_years(tmp_path):
    src = tmp_path / "index.ndjson.gz"
    _ndjson(src, ROWS)
    meta = bs.write_shards(bs.split_ndjson_gz(src), str(tmp_path / "o"), "2026-11-13", {"built": "x"},
                           h1b_meta={"years_fetched": [2024, 2025, 2026], "built": "b", "source": "s"})
    assert meta["h1b_partial_fy"] == 2026 and meta["h1b_full_fy"] == 2025
