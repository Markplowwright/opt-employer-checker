# Chrome Web Store listing: OPT Employer Checker

Copy each block into the matching field in the Developer Dashboard.

## Store listing tab

**Name:** OPT Employer Checker

**Summary (max 132 characters; also the manifest description is shorter):**
E-Verify and H-1B info next to employers on LinkedIn job pages. Free, private and unofficial. Not legal advice.

**Category:** Productivity (or "Tools" if offered)  **Language:** English

**Detailed description:**

OPT Employer Checker adds two small chips next to the employer on LinkedIn job pages, so F-1 and STEM OPT job seekers can take a first look at an employer before applying.

• E-Verify chip: enrolled, enrollment ended, not found, or couldn't check.
• H-1B chip: how many H-1B petitions were approved for the employer in the latest full fiscal year.

Click a chip for the details: enrollment dates, a few years of H-1B history, the data date, and links to the official sources.

HONEST BY DESIGN
• Exact name matches only. A similar-looking name is never shown as a match.
• "Not found" is not a verdict. The E-Verify data covers about 99.6% of employers, so an enrolled employer can still be missing.
• If the data can't be loaded, the chip says "couldn't check", never "not enrolled".
• The data date and a source link are always shown.
• Some E-Verify enrollments cover only federal-contract work, and the panel says so.

PRIVATE
• Company names never leave your browser. The name is hashed on your computer and only the first 3 characters of the hash are used to request a small public data file.
• No accounts, no analytics, no ads, no tracking.

IMPORTANT
This tool cannot tell you whether an employer will sign an I-983 training plan, and it is not legal advice. Ask your DSO. It is an independent project, not affiliated with DHS, USCIS, E-Verify or LinkedIn. The data comes from the public E-Verify employer search and the USCIS H-1B Employer Data Hub.

Free and open source: https://github.com/Markplowwright/opt-employer-checker
About page and privacy policy: https://markplowwright.github.io/opt-employer-checker/

**Images** (all in this folder):
- Store icon: `extension/icons/icon-128.png`
- Screenshots, in this order: `screenshots/1-...` to `screenshots/5-...` (1280x800)
- Small promo tile: `promo-small-440x280.png` (440x280, required)
- Marquee (1400x560) and video: optional, skip for now

**Official URL / Homepage:** https://markplowwright.github.io/opt-employer-checker/
**Support URL:** https://github.com/Markplowwright/opt-employer-checker/issues

## Privacy practices tab

**Single purpose:**
Show E-Verify enrollment and H-1B petition information next to employer names on LinkedIn job pages.

**Permission justifications** (the manifest has no `permissions`, only these host accesses):
- `https://www.linkedin.com/*`: to read the employer name on the LinkedIn job page being viewed and to draw the E-Verify and H-1B chips next to it. The extension does nothing on any other site.
- `https://markplowwright.github.io/*`: to download the extension's public data files (static JSON) from the project's data site. Only a 3-character hash prefix is requested, never the company name.

**Remote code:** No, I am not using remote code. (The data files are static JSON, not code.)

**Data usage:** The extension reads the employer name shown on the page and processes it locally; it does not send the name, or anything about the user, to any server. Only a 3-character hash prefix is requested. Recommended answer: leave every data category unticked, and tick all three certifications (no selling to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending). If the dashboard wording makes you unsure, read it against the About page's Privacy section; the two must agree.

**Privacy policy URL:** https://markplowwright.github.io/opt-employer-checker/

## Distribution tab
- Visibility: **Unlisted** first (anyone with the link can install). Switch to Public after you have tested the installed version and are happy with the listing.
- Regions: all.

## Before you submit (checklist)
- [ ] Developer account: one-time $5 fee; the Google account needs 2-step verification on.
- [ ] Choose **non-trader** (free, non-commercial) when asked, so contact details are not published as a trader's.
- [ ] Use a contact/support email you are happy to have on the listing.
- [ ] Merge this PR, run **Deploy data site** once if `site/` changed, and open the About page to confirm it loads (it is the privacy policy URL).
- [ ] Build the zip: `sh store/build-zip.sh` (version comes from `extension/manifest.json`), and upload it.
- [ ] Load the same zip unpacked once and click through LinkedIn Jobs (list, detail, jobs home, a chip panel).
- [ ] Fill in the tabs above, then Submit for review. Review usually takes a few days; the first one can take longer.
- [ ] After approval: install from the Store link, test again, then consider switching to Public.
- [ ] Do not use the LinkedIn logo or name as the lead word in the listing, and keep the "unofficial, not affiliated" notice.
