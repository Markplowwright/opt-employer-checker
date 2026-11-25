import csv, gzip, json, os, tempfile
from datetime import date, timedelta
import build_index

HDR = ["Last Updated Date", "Employer", "Doing Business As", "Account Status", "Opted into E-Verify+",
       "Date Enrolled", "Date Terminated", "Workforce Size", "Hiring Site Locations"]


def write_slice(path, rows):
    with open(path, "w", encoding="utf-16", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(HDR)
        w.writerows(rows)


def test_clean_text_collapses_whitespace():
    assert build_index.clean_text("1.\tMonrovia\xa0Nursery  Company ") == "1. Monrovia Nursery Company"


def test_build_cleans_dedupes_flags_scheduled_end_and_writes_coverage():
    future = (date.today() + timedelta(days=20)).strftime("%m/%d/%Y")
    rows = [
        ["11/13/2026", "Acme\tCorp", "", "Open", "No", "01/05/2020", "", "10 to 19", "NY"],
        ["11/13/2026", "Acme Corp", "", "Open", "No", "01/05/2020", "", "10 to 19", "NY"],  # duplicate after cleaning
        ["11/13/2026", "Soon Gone LLC", "", "Open", "Yes", "02/01/2021", future, "5 to 9", "CA"],
        ["11/13/2026", "Old Co", "", "Terminated", "No", "03/01/2010", "04/01/2012", "5 to 9", "TX"],
    ]
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.csv"), os.path.join(d, "b.csv")
        write_slice(a, rows[:2]); write_slice(b, rows[2:] + rows[:1])  # overlapping slices
        out = os.path.join(d, "out")
        build_index.main(out, [a, b], expected=8)
        idx = json.load(open(os.path.join(out, "index.json")))
        meta = json.load(open(os.path.join(out, "meta.json")))
        assert json.load(gzip.open(os.path.join(out, "index.json.gz"))) == idx
    assert meta["records_unique"] == 3 and meta["records_in"] == 5
    assert meta["data_date"] == "2026-11-13" and meta["coverage_pct"] == 62  # 5 records of 8 expected
    assert idx["acme"]["recs"][0]["name"] == "Acme Corp"
    soon = idx["soon gone"]["recs"][0]
    assert soon["status"] == "open" and "ends" in soon and "terminated" not in soon
    assert idx["old"]["recs"][0]["terminated"] == "2012-04-01"


def test_ndjson_is_slim_streamable_and_round_trips():
    rows = [
        ["11/13/2026", "Acme Corp", "Acme Foods", "Open", "No", "01/05/2020", "", "10 to 19", "NY"],
        ["11/13/2026", "ACME CORP.", "", "Terminated", "Yes", "03/01/2010", "04/01/2012", "5 to 9", "TX"],
        ["11/13/2026", "Old Co", "", "Terminated", "No", "03/01/2010", "04/01/2012", "10,000 and over", "Null"],
        ["11/13/2026", "Murky LLC", "", "Open", "No", "03/01/2010", "04/01/2012", "5 to 9", "NY"],  # Open but past end date
    ]
    with tempfile.TemporaryDirectory() as d:
        a = os.path.join(d, "a.csv")
        write_slice(a, rows)
        out = os.path.join(d, "out")
        build_index.main(out, [a])
        meta = json.load(open(os.path.join(out, "meta.json")))
        raw = gzip.open(os.path.join(out, "index.ndjson.gz")).read()
        full = json.load(open(os.path.join(out, "index.json")))
    lines = raw.decode("utf-8").splitlines()
    assert meta["ndjson"]["lines"] == len(lines) == len(full) == 3
    objs = [json.loads(x) for x in lines]            # every line is valid JSON on its own
    assert [o["k"] for o in objs] == sorted(o["k"] for o in objs)
    import hashlib
    assert hashlib.sha256(raw).hexdigest() == meta["ndjson"]["sha256"]
    acme = next(o for o in objs if o["k"] == "acme")
    assert acme["n"] == "Acme Corp"
    open_rec = next(r for r in acme["r"] if "t" not in r)
    assert open_rec["e"] == "2020-01-05" and open_rec["z"] == "c" and open_rec["s"] == "NY" and open_rec["d"] == "Acme Foods"
    closed = next(r for r in acme["r"] if "t" in r)
    assert closed["t"] == "2012-04-01" and closed["n"] == "ACME CORP."   # name kept when it differs
    old = next(o for o in objs if o["k"] == "old")
    assert old["r"][0]["z"] == "j" and "s" not in old["r"][0]            # empty fields omitted
    assert meta["ndjson"]["size_codes"]["j"] == "10,000 and over"
    murky = next(o for o in objs if o["k"] == "murky")["r"][0]
    assert murky["t"] == "2012-04-01" and murky["u"] == 1               # flagged unclear, not a clean "terminated"
    assert "u" not in old["r"][0] and "u" not in closed                  # real terminations carry no flag


def test_ndjson_gzip_is_reproducible():
    idx = {"acme": {"n": 1, "open": 1, "staffing": [], "recs": [{"name": "Acme", "enrolled": "2020-01-05", "status": "open"}]}}
    with tempfile.TemporaryDirectory() as d:
        p1, p2 = os.path.join(d, "1.gz"), os.path.join(d, "2.gz")
        build_index.write_ndjson_gz(idx, build_index.Path(p1))
        build_index.write_ndjson_gz(idx, build_index.Path(p2))
        assert open(p1, "rb").read() == open(p2, "rb").read()


def test_number_of_records_column_counts_records_and_coverage_is_capped_and_date_is_oldest_slice():
    hdr = HDR + ["Number of Records"]
    def write(path, rows):
        with open(path, "w", encoding="utf-16", newline="") as f:
            w = csv.writer(f, delimiter="\t"); w.writerow(hdr); w.writerows(rows)
    old = [["11/13/2026", "Acme Corp", "", "Open", "No", "01/05/2020", "", "10 to 19", "NY", "3"]]
    new = [["11/21/2026", "Beta Inc", "", "Open", "No", "01/06/2020", "", "5 to 9", "CA", "1"]]
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.csv"), os.path.join(d, "b.csv")
        write(a, old); write(b, new)
        out = os.path.join(d, "out")
        build_index.main(out, [a, b], expected=4)
        meta = json.load(open(os.path.join(out, "meta.json")))
        assert meta["records_in"] == 2 and meta["records_total"] == 4
        assert meta["coverage_pct"] == 99  # 4 of 4 would be 100, capped at 99
        assert meta["data_date"] == "2026-11-13"  # oldest slice, not the newest
        assert "nearly all" in meta["coverage_note"] and "2026-11-21" in meta["coverage_note"]
        build_index.main(out, [a, b], expected=8)
        meta = json.load(open(os.path.join(out, "meta.json")))
        assert meta["coverage_pct"] == 50 and "about 50%" in meta["coverage_note"]


def test_dotted_endings_are_also_filed_under_the_dotless_name():
    rows = [
        ["11/13/2026", "Bloomberg L.P.", "", "Open", "No", "06/04/2008", "", "10,000 and over", "NY"],
        ["11/13/2026", "Jasper Ridge Partners, L.P.", "", "Open", "No", "01/05/2020", "", "5 to 9", "CA"],
        ["11/13/2026", "Zed Bank, N.A.", "", "Open", "No", "01/05/2020", "", "5 to 9", "TX"],
        ["11/13/2026", "Plain Co", "", "Open", "No", "01/05/2020", "", "5 to 9", "TX"],
    ]
    with tempfile.TemporaryDirectory() as d:
        a = os.path.join(d, "a.csv"); write_slice(a, rows)
        out = os.path.join(d, "out")
        build_index.main(out, [a], expected=4)
        idx = json.load(open(os.path.join(out, "index.json")))
        meta = json.load(open(os.path.join(out, "meta.json")))
    assert idx["bloomberg"]["recs"][0]["name"] == "Bloomberg L.P."
    assert "bloomberg l p" in idx                       # the old key still works
    assert "jasper ridge partners" in idx and "zed bank" in idx
    assert "plain" in idx and meta["alias_new_keys"] == 3
