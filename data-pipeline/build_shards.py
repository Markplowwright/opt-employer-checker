"""Split the slim NDJSON index into hash-prefix shards for the extension.

Why: the extension should not download a 22 MB file. A lookup hashes the normalized
company name (SHA-256), takes the first PREFIX_HEX hex characters, and fetches just
that one small file. The host only ever sees the short prefix, never the company name
(the same idea as the Have I Been Pwned range API).

Input : index.ndjson.gz + meta.json from build_index.py
Output: <out>/meta.json                      (small, fetched first, never cached long)
        <out>/<data_date>/<prefix>.json      (one JSON object per shard: {key: {n, f?, r}})

Every possible prefix gets a file (an empty shard is "{}"), so a 404 is always an error
and never "employer not found".

Usage: python build_shards.py <build_dir> <out_dir>
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


def write_shards(shards, out_dir, data_date, build_meta, prefix_hex: int = PREFIX_HEX):
    """Write shard files and the top-level meta.json. Returns the meta dict."""
    shard_dir = os.path.join(out_dir, data_date)
    os.makedirs(shard_dir, exist_ok=True)
    total_bytes = 0
    biggest = 0
    keys = 0
    for prefix, content in shards.items():
        data = json.dumps(
            {k: content[k] for k in sorted(content)},
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        with open(os.path.join(shard_dir, prefix + ".json"), "wb") as f:
            f.write(data)
        total_bytes += len(data)
        biggest = max(biggest, len(data))
        keys += len(content)
    meta = {
        "data_date": data_date,
        "built": build_meta.get("built"),
        "shard_path": data_date + "/",
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
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    return meta


def main(build_dir, out_dir):
    with open(os.path.join(build_dir, "meta.json"), encoding="utf-8") as f:
        build_meta = json.load(f)
    shards = split_ndjson_gz(os.path.join(build_dir, "index.ndjson.gz"))
    meta = write_shards(shards, out_dir, build_meta["data_date"], build_meta)
    # Guard: every key from the build must have landed in a shard.
    expected = build_meta["ndjson"]["lines"]
    if meta["name_keys"] != expected:
        sys.exit("shard key count {} != ndjson lines {}".format(meta["name_keys"], expected))
    print("shards:", meta["shards"], "keys:", meta["name_keys"],
          "raw MB:", round(meta["raw_bytes"] / 1e6, 1),
          "largest raw KB:", round(meta["largest_shard_raw_bytes"] / 1e3, 1))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
