# OPT Employer Checker (Chrome extension, v0.1.0)

Shows E-Verify and H-1B facts next to employers on LinkedIn job pages. Unofficial; not legal advice; not affiliated with DHS or USCIS.

## Try it (unpacked)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this `extension` folder.
3. Open a LinkedIn jobs page (`linkedin.com/jobs/...`). Each job card and the selected job's detail pane get two chips: **E-Verify** and **H-1B**. Click a chip for the details popup (Esc or the X closes it).

## How it works
- `content/reader.js` reads employer names from the page (fails quiet if LinkedIn changes its layout).
- `background.js` looks them up. Only a 3-character hash prefix of the normalized name is requested from the data site (GitHub Pages); company names never leave the browser.
- `content/view.js` turns a result into wording; `content/ui.js` draws chips and the popup in shadow DOM.
- Data comes from the shard files built by `data-pipeline/build_shards.py` and deployed by `.github/workflows/deploy-data-site.yml`.

## Rules the wording follows
Exact normalized-name matching only; "not found" is never a verdict; errors say "couldn't check"; every popup shows the data date, source links, "can't guarantee an I-983" and "ask your DSO".

## Tests
`npm install` then `npm test` (Node 22+).
