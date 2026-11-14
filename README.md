# OPT Employer Checker

Chrome extension (Manifest V3) that helps F-1 / STEM OPT job seekers spot employer
problems *before* they accept an offer. Version one, LinkedIn only:

1. E-Verify enrollment status (bundled data, no server, nothing about the user leaves the browser)
2. Staffing / consulting firm warning
3. A short "confirm before you accept" checklist (E-Verify, will they sign the I-983, who supervises, do they employ you directly)

**It cannot tell you an employer will sign an I-983.** Not legal advice. Your DSO is the authority.

## Layout
- `data-pipeline/` builds the bundled index from public data (Python, stdlib only)
- `extension/` the MV3 extension
- `docs/` notes and decisions

## Stage 1 (now)
Get the E-Verify employer data, then:

    cd data-pipeline
    python3 -m unittest            # name-normalization tests
    python3 inspect_list.py path/to/everify.csv
