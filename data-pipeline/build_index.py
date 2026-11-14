"""Merge E-Verify dashboard Crosstab exports into one compact index.

Input : one or more Tableau Crosstab CSVs exported from the E-Verify Employer Search
        (UTF-16, tab-separated). Slices may overlap; records are de-duplicated.
Output: index.json (records grouped by normalized-name key) + meta.json (build info).

Usage:  python build_index.py OUT_DIR slice1.csv [slice2.csv ...]

Design rules (see docs/plan):
- Never merge on fuzzy similarity. Group only on the exact normalized name.
- Keep open AND terminated records so the UI can say "only terminated".
- Keep the raw employer name so the UI can show what E-Verify actually lists.
"""
import csv
import hashlib
import json
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from normalize import normalize_name, staffing_hints

KEEP = {
    "Employer": "name",
    "Doing Business As": "dba",
    "Account Status": "status",
    "Date Enrolled": "enrolled",
    "Date Terminated": "terminated",
    "Workforce Size": "size",
    "Hiring Site Locations": "states",
    "Opted into E-Verify+": "plus",
}


def iso(d: str) -> str:
    d = (d or "").strip()
    if not d:
        return ""
    try:
        return datetime.strptime(d, "%m/%d/%Y").date().isoformat()
    except ValueError:
        return ""


def read_slice(path: Path):
    with open(path, encoding="utf-16", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            rec = {new: (row.get(old) or "").strip() for old, new in KEEP.items()}
            rec["enrolled"] = iso(rec["enrolled"])
            rec["terminated"] = iso(rec["terminated"])
            rec["status"] = rec["status"].lower()  # "open" | "terminated"
            rec["plus"] = rec["plus"].lower() == "yes"
            if rec["states"] == "Null":
                rec["states"] = ""
            yield rec


def main(out_dir: str, slices: list[str]) -> None:
    seen = set()
    groups = defaultdict(list)
    total_in = 0
    for p in slices:
        for rec in read_slice(Path(p)):
            total_in += 1
            ident = (rec["name"].lower(), rec["enrolled"], rec["status"], rec["terminated"], rec["states"])
            if ident in seen:
                continue
            seen.add(ident)
            key = normalize_name(rec["name"])
            if key:
                groups[key].append(rec)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    index = {}
    for key, recs in groups.items():
        recs.sort(key=lambda r: (r["status"] != "open", r["enrolled"]), reverse=False)
        index[key] = {
            "open": sum(1 for r in recs if r["status"] == "open"),
            "n": len(recs),
            "staffing": sorted(staffing_hints(recs[0]["name"])),
            "recs": [
                {k: v for k, v in r.items() if v not in ("", False)} for r in recs
            ],
        }
    blob = json.dumps(index, separators=(",", ":"), sort_keys=True)
    (out / "index.json").write_text(blob, encoding="utf-8")
    meta = {
        "built": date.today().isoformat(),
        "source": "https://www.e-verify.gov/e-verify-employer-search",
        "records_in": total_in,
        "records_unique": len(seen),
        "name_keys": len(index),
        "sha256": hashlib.sha256(blob.encode()).hexdigest(),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
