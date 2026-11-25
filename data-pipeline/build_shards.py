"""Split the slim NDJSON index into hash-prefix shards for the extension.

Why: the extension should not download a 22 MB file. A lookup hashes the normalized
company name (SHA-256), takes the first PREFIX_HEX hex characters, and fetches just
that one small file. The host only ever sees the short prefix, never the company name
(the same idea as the Have I Been Pwned range API).

Input : index.ndjson.gz + meta.json from build_index.py
        optional: h1b.json + h1b_meta.json from fetch_h1b.py (--h1b <dir>); H-1B per-year totals are
        added to each shard entry as "h": {"<fiscal year>": [approved, denied]}, and companies that
        only appear in the H-1B data get their own entry with an empty "r" list.
Output: <out>/meta.json                      (small, fetched first, never cached long)
        <out>/<data_date>/<prefix>.json      (one JSON object per shard: {key: {n, f?, r}})

Every possible prefix gets a file (an empty shard is "{}"), so a 404 is always an error
and never "employer not found".

Usage: python build_shards.py <build_dir> <out_dir> [--h1b <h1b_dir>]
"""
import gzip
import hashlib
import json
import os
import sys

PREFIX_HEX = 3  # 16**3 = 4096 shards, about 8 KB gzipped each


def shard_prefix(key: str, prefix_hex: int = PREFIX_HEX) -> str:
    """First prefix_hex hex chars of SHA-256 of the UTF-8 key. The JS side must match."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:prefix_hex]


def all_prefixes(prefix_hex: int = PREFIX_HEX):
    return [format(i, "0{}x".format(prefix_hex)) for i in range(16 ** prefix_hex)]


def split_ndjson_gz(path, prefix_hex: int = PREFIX_HEX):
    """Return {prefix: {key: line_without_k}} from an index.ndjson.gz file."""
    shards = {p: {} for p in all_prefixes(prefix_hex)}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            obj = json.loads(line)
            key = obj.pop("k")
            shards[shard_prefix(key, prefix_hex)][key] = obj
    return shards


def h1b_compact(entry):
    """{fiscal year: [approved, denied]}; approved = initial + continuing + other."""
    out = {}
    for fy, y in entry["years"].items():
        out[fy] = [y["ia"] + y["ca"] + y["oa"], y["id"] + y["cd"] + y["od"]]
    return out


def merge_h1b(shards, h1b, prefix_hex: int = PREFIX_HEX):
    """Add H-1B totals to shard entries (in place). Returns how many H-1B-only companies were added."""
    added = 0
    for key, h in h1b.items():
        shard = shards[shard_prefix(key, prefix_hex)]
        entry = shard.get(key)
        if entry is None:
            entry = {"n": h["name"], "r": []}
            shard[key] = entry
            added += 1
        entry["h"] = h1b_compact(h)
        if h.get("staffing") and not entry.get("f"):
            entry["f"] = list(h["staffing"])
    return added


def write_shards(shards, out_dir, data_date, build_meta, prefix_hex: int = PREFIX_HEX, h1b_meta=None):
    """Write shard files and the top-level meta.json. Returns the meta dict."""
    total_bytes = 0
    biggest = 0
    keys = 0
    encoded = []
    digest = hashlib.sha256()
    for prefix in sorted(shards):
        content = shards[prefix]
        data = json.dumps(
            {k: content[k] for k in sorted(content)},
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        encoded.append((prefix, data))
        digest.update(prefix.encode() + b"\0" + data + b"\0")
        total_bytes += len(data)
        biggest = max(biggest, len(data))
        keys += len(content)
    # The folder name changes whenever any shard's content changes (not only the data date). The extension keeps
    # downloaded shards in the browser forever under their address, so a same-date rebuild (a fix, or a monthly
    # H-1B refresh) must get a new address or users would keep seeing the old data.
    version = data_date + "-" + digest.hexdigest()[:8]
    shard_dir = os.path.join(out_dir, version)
    os.makedirs(shard_dir, exist_ok=True)
    for prefix, data in encoded:
        with open(os.path.join(shard_dir, prefix + ".json"), "wb") as f:
            f.write(data)
    meta = {
        "data_date": data_date,
        "built": build_meta.get("built"),
        "shard_path": version + "/",
        "prefix_hex": prefix_hex,
        "shards": len(shards),
        "name_keys": keys,
        "raw_bytes": total_bytes,
        "largest_shard_raw_bytes": biggest,
        "source": build_meta.get("source"),
        "coverage_note": build_meta.get("coverage_note"),
        "coverage_pct": build_meta.get("coverage_pct"),
        "records_expected": build_meta.get("records_expected"),
        "size_codes": build_meta.get("ndjson", {}).get("size_codes"),
        "format": build_meta.get("ndjson", {}).get("format"),
        "ndjson_sha256": build_meta.get("ndjson", {}).get("sha256"),
    }
    if h1b_meta:
        years = h1b_meta["years_fetched"]
        meta["h1b_partial_fy"] = max(years)       # the newest fiscal year is still in progress
        meta["h1b_full_fy"] = max(years) - 1
        meta["h1b_built"] = h1b_meta.get("built")
        meta["h1b_source"] = h1b_meta.get("source")
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    return meta


def main(build_dir, out_dir, h1b_dir=None):
    with open(os.path.join(build_dir, "meta.json"), encoding="utf-8") as f:
        build_meta = json.load(f)
    shards = split_ndjson_gz(os.path.join(build_dir, "index.ndjson.gz"))
    expected = build_meta["ndjson"]["lines"]
    h1b_meta = None
    if h1b_dir:
        with open(os.path.join(h1b_dir, "h1b_meta.json"), encoding="utf-8") as f:
            h1b_meta = json.load(f)
        with open(os.path.join(h1b_dir, "h1b.json"), encoding="utf-8") as f:
            expected += merge_h1b(shards, json.load(f))
    meta = write_shards(shards, out_dir, build_meta["data_date"], build_meta, h1b_meta=h1b_meta)
    # Guard: every key from the inputs must have landed in a shard.
    if meta["name_keys"] != expected:
        sys.exit("shard key count {} != expected {}".format(meta["name_keys"], expected))
    print("shards:", meta["shards"], "keys:", meta["name_keys"],
          "raw MB:", round(meta["raw_bytes"] / 1e6, 1),
          "largest raw KB:", round(meta["largest_shard_raw_bytes"] / 1e3, 1))


if __name__ == "__main__":
    args = sys.argv[1:]
    h1b = None
    if "--h1b" in args:
        i = args.index("--h1b")
        h1b = args[i + 1]
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1], h1b)
