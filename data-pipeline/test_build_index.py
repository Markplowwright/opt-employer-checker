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
    assert meta["data_date"] == "2026-11-13" and meta["coverage_pct"] == 37.5
    assert idx["acme"]["recs"][0]["name"] == "Acme Corp"
    soon = idx["soon gone"]["recs"][0]
    assert soon["status"] == "open" and "ends" in soon and "terminated" not in soon
    assert idx["old"]["recs"][0]["terminated"] == "2012-04-01"
