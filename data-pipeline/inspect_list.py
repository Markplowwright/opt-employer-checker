#!/usr/bin/env python3
"""Stage 1: inspect an E-Verify employer export (CSV).

Usage:  python3 inspect_list.py path/to/everify.csv

Prints the things we need to decide before building the index:
columns, row count, empty rates, sample rows, how many names collapse together
after normalization, and the most common name endings.
"""
import csv
import sys
from collections import Counter

from normalize import normalize_name


def main(path):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        rows = list(reader)

    print(f"File: {path}")
    print(f"Rows: {len(rows):,}")
    print(f"Columns ({len(cols)}): {cols}\n")

    print("Empty rate per column:")
    for c in cols:
        empty = sum(1 for r in rows if not (r.get(c) or "").strip())
        print(f"  {c:40s} {empty / max(len(rows), 1):6.1%}")

    print("\nFirst 5 rows:")
    for r in rows[:5]:
        print("  ", dict(r))

    # Guess the name column: first one containing 'name'.
    name_col = next((c for c in cols if "name" in c.lower()), cols[0] if cols else None)
    print(f"\nUsing '{name_col}' as the employer-name column (change in code if wrong).")

    keys = Counter(normalize_name(r.get(name_col, "")) for r in rows)
    dupes = sum(1 for k, n in keys.items() if k and n > 1)
    print(f"Distinct normalized names: {len(keys):,}")
    print(f"Normalized names shared by 2+ rows: {dupes:,}")
    print("Most-shared normalized names (check these by hand):")
    for k, n in keys.most_common(10):
        print(f"  {n:5d}  {k!r}")

    endings = Counter((r.get(name_col, "").split() or [""])[-1].lower().strip(".,") for r in rows)
    print("\nMost common last words in raw names (candidates for suffix list):")
    for w, n in endings.most_common(15):
        print(f"  {n:7d}  {w}")

    for c in cols:
        if "status" in c.lower():
            print(f"\nValues in '{c}':")
            for v, n in Counter((r.get(c) or "").strip() for r in rows).most_common(8):
                print(f"  {n:7d}  {v!r}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
