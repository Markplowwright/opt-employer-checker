"""Rule E: the format-2 company-name key. Replaces nothing: normalize.py (format 1) stays as is,
because the live data and the 1.0.0/1.0.1 extensions depend on it. extension/lib/normalize2.js must
produce identical keys (checked with the shared vectors in extension/test/vectors2.json).

canon_key(name)   loose key: dots and punctuation ignored. Used for lookup.
strict_key(name)  same, but dots inside a name are kept. Green needs the strict keys to match.
"""
import re
import unicodedata

# Letters NFKD does not decompose; applied before accent stripping, in Python and JS alike.
LETTERS = {"ø": "o", "æ": "ae", "ß": "ss", "ł": "l", "đ": "d", "œ": "oe", "Ø": "o", "Æ": "ae", "Ł": "l", "Đ": "d", "Œ": "oe"}

ENDINGS = {"inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company",
           "pc", "pllc", "plc", "na", "subsidiaries", "affiliates", "dba"}
WEAK = {"company", "co", "corp", "corporation"}          # "Clark & Company" must differ from "Clark"
LEGAL_BEFORE_WEAK = ENDINGS - {"affiliates", "subsidiaries", "dba"} - WEAK


def _single(t):
    return t is not None and len(t) == 1 and t.isalpha()


def _prep(s):
    s = "".join(LETTERS.get(c, c) for c in s)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def canon_key(raw):
    if not raw:
        return ""
    s = _prep(raw).replace("&amp;", " and ").replace("&", " and ").replace("+", " and ")
    s = re.sub(r"['’`]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    t = s.split()
    u = []
    for j, x in enumerate(t):
        if x == "and":
            prev = t[j - 1] if j > 0 else None
            nxt = t[j + 1] if j + 1 < len(t) else None
            rest = t[j + 1:]
            if _single(prev) and _single(nxt):
                u.append("and")                      # S&P stays different from SP
                continue
            if rest and rest[0] in WEAK and all(r in LEGAL_BEFORE_WEAK or (r.isdigit() and len(r) >= 5) for r in rest[1:]):
                u.append("and")                      # Clark & Company stays different from Clark
                continue
            continue
        u.append(x)
    out, run = [], []
    for x in u + [None]:
        if x is not None and _single(x):
            run.append(x)
            continue
        if run:
            out.append("".join(run))
            run = []
        if x is not None:
            out.append(x)
    t = out
    if len(t) > 1 and t[0] == "the":
        t = t[1:]
    while len(t) > 1 and (t[-1] in ENDINGS or (t[-1].isdigit() and len(t[-1]) >= 5)):
        t = t[:-1]
    return " ".join(t)


def strict_key(raw):
    """Like canon_key but dots inside a name survive; dotted legal endings (L.P., L.L.C., P.C.) are endings."""
    if not raw:
        return ""
    out = []
    for tk in re.split(r"(\s+|,)", raw):
        d = re.sub(r"[^a-z0-9]", "", tk.lower())
        if "." in tk.strip(".") and d in ENDINGS:
            tk = tk.replace(".", "")
        else:
            tk = re.sub(r"(?<=\w)\.(?=\w)", "xdotx", tk)
        out.append(tk)
    return canon_key("".join(out))


def drop_us(key):
    """Fallback key without a trailing us/usa, or None."""
    t = key.split()
    return " ".join(t[:-1]) if len(t) > 1 and t[-1] in ("us", "usa") else None
