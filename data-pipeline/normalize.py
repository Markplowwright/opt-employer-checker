"""Company-name normalization for matching job-posting names against E-Verify records.

Goal: two names that refer to the same legal employer should normalize to the same
key. When unsure, DO NOT merge: a false "match" gives a student false confidence.
"""
import re
import unicodedata

# Legal-form suffixes that carry no identity. Removed only from the END of the name.
LEGAL_SUFFIXES = {
    "inc", "incorporated", "llc", "l l c", "llp", "lp", "ltd", "limited",
    "corp", "corporation", "co", "company", "plc", "pllc", "pc", "na", "gmbh",
}

# Words that suggest a staffing/consulting intermediary (used later for the flag, not for matching).
STAFFING_HINTS = {
    "staffing", "recruiting", "recruitment", "talent", "consulting", "consultants",
    "solutions", "workforce", "resources", "placement", "outsourcing",
}


def normalize_name(raw: str) -> str:
    """Lowercase, strip accents/punctuation, drop trailing legal suffixes, collapse spaces."""
    if not raw:
        return ""
    s = unicodedata.normalize("NFKD", raw)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)  # punctuation -> space
    tokens = s.split()
    while tokens and tokens[-1] in LEGAL_SUFFIXES:
        tokens.pop()
    # handle "l l c" style left after punctuation stripping
    while len(tokens) >= 3 and tokens[-3:] == ["l", "l", "c"]:
        tokens = tokens[:-3]
    return " ".join(tokens)


def staffing_hints(raw: str) -> set:
    """Return which staffing-style words appear in the name (weak signal only)."""
    return set(normalize_name(raw).split()) & STAFFING_HINTS
