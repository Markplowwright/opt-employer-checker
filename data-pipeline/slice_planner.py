"""Adaptive slicing for the E-Verify dashboard export.

The dashboard refuses crosstab exports above a size limit ("The crosstab exceeds the
size allowed"). We don't know the limit, so we start with the whole data set and split
by one filter dimension at a time only when an export is rejected. This keeps the number
of exports small today and still works as the data grows.

Pure logic, no browser: `export` is any callable (filters -> path) that raises
TooLarge when the dashboard rejects the slice. That makes it testable offline.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

US_STATES = (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT "
    "NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY "
    "AS GU MP PR VI"
).split()

# Order matters: cheapest/most even split first.
DIMENSIONS: list[tuple[str, tuple[str, ...]]] = [
    ("state", tuple(US_STATES)),
    ("plus", ("Yes", "No")),
    ("status", ("Open", "Terminated")),
]


class TooLarge(Exception):
    """The dashboard rejected this slice as too big to export."""


class Unsplittable(Exception):
    """A slice is still too large after splitting on every dimension."""


@dataclass(frozen=True)
class Slice:
    filters: tuple  # ((dimension, value), ...)

    def label(self) -> str:
        return "all" if not self.filters else "-".join(f"{d}={v}" for d, v in self.filters)


def plan_exports(
    export: Callable[[dict], str],
    dims: list[tuple[str, tuple[str, ...]]] = DIMENSIONS,
    _filters: tuple = (),
    _depth: int = 0,
) -> list[tuple[Slice, str]]:
    """Return [(slice, exported_path)] covering the whole data set exactly once."""
    sl = Slice(_filters)
    try:
        return [(sl, export(dict(_filters)))]
    except TooLarge:
        if _depth >= len(dims):
            raise Unsplittable(f"still too large with filters {sl.label()}")
    name, values = dims[_depth]
    out: list[tuple[Slice, str]] = []
    for v in values:
        out += plan_exports(export, dims, _filters + ((name, v),), _depth + 1)
    return out
