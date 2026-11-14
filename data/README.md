# data/

- `raw/`   E-Verify dashboard Crosstab exports, exactly as downloaded (UTF-16, tab-separated). Never edit these.
           Name files `YYYY-MM-DD_<what-was-filtered>_crosstab.csv`.
- `build/` Output of `data-pipeline/build_index.py` (index.json, meta.json). Rebuildable from raw/.

Current contents: the 2026 "enrolled this year" slice (92,260 rows, exported 2026-11-13). This is NOT full
coverage; the full set is ~1.28M records and must be exported in slices (see data-pipeline/slice_planner.py).
Source: https://www.e-verify.gov/e-verify-employer-search  (terms of bulk reuse not yet confirmed).
