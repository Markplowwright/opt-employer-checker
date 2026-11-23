# Case study: OPT Employer Checker

*A free Chrome extension that shows E-Verify and H-1B information next to employers on LinkedIn job pages. Built in about a week (first commit 2026-11-14), solo, at no cost, and released on the [Chrome Web Store](https://chromewebstore.google.com/detail/opt-employer-checker/jcdgingcdeeghlegpohgceclekoaacod) as v1.0.0 on 2026-11-21.*

## The problem

STEM OPT students need an employer that is enrolled in E-Verify and willing to sign an I-983 training plan. Finding out means leaving the job post, searching the E-Verify employer list by hand, and then doing the same for H-1B history on a second government site. That is a lot of friction at the stage where a mistake costs the most, and it is easy to put off until after the offer.

I was in that position myself, so I built the tool I wanted: the answer appears right on the LinkedIn job page.

## What it does

For each employer on a job card or job page, two chips appear: **E-Verify** (enrolled, ended, not found, couldn't check) and **H-1B** (petitions approved in the latest full fiscal year). Clicking a chip opens a panel with the enrollment dates, a few years of H-1B history, the data date, and links to the official sources.

It deliberately cannot say whether an employer will sign an I-983. The panel says so, and tells the student to ask their DSO.

## The decisions that mattered

**1. A wrong answer is worse than no answer.**
An "OK" on the wrong company could cost someone a job or their status, so the rules are strict:
- A match must be an **exact name match after normalizing** the name (case, accents, punctuation, and trailing legal suffixes such as "Inc" or "LLC"). There is no fuzzy matching, and nothing ever shows green on a near match.
- "Not found" is never shown as a "no". Our data covers about 77% of E-Verify employers, so the chip says "not found" and the panel explains that this is not a verdict.
- If the data can't be loaded, the chip says "couldn't check", never "not enrolled".
- The data date and the source link are always visible, because the data ages.

**2. Privacy by design: the company name never leaves the browser.**
The simple version sends the employer name to a server for lookup, which would also tell that server what jobs the student is looking at. Instead, the extension hashes the normalized name locally and requests only the first 3 hex characters of the hash. That selects one of 4,096 static data files ("shards"), each holding about 190 employers on average, so the host can't tell which employer was looked up. There are no accounts, no analytics and no server of my own.

**3. Free to run, forever.**
The shards are static files, so GitHub Pages hosts them at no cost, with no database or backend to maintain. They sit under a versioned path (`<data_date>/<prefix>.json`) so browsers can cache them indefinitely, and a small `meta.json` points to the current version. A GitHub Actions workflow builds and publishes them, with safety checks that refuse to publish a thin or mismatched dataset (it verifies a checksum of the download and a minimum number of keys and shards).

**4. Treat LinkedIn's page as hostile territory.**
LinkedIn runs several layouts at once and changes class names without notice. The reader tries several independent methods to find employer names, never relies on generated class names, and fails quietly if nothing matches. A compact copy of each page type is kept as a test fixture, so when LinkedIn changes one, a test fails instead of the extension silently going blank. The chips are drawn in a shadow DOM using text only, so page styles can't break them and nothing from the page is injected as HTML.

**5. Be careful with other people's data.**
The raw government files are not committed to the repository. The pipeline downloads the public data, normalizes it, and publishes only the derived shards. The extension and the About page state clearly that it is unofficial and not affiliated with DHS, USCIS, E-Verify or LinkedIn.

## By the numbers

- 766,059 normalized E-Verify employer names, covering about 76.7% of the 1,281,054 employers the E-Verify dashboard lists (as of 2026-11-13).
- H-1B data from the USCIS Employer Data Hub for FY2009 to FY2026, about 376,000 employer names.
- 4,096 shards, so a lookup downloads one small file.
- 52 extension tests and a set of data-pipeline tests, with the build and deploy automated in GitHub Actions.
- Data pipeline in Python (standard library only), extension in plain JavaScript (Manifest V3), no frameworks.

## What I'd say about the limits

- Coverage is 76.7%, not 100%. Employers missing from the data show as "not found", and the interface is designed around that.
- Names are matched exactly. An employer filed under a slightly different legal name won't match. That is a deliberate trade: a missed match is safer than a wrong one.
- Some E-Verify enrollments cover only federal-contract work, so an enrollment on file may not apply to the job.
- It only works on LinkedIn, and LinkedIn can break it. The fixtures tell me quickly when it does.

## What I learned

- Designing the wording and the failure states was as much of the work as the code. The hardest cases were not "enrolled" and "not enrolled" but "we don't know".
- Privacy constraints made the architecture simpler, not harder: hash-prefix shards on a static host removed the need for any backend.
- Small visual details matter in someone else's page. Getting the chips to sit next to the company name across LinkedIn's layouts, at a size that fits on a crowded card, took several rounds of design and testing.

## What's next

Version 1.0.0 is live on the Chrome Web Store. From here:

- **Fresher data.** The E-Verify data is dated 2026-11-13 and is refreshed by hand, because the official E-Verify dashboard offers no bulk download. Keeping the data date visible matters more as it ages.
- **An employer search page**, including "similar names" for the cases an exact match misses, so students can look up an employer without a LinkedIn post.
- **More job sites** beyond LinkedIn.
- **A wider audience.** The tool is useful to any F-1 student on OPT, not only STEM OPT, and the Store listing may be widened to say so.

---

Install: [Chrome Web Store](https://chromewebstore.google.com/detail/opt-employer-checker/jcdgingcdeeghlegpohgceclekoaacod) · Code: [github.com/Markplowwright/opt-employer-checker](https://github.com/Markplowwright/opt-employer-checker) · About page: <https://markplowwright.github.io/opt-employer-checker/>
