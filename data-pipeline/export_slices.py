"""Drive the E-Verify Employer Search dashboard and export Crosstab CSV slices.

The E-Verify page embeds a Tableau Server view. We open that view directly (no
e-verify.gov wrapper, no iframe) and drive its quick filters and Download -> Crosstab.

Findings from CI logs (2026-11-14):
- view URL:  VIZ_URL below (host bigdataanalyticspub-sb.uscis.dhs.gov)
- quick filters are Tableau dijit widgets: combos have role=combobox / class tabComboBox,
  checkboxes are div[role=checkbox] with the label as text, the relative-date filter is a
  button showing its current value ("This year", "Last 30 years", ...)
- toolbar buttons carry data-tb-test-id (viz-viewer-toolbar-button-download)
- the employer list is not addressable as /views/<sheet>.csv (404), so UI export is needed
- Dashboard.csv only returns the small map sheet

Modes:
    python export_slices.py --out slices            # full export with adaptive splitting
    python export_slices.py --probe                 # open the date/state popups and print their
                                                    # elements (to fix selectors from the log)
Tableau exports arrive as UTF-16 tab-separated text; build_index.py reads that format.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from slice_planner import TooLarge, plan_exports

VIZ_URL = (
    "https://bigdataanalyticspub-sb.uscis.dhs.gov/views/"
    "E-VerifyEmployerSearch_17259895596010/Dashboard?:embed=y&:toolbar=yes"
)

SEL = {
    "combo": "[role=combobox]",                       # 0 = Industry Type, 1 = State/Territory
    "date_button": "button:has-text('This year'), button:has-text('Last '), button:has-text('Previous year')",
    "download_button": "[data-tb-test-id='viz-viewer-toolbar-button-download']",
    "crosstab_item": "text=Crosstab",
    "csv_radio": "text=CSV",
    "download_confirm": "button:has-text('Download')",
    "too_large": "text=exceeds the size allowed",
}

DUMP_JS = """() => [...document.querySelectorAll('*')]
  .filter(e => e.offsetParent !== null && e.children.length < 3)
  .map(e => [e.tagName, e.getAttribute('role'), (e.className||'').toString().slice(0,50),
             e.getAttribute('data-tb-test-id'), (e.getAttribute('aria-label')||e.innerText||e.value||'').toString().trim().slice(0,40)])
  .filter(r => r[4] || r[1] || r[3])
  .slice(0, 400).map(r => r.join(' ~ '))"""


def dump(page, title: str):
    print(f"=== DEBUG: {title} ===")
    print("url:", page.url.split("?")[0])
    try:
        for line in page.evaluate(DUMP_JS):
            print("   el:", line)
    except Exception as e:
        print("  (could not read page):", type(e).__name__)
    print("=== END DEBUG ===")


class Driver:
    def __init__(self, page, out_dir: Path):
        self.page = page
        self.out = out_dir
        self.n = 0

    def reset(self):
        self.page.goto(VIZ_URL, wait_until="domcontentloaded", timeout=120000)
        self.page.wait_for_selector(SEL["combo"], timeout=90000)
        self.page.wait_for_timeout(5000)

    def open_date(self):
        self.page.locator(SEL["date_button"]).first.click()
        self.page.wait_for_timeout(1500)

    def set_last_years(self, years: int = 30):
        self.open_date()
        self.page.get_by_text("Last", exact=True).first.click()   # applies "Last 3 years"
        self.page.wait_for_timeout(15000)
        self.open_date()
        box = self.page.locator("input[type='text'], input[type='number']").last
        box.fill(str(years))
        box.press("Enter")
        self.page.wait_for_timeout(20000)

    def apply_filters(self, filters: dict):
        if "state" in filters:
            self.page.locator(SEL["combo"]).nth(1).click()
            self.page.wait_for_timeout(1500)
            self.page.get_by_text(filters["state"], exact=True).first.click()
        for key, other_for in (("plus", {"Yes": "No", "No": "Yes"}),
                               ("status", {"Open": "Terminated", "Terminated": "Open"})):
            if key in filters:
                self.page.locator("[role=checkbox]", has_text=other_for[filters[key]]).first.click()
        self.page.wait_for_timeout(15000)

    def export(self, filters: dict) -> str:
        self.reset()
        self.set_last_years(30)
        self.apply_filters(filters)
        self.page.locator(SEL["download_button"]).first.click()
        self.page.locator(SEL["crosstab_item"]).first.click()
        self.page.locator(SEL["csv_radio"]).first.click()
        with self.page.expect_download(timeout=120000) as dl:
            self.page.locator(SEL["download_confirm"]).first.click()
            self.page.wait_for_timeout(8000)
            if self.page.locator(SEL["too_large"]).count():
                raise TooLarge
        self.n += 1
        label = "-".join(f"{k}={v}" for k, v in sorted(filters.items())) or "all"
        path = self.out / f"{self.n:03d}_{label}.csv"
        dl.value.save_as(path)
        return str(path)

    def probe(self):
        """Print the contents of the date popup and the state dropdown."""
        self.reset()
        dump(self.page, "page loaded")
        self.open_date()
        dump(self.page, "date popup open")
        self.page.keyboard.press("Escape")
        self.page.wait_for_timeout(1000)
        self.page.locator(SEL["combo"]).nth(1).click()
        self.page.wait_for_timeout(2000)
        dump(self.page, "state dropdown open")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="slices")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--probe", action="store_true")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={"width": 1470, "height": 900}, accept_downloads=True)
        drv = Driver(page, out)
        try:
            if args.probe:
                drv.probe()
                return 0
            results = plan_exports(drv.export)
        except Exception:
            dump(page, "failure")
            try:
                page.screenshot(path=str(out / "debug.png"), full_page=True)
            except Exception:
                pass
            raise
        finally:
            browser.close()
    print(f"exported {len(results)} slices to {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
