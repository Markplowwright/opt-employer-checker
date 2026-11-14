"""Drive the E-Verify Employer Search dashboard and export Crosstab CSV slices.

STATUS: the browser steps below are UNVERIFIED against the live page. The splitting logic
(slice_planner.py) is tested; this file is the part that needs a first real run.
Run it locally with a visible browser first:

    pip install playwright && playwright install chromium
    python export_slices.py --out slices --headed

Selectors live in SEL so they can be fixed in one place when the dashboard changes.
Tableau exports arrive as UTF-16 tab-separated text; build_index.py reads that format.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from slice_planner import TooLarge, plan_exports

URL = "https://www.e-verify.gov/e-verify-employer-search"

# TODO(verify on first run): the dashboard is embedded; find the real frame and labels.
SEL = {
    "frame": "iframe[src*='tableau'], iframe[title*='Employer' i], iframe",
    "date_dropdown": "text=Date Enrolled >> xpath=following::*[contains(@class,'tabComboBox') or @role='combobox'][1]",
    "date_last_radio": "text=Last",
    "download_button": "[data-tb-test-id='viz-viewer-toolbar-button-download'], [aria-label*='Download']",
    "crosstab_item": "text=Crosstab",
    "csv_radio": "text=CSV",
    "download_confirm": "button:has-text('Download')",
    "too_large": "text=exceeds the size allowed",
}


class Driver:
    def __init__(self, page, out_dir: Path):
        self.page = page
        self.out = out_dir
        self.n = 0

    def _frame(self):
        return self.page.frame_locator(SEL["frame"]).first

    def reset(self):
        self.page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        self.page.wait_for_timeout(8000)  # Tableau is slow to render

    def set_last_years(self, years: int = 30):
        f = self._frame()
        f.locator(SEL["date_dropdown"]).click()
        f.locator(SEL["date_last_radio"]).first.click()      # applies "Last 3 years"
        self.page.wait_for_timeout(15000)
        f.locator(SEL["date_dropdown"]).click()               # reopen to edit N
        box = f.locator("input[type='number'], input[type='text']").nth(0)
        box.fill(str(years))
        box.press("Enter")
        self.page.wait_for_timeout(20000)

    def apply_filters(self, filters: dict):
        # TODO(verify): state dropdown, E-Verify+ checkboxes, status checkboxes.
        f = self._frame()
        if "state" in filters:
            f.get_by_text("State/Territory").locator("xpath=following::*[1]").click()
            f.get_by_text(filters["state"], exact=True).first.click()
        if "plus" in filters:
            other = "No" if filters["plus"] == "Yes" else "Yes"
            f.get_by_label(other).first.uncheck()
        if "status" in filters:
            other = "Terminated" if filters["status"] == "Open" else "Open"
            f.get_by_label(other).first.uncheck()
        self.page.wait_for_timeout(15000)

    def export(self, filters: dict) -> str:
        self.reset()
        self.set_last_years(30)
        self.apply_filters(filters)
        f = self._frame()
        f.locator(SEL["download_button"]).first.click()
        f.locator(SEL["crosstab_item"]).first.click()
        f.locator(SEL["csv_radio"]).first.click()
        with self.page.expect_download(timeout=120000) as dl:
            f.locator(SEL["download_confirm"]).first.click()
            self.page.wait_for_timeout(8000)
            if f.locator(SEL["too_large"]).count():
                raise TooLarge
        self.n += 1
        label = "-".join(f"{k}={v}" for k, v in sorted(filters.items())) or "all"
        path = self.out / f"{self.n:03d}_{label}.csv"
        dl.value.save_as(path)
        return str(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="slices")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={"width": 1470, "height": 900})
        drv = Driver(page, out)
        try:
            results = plan_exports(drv.export)
        except Exception:
            # Leave evidence for debugging selectors: screenshot + page HTML.
            page.screenshot(path=str(out / "debug.png"), full_page=True)
            (out / "debug.html").write_text(page.content(), encoding="utf-8")
            raise
        finally:
            browser.close()
    print(f"exported {len(results)} slices to {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
