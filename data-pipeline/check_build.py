"""Safety gate: refuse to publish a build that looks broken.

Compares a fresh meta.json with the previous published one. A scrape that silently
returns half the data must never overwrite a good index.

Usage: python check_build.py NEW_META.json [PREV_META.json]
Exit 0 = OK to publish, 1 = block.
"""
import json
import sys

MIN_UNIQUE = 500_000      # raise as coverage improves; a 2026-only slice is ~92k
MAX_DROP = 0.10           # block if unique records fall more than 10%


def check(new: dict, prev: dict | None) -> list[str]:
    problems = []
    if new["records_unique"] < MIN_UNIQUE:
        problems.append(f"only {new['records_unique']} unique records (< {MIN_UNIQUE}): incomplete coverage")
    if prev and new["records_unique"] < prev["records_unique"] * (1 - MAX_DROP):
        problems.append(f"records fell {prev['records_unique']} -> {new['records_unique']} (> {MAX_DROP:.0%} drop)")
    return problems


if __name__ == "__main__":
    new = json.load(open(sys.argv[1]))
    prev = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
    probs = check(new, prev)
    for p in probs:
        print("BLOCK:", p)
    sys.exit(1 if probs else 0)
