# OPT Employer Checker (Chrome extension, v0.1.0)

Shows E-Verify and H-1B facts next to employers on LinkedIn job pages. Unofficial; not legal advice; not affiliated with DHS or USCIS.

## Try it (unpacked)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this `extension` folder.
3. Open a LinkedIn jobs page. Each job card and the selected job's employer get two chips: **E-Verify** and **H-1B**. Click a chip for the details popup (Esc or the X closes it).

## Chips
List cards get small chips on the job title line (`E-Verify` with a status icon, `H-1B <count>`; hover for the full wording). The selected job / single job page keeps the full-size chips next to the employer name. Click either for the details popup.

## Pages covered on LinkedIn
Jobs home, search results, job collections (recommended, similar), a single job page (`/jobs/view/...`), the job tracker / saved jobs, and a company's Jobs tab. Not yet: job posts inside the feed, and other job sites.
LinkedIn runs more than one layout at once, so the reader (`content/reader.js`) tries several independent methods and never depends on hashed class names. `test/fixtures/` holds a compact copy of each page type; if LinkedIn changes one, its test fails.

## How it works
- `content/reader.js` reads employer names from the page (fails quiet if LinkedIn changes its layout).
- `background.js` looks them up. Only a 3-character hash prefix of the normalized name is requested from the data site (GitHub Pages); company names never leave the browser.
- `content/view.js` turns a result into wording; `content/ui.js` draws chips and the popup in shadow DOM.
- Data comes from the shard files built by `data-pipeline/build_shards.py` and deployed by `.github/workflows/deploy-data-site.yml`.

## Rules the wording follows
Exact normalized-name matching only; "not found" is never a verdict; errors say "couldn't check"; every popup shows the data date, source links, "can't guarantee an I-983" and "ask your DSO".

## Tests
`npm install` then `npm test` (Node 22+).
