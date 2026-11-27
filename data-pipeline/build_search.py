"""Build the data for the search page: one row per company, E-Verify and H-1B together.

Why chunks: a search should download about 100 KB, not the whole dataset. Rows are sorted by
normalized key and cut into fixed-size chunks. A small fence index lists the first key of each
chunk, so a prefix like "equinox" needs the fence plus one to three chunks.

Inputs : index.ndjson.gz (E-Verify, from build_index.py), h1b.json + h1b_meta.json (from fetch_h1b.py)
Output : <out>/search/<data_date>/index.json   (the fence)
         <out>/search/<data_date>/cNNN.json    (arrays of rows)

Keys come from normalize_name, so both datasets join on the same key. The union is used so a
company that sponsors H-1Bs but is missing from E-Verify still appears.

Row (JSON array), see ROW_FIELDS:
  key, display name, E-Verify records, E-Verify records open, largest size code, states (up to 6),
  latest enrollment year, H-1B approvals in the last full fiscal year, H-1B approvals in the
  current (partial) fiscal year, staffing hint (0/1)
E-Verify status is derived by the page: 0 records = not found, any open = enrolled, else ended.

Usage: python build_search.py <build_dir> <h1b_dir> <out_dir> [rows_per_chunk]
"""
import bisect
import gzip
import json
import os
import sys

ROWS_PER_CHUNK = 3000
MAX_STATES = 6
ROW_FIELDS = ["key", "name", "ev_total", "ev_open", "size", "states",
              "enrolled_year", "h1b_full", "h1b_partial", "staffing"]


def approvals(year_rec):
    """H-1B approvals for one fiscal year (initial + continuing + other)."""
    return year_rec["ia"] + year_rec["ca"] + year_rec["oa"] if year_rec else 0


def everify_row(key, line):
    recs = line["r"]
    open_n = sum(1 for r in recs if "t" not in r or r.get("u"))
    sizes = [r["z"] for r in recs if r.get("z")]
    states = sorted({s for r in recs for s in (r.get("s") or "").split(",") if s})
    years = [int(r["e"][:4]) for r in recs if r.get("e")]
    return {
        "name": line["n"], "ev_total": len(recs), "ev_open": open_n,
        "size": max(sizes) if sizes else "",   # size codes a..j sort in size order
        "states": states, "enrolled_year": max(years) if years else 0,
        "staffing": 1 if line.get("f") else 0,
    }


def combine(ev_rows, h1b, full_fy, partial_fy):
    """Union of E-Verify rows (dict key -> row) and H-1B (dict key -> entry). Returns sorted rows."""
    out = {}
    for key, r in ev_rows.items():
        out[key] = dict(r)
    for key, h in h1b.items():
        r = out.get(key)
        if r is None:
            r = {"name": h["name"], "ev_total": 0, "ev_open": 0, "size": "", "states": sorted(h.get("states") or []),
                 "enrolled_year": 0, "staffing": 1 if h.get("staffing") else 0}
            out[key] = r
        elif h.get("staffing"):
            r["staffing"] = 1
        r["h1b_full"] = approvals(h["years"].get(str(full_fy)))
        r["h1b_partial"] = approvals(h["years"].get(str(partial_fy)))
    rows = []
    for key in sorted(out):
        r = out[key]
        rows.append([key, r["name"], r["ev_total"], r["ev_open"], r["size"],
                     ",".join(r["states"][:MAX_STATES]), r["enrolled_year"],
                     r.get("h1b_full", 0), r.get("h1b_partial", 0), r["staffing"]])
    return rows


def chunk_rows(rows, per_chunk=ROWS_PER_CHUNK):
    return [rows[i:i + per_chunk] for i in range(0, len(rows), per_chunk)]


def fence_for(chunks):
    """List of {f, first, n}: file name, first key, row count. Keys are ASCII, so Python and JS sort alike."""
    return [{"f": "c%03d.json" % i, "first": c[0][0], "n": len(c)} for i, c in enumerate(chunks)]


def chunks_for_prefix(fence, prefix):
    """Indexes of chunks that can hold keys starting with prefix. Same algorithm the page uses."""
    firsts = [f["first"] for f in fence]
    i = max(0, bisect.bisect_right(firsts, prefix) - 1)
    out = [i]
    j = i + 1
    while j < len(fence) and fence[j]["first"].startswith(prefix):
        out.append(j)
        j += 1
    return out


def write_search(rows, out_dir, build_meta, h1b_meta, full_fy, partial_fy, per_chunk=ROWS_PER_CHUNK):
    data_date = build_meta["data_date"]
    d = os.path.join(out_dir, "search", data_date)
    os.makedirs(d, exist_ok=True)
    chunks = chunk_rows(rows, per_chunk)
    fence = fence_for(chunks)
    total = 0
    for i, c in enumerate(chunks):
        data = json.dumps(c, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        total += len(data)
        with open(os.path.join(d, fence[i]["f"]), "wb") as f:
            f.write(data)
    index = {
        "data_date": data_date, "built": build_meta.get("built"),
        "rows": len(rows), "chunks": fence, "row_fields": ROW_FIELDS,
        "h1b_full_fy": full_fy, "h1b_partial_fy": partial_fy,
        "h1b_built": h1b_meta.get("built"),
        "size_codes": build_meta.get("ndjson", {}).get("size_codes"),
        "coverage_note": build_meta.get("coverage_note"),
        "raw_bytes": total,
    }
    with open(os.path.join(d, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    return index


def load_everify(path):
    rows = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            o = json.loads(line)
            rows[o["k"]] = everify_row(o["k"], o)
    return rows


def main(build_dir, h1b_dir, out_dir, per_chunk=ROWS_PER_CHUNK):
    with open(os.path.join(build_dir, "meta.json"), encoding="utf-8") as f:
        build_meta = json.load(f)
    with open(os.path.join(h1b_dir, "h1b_meta.json"), encoding="utf-8") as f:
        h1b_meta = json.load(f)
    with open(os.path.join(h1b_dir, "h1b.json"), encoding="utf-8") as f:
        h1b = json.load(f)
    partial_fy = max(h1b_meta["years_fetched"])
    full_fy = partial_fy - 1
    ev = load_everify(os.path.join(build_dir, "index.ndjson.gz"))
    rows = combine(ev, h1b, full_fy, partial_fy)
    index = write_search(rows, out_dir, build_meta, h1b_meta, full_fy, partial_fy, per_chunk)
    print("rows:", index["rows"], "chunks:", len(index["chunks"]),
          "raw MB:", round(index["raw_bytes"] / 1e6, 1),
          "| E-Verify keys:", len(ev), "H-1B keys:", len(h1b))
    return index


if __name__ == "__main__":
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) == 5 else ROWS_PER_CHUNK)
