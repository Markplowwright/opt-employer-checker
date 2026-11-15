"""Download USCIS H-1B Employer Data Hub yearly CSVs and build a compact per-employer summary.

Usage:  python fetch_h1b.py OUT_DIR [--from-dir RAW_DIR]
  default: download FY2009..FY(current+1) from uscis.gov, save raw files in OUT_DIR/raw
  --from-dir: skip downloading, read already-saved CSVs named h1b_datahubexport-<FY>.csv
  --manual-dir: folder of hand-exported files h1b_datahubexport-<FY>.csv.gz (default ../data/h1b-manual).
    FY2024+ are not offered as direct CSV links, so they are exported by hand from the Hub and stored
    here. A manual file wins over a download for the same year.

Writes OUT_DIR/h1b.json and OUT_DIR/h1b_meta.json. Years that could not be fetched are listed
in meta ("years_missing") - a missing year is NEVER silently treated as "no petitions".
H-1B data is a fact about PETITIONS filed (counts of approvals/denials), not a promise that an
employer will sponsor anyone, and says nothing about E-Verify or the I-983.
"""
import argparse, csv, datetime, gzip, hashlib, io, json, os, re, sys, urllib.request, urllib.error
from normalize import normalize_name, staffing_hints

URL = "https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-{fy}.csv"
FIRST_FY = 2009

# header (lowercased, punctuation stripped) -> canonical field. USCIS has renamed columns over the years.
HEADER_MAP = {
    "fiscal year": "fy", "employer": "name", "employer petitioner name": "name",
    "initial approval": "ia", "initial approvals": "ia", "initial denial": "id", "initial denials": "id",
    "continuing approval": "ca", "continuing approvals": "ca", "continuing denial": "cd", "continuing denials": "cd",
    "naics": "naics", "tax id": "tax", "state": "state", "city": "city", "zip": "zip",
    # FY2024+ hand-exported files use a finer breakdown. New employment -> initial, continuation -> continuing;
    # the other four petition types are summed into "other" (oa/od) so nothing is silently dropped.
    "petitioner state": "state", "petitioner city": "city", "petitioner zip code": "zip",
    "new employment approval": "ia", "new employment denial": "id",
    "continuation approval": "ca", "continuation denial": "cd",
    "change with same employer approval": "oa", "new concurrent approval": "oa",
    "change of employer approval": "oa", "amended approval": "oa",
    "change with same employer denial": "od", "new concurrent denial": "od",
    "change of employer denial": "od", "amended denial": "od",
}
SUM_FIELDS = {"ia", "id", "ca", "cd", "oa", "od"}
COUNTS = ("ia", "id", "ca", "cd", "oa", "od")


def decode(raw: bytes) -> str:
    if raw[:2] == b"\x1f\x8b":  # gzip
        raw = gzip.decompress(raw)
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def _canon(h: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", h.lower())).strip()


def _num(v) -> int:
    try:
        return int(str(v).replace(",", "").strip() or 0)
    except ValueError:
        return 0


def parse_csv(raw: bytes, fy_hint: int):
    """Return list of dicts with name, fy, ia, id, ca, cd, state. Raises ValueError if columns are unrecognised."""
    text = decode(raw)
    delim = "\t" if text.split("\n", 1)[0].count("\t") > text.split("\n", 1)[0].count(",") else ","
    rows = csv.reader(io.StringIO(text), delimiter=delim)
    header = next(rows, None)
    if not header:
        raise ValueError("empty file")
    cols = {i: HEADER_MAP[_canon(h)] for i, h in enumerate(header) if _canon(h) in HEADER_MAP}
    if "name" not in cols.values() or not {"ia", "ca"} & set(cols.values()):
        raise ValueError(f"unrecognised columns: {header[:12]}")
    out = []
    for r in rows:
        rec, sums = {}, dict.fromkeys(COUNTS, 0)
        for i, field in cols.items():
            if i >= len(r):
                continue
            if field in SUM_FIELDS:
                sums[field] += _num(r[i])
            else:
                rec[field] = r[i].strip()
        if not rec.get("name"):
            continue
        out.append({"name": rec["name"], "fy": _num(rec.get("fy")) or fy_hint,
                    "state": rec.get("state", ""), **sums})
    return out


def build(records):
    """Group by normalized name; sum counts per fiscal year. Exact normalized keys only (no fuzzy merge)."""
    idx = {}
    for r in records:
        key = normalize_name(r["name"])
        if not key:
            continue
        e = idx.setdefault(key, {"name": r["name"], "staffing": sorted(staffing_hints(r["name"])), "years": {}, "states": set()})
        y = e["years"].setdefault(str(r["fy"]), dict.fromkeys(COUNTS, 0))
        for k in COUNTS:
            y[k] += r.get(k, 0)
        if r["state"]:
            e["states"].add(r["state"])
    for e in idx.values():
        e["states"] = sorted(e["states"])
    return idx


def download(fy: int):
    req = urllib.request.Request(URL.format(fy=fy), headers={"User-Agent": "opt-employer-checker data refresh (github.com/Markplowwright/opt-employer-checker)"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--from-dir")
    ap.add_argument("--manual-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "h1b-manual"))
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    raw_dir = a.from_dir or os.path.join(a.out, "raw")
    os.makedirs(raw_dir, exist_ok=True)
    this_fy = datetime.date.today().year  # FY(N+1) starts in Oct N but has no data yet
    records, got, missing, errors, manual_years = [], [], [], {}, []
    for fy in range(FIRST_FY, this_fy + 1):
        path = os.path.join(raw_dir, f"h1b_datahubexport-{fy}.csv")
        manual = os.path.join(a.manual_dir, f"h1b_datahubexport-{fy}.csv.gz")
        try:
            if os.path.exists(manual):
                data = open(manual, "rb").read()
                manual_years.append(fy)
            elif not a.from_dir:
                data = download(fy)
                open(path, "wb").write(data)
            elif os.path.exists(path):
                data = open(path, "rb").read()
            else:
                raise FileNotFoundError(path)
            records += parse_csv(data, fy)
            got.append(fy)
        except (urllib.error.URLError, FileNotFoundError, ValueError) as e:
            missing.append(fy)
            errors[str(fy)] = str(e)[:200]
    idx = build(records)
    blob = json.dumps(idx, separators=(",", ":"), sort_keys=True)
    json.dump(idx, open(os.path.join(a.out, "h1b.json"), "w"), separators=(",", ":"), sort_keys=True)
    meta = {"built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "USCIS H-1B Employer Data Hub files",
            "years_fetched": got, "years_manual": manual_years, "years_missing": missing, "errors": errors,
            "schema_note": "FY2024+ are hand-exported with a finer breakdown: ia/id = new employment, ca/cd = continuation, oa/od = other petition types (changes, concurrent, amended). Older years use the Hub's initial/continuing columns, so initial/continuing may not match exactly across eras. FY2026 is a partial year.",
            "records_in": len(records), "name_keys": len(idx), "sha256": hashlib.sha256(blob.encode()).hexdigest()}
    json.dump(meta, open(os.path.join(a.out, "h1b_meta.json"), "w"), indent=2)
    print(json.dumps({k: meta[k] for k in ("years_fetched", "years_manual", "years_missing", "records_in", "name_keys")}))
    return 0 if got else 1


if __name__ == "__main__":
    sys.exit(main())
