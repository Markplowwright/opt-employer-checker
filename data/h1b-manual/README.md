# Hand-exported H-1B files (FY2024+)

USCIS only offers direct CSV links for FY2009-2023. FY2024 and later are exported by hand from the
USCIS H-1B Employer Data Hub ("Employer Information" tab, Download, set the fiscal year filter first),
converted from Excel to CSV, and gzipped. `fetch_h1b.py` prefers a file here over a download.

| File | Source export | Notes |
|---|---|---|
| h1b_datahubexport-2024.csv.gz | Hub export, exported 2026-11-14 | full fiscal year |
| h1b_datahubexport-2025.csv.gz | Hub export, exported 2026-11-14 | full fiscal year |
| h1b_datahubexport-2026.csv.gz | Hub export, exported 2026-11-14 | PARTIAL year (data through the Hub's latest update) |

Columns are the Hub's own (employer, city, state, tax ID, NAICS, and approvals/denials by petition type).
Rows with no employer name (USCIS hides names for very small filers) are skipped when building.
To refresh a year: re-export from the Hub, convert to CSV, gzip, and replace the file.
Unofficial data summary; not affiliated with or endorsed by USCIS or DHS.
