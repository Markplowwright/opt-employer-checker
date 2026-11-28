"""Format-2 shards: regroup the E-Verify index by rule E (normalize_v2), add guarded brand (DBA) keys,
a strict-dots key where a legal name has dots inside it, and H-1B totals re-keyed with rule E.

Input : the format-1 build dir (index.ndjson.gz + meta.json) and optionally the H-1B dir.
Output: <out>/meta.json (format: 2) and <out>/<data_date>-<8hex>/<prefix>.json. Never writes into a format-1 tree.

Entry:  {"n": display name, "r": [record...], "f"?: staffing hints, "h"?: {fy: [approved, denied, new_hire_approved]}}
Record: as in format 1, plus "sk" (strict key) ONLY when it differs from the entry key (dots inside the legal name).
Brand entry (DBA): {"b": 1, "n": DBA text, "r": [records of the legal employer, each with "n"]} -- always shown purple.
Usage:  python build_shards_v2.py <build_dir> <out_dir> [--h1b <h1b_dir>] [--report <file>]
"""
import collections
import gzip
import json
import os
import re
import sys
import unicodedata

from build_shards import all_prefixes, shard_prefix, write_shards
from normalize_v2 import canon_key, strict_key

GENERIC = {"group", "services", "service", "company", "holdings", "partners", "solutions", "systems", "global",
           "international", "management", "financial", "health", "care", "center", "centre", "national", "american",
           "america", "united", "states", "state", "of", "and", "the", "for", "inc", "llc", "corp", "ltd", "bank",
           "capital", "advisors", "advisory", "consulting", "technologies", "technology", "industries", "enterprises",
           "associates", "insurance", "medical", "hospital", "school", "university", "college", "staffing",
           "logistics", "realty", "properties", "labs", "lab"}


def _toks(s):
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s).lower()).split()


def shares_distinctive_word(dba, legal):
    a = {t for t in _toks(dba) if len(t) >= 3 and t not in GENERIC}
    b = {t for t in _toks(legal) if len(t) >= 3 and t not in GENERIC}
    return bool(a & b)


def dba_guard(key, info, employer_keys):
    """Return None if the brand key may be used, else the guard that blocked it (G1..G5)."""
    t = key.split()
    if key in employer_keys:
        return "G1"                                  # a legal name always wins
    if re.search(r"\d|@", key) or key.startswith("dba "):
        return "G4"
    first_of_emp = any(e.split()[:1] == t[:1] for e in info["emp"])
    if len(key) < 4 or (len(t) == 1 and len(key) < 6 and not first_of_emp):
        return "G2"
    if len(info["emp"]) > 3:
        return "G3"
    if not any(shares_distinctive_word(d, legal) for d, legal in info["pairs"]):
        return "G5"
    return None


def regroup(path, stats):
    """{key: entry} from the format-1 index, regrouped by rule E; records keep their own legal name."""
    entries = {}
    dba = collections.defaultdict(lambda: {"emp": set(), "pairs": [], "recs": []})
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            obj = json.loads(line)
            line_name = obj["n"]
            for rec in obj["r"]:
                legal = rec.get("n") or line_name
                key = canon_key(legal)
                if not key:
                    stats["empty_key_records"] += 1
                    continue
                r = dict(rec)
                r["n"] = legal
                sk = strict_key(legal)
                if sk != key:
                    r["sk"] = sk
                    stats["sk_records"] += 1
                e = entries.setdefault(key, {"n": legal, "r": []})
                e["r"].append(r)
                if obj.get("f") and not e.get("f"):
                    e["f"] = obj["f"]
                d = rec.get("d")
                if d:
                    kd = canon_key(d)
                    if kd and kd != key:
                        info = dba[kd]
                        info["emp"].add(key)
                        info["pairs"].append((d, legal))
                        info["recs"].append((d, r))
    # shorten: drop "n" on a record when it equals the entry's display name (as format 1 did)
    for e in entries.values():
        for r in e["r"]:
            if r["n"] == e["n"]:
                del r["n"]
    return entries, dba


def add_brands(entries, dba, stats):
    kept = 0
    blocked = collections.Counter()
    employer_keys = set(entries)
    for kd, info in dba.items():
        g = dba_guard(kd, info, employer_keys)
        if g:
            blocked[g] += 1
            continue
        recs = []
        for d, r in info["recs"]:
            rr = dict(r)
            rr.setdefault("n", entries[canon_key(r.get("n") or "")]["n"] if r.get("n") else None)
            recs.append(rr)
        # brand entries carry the legal name on every record so the panel can show it
        for (d, r), rr in zip(info["recs"], recs):
            if not rr.get("n"):
                key = next(k for k in info["emp"])
                rr["n"] = entries[key]["n"]
        entries[kd] = {"b": 1, "n": info["pairs"][0][0], "r": recs}
        kept += 1
    stats["brand_entries"] = kept
    stats["brand_blocked"] = dict(blocked)


def h1b_v2(h1b):
    """Re-key H-1B employers with rule E; entries that collapse to one key are summed. [approved, denied, new]."""
    out = {}
    for old_key, h in h1b.items():
        key = canon_key(h["name"]) or None
        if not key:
            continue
        e = out.setdefault(key, {"name": h["name"], "h": {}, "staffing": h.get("staffing")})
        for fy, y in h["years"].items():
            cur = e["h"].setdefault(fy, [0, 0, 0])
            cur[0] += y["ia"] + y["ca"] + y["oa"]
            cur[1] += y["id"] + y["cd"] + y["od"]
            cur[2] += y["ia"]
    return out


def main(build_dir, out_dir, h1b_dir=None, report=None):
    stats = collections.Counter()
    with open(os.path.join(build_dir, "meta.json"), encoding="utf-8") as f:
        build_meta = json.load(f)
    entries, dba = regroup(os.path.join(build_dir, "index.ndjson.gz"), stats)
    stats["employer_keys"] = len(entries)
    add_brands(entries, dba, stats)
    h1b_meta = None
    if h1b_dir:
        with open(os.path.join(h1b_dir, "h1b_meta.json"), encoding="utf-8") as f:
            h1b_meta = json.load(f)
        with open(os.path.join(h1b_dir, "h1b.json"), encoding="utf-8") as f:
            merged = h1b_v2(json.load(f))
        for key, h in merged.items():
            e = entries.get(key)
            if e is None:
                e = {"n": h["name"], "r": []}
                entries[key] = e
                stats["h1b_only"] += 1
            elif e.get("b"):
                stats["h1b_on_brand"] += 1      # brand entry keeps its E-Verify records ("b") and gains the exact H-1B data
            e["h"] = h["h"]
            if h.get("staffing") and not e.get("f"):
                e["f"] = list(h["staffing"])
    shards = {p: {} for p in all_prefixes()}
    for key, e in entries.items():
        shards[shard_prefix(key)][key] = e
    meta = write_shards(shards, out_dir, build_meta["data_date"], build_meta, h1b_meta=h1b_meta)
    meta["format"] = 2
    meta["rule"] = "E"
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print("format 2 | shards:", meta["shards"], "keys:", meta["name_keys"], "raw MB:", round(meta["raw_bytes"] / 1e6, 1),
          "largest KB:", round(meta["largest_shard_raw_bytes"] / 1e3, 1))
    print("stats:", dict(stats))
    if report:
        with open(report, "w") as f:
            json.dump({"meta": meta, "stats": dict(stats)}, f, indent=1)


if __name__ == "__main__":
    a = sys.argv[1:]
    h1b = rep = None
    for flag in ("--h1b", "--report"):
        if flag in a:
            i = a.index(flag)
            val = a[i + 1]
            del a[i:i + 2]
            if flag == "--h1b":
                h1b = val
            else:
                rep = val
    if len(a) != 2:
        sys.exit(__doc__)
    main(a[0], a[1], h1b, rep)
