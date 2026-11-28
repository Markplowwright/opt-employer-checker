// Rule E: format-2 company-name key. MUST produce the same keys as data-pipeline/normalize_v2.py
// (checked on test/vectors2.json by both test suites). The older normalize.js is left untouched for format 1.
const LETTERS = { "ø": "o", "æ": "ae", "ß": "ss", "ł": "l", "đ": "d", "œ": "oe", "Ø": "o", "Æ": "ae", "Ł": "l", "Đ": "d", "Œ": "oe" };
const ENDINGS = new Set(["inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company",
  "pc", "pllc", "plc", "na", "subsidiaries", "affiliates", "dba"]);
const WEAK = new Set(["company", "co", "corp", "corporation"]);
const LEGAL_BEFORE_WEAK = new Set([...ENDINGS].filter((x) => !["affiliates", "subsidiaries", "dba"].includes(x) && !WEAK.has(x)));

const single = (t) => t != null && t.length === 1 && /^[a-z]$/.test(t);
const bigDigits = (t) => /^[0-9]{5,}$/.test(t);

function prep(s) {
  s = Array.from(s, (c) => LETTERS[c] ?? c).join("");
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function canonKey(raw) {
  if (!raw) return "";
  let s = prep(String(raw)).replaceAll("&amp;", " and ").replaceAll("&", " and ").replaceAll("+", " and ");
  s = s.replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ");
  const t = s.split(" ").filter(Boolean);
  const u = [];
  for (let j = 0; j < t.length; j++) {
    const x = t[j];
    if (x === "and") {
      const prev = j > 0 ? t[j - 1] : null;
      const nxt = j + 1 < t.length ? t[j + 1] : null;
      const rest = t.slice(j + 1);
      if (single(prev) && single(nxt)) { u.push("and"); continue; }
      if (rest.length && WEAK.has(rest[0]) && rest.slice(1).every((r) => LEGAL_BEFORE_WEAK.has(r) || bigDigits(r))) { u.push("and"); continue; }
      continue;
    }
    u.push(x);
  }
  let out = [], run = [];
  for (const x of [...u, null]) {
    if (x !== null && single(x)) { run.push(x); continue; }
    if (run.length) { out.push(run.join("")); run = []; }
    if (x !== null) out.push(x);
  }
  if (out.length > 1 && out[0] === "the") out = out.slice(1);
  while (out.length > 1 && (ENDINGS.has(out[out.length - 1]) || bigDigits(out[out.length - 1]))) out.pop();
  return out.join(" ");
}

// Python's re.split(r"(\s+|,)") keeps the separators; JS split with a capture group does the same.
export function strictKey(raw) {
  if (!raw) return "";
  const parts = String(raw).split(/(\s+|,)/);
  const out = parts.map((tk) => {
    const d = tk.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tk.replace(/^\.+|\.+$/g, "").includes(".") && ENDINGS.has(d)) return tk.replaceAll(".", "");
    return tk.replace(/(?<=[\p{L}\p{N}_])\.(?=[\p{L}\p{N}_])/gu, "xdotx");
  });
  return canonKey(out.join(""));
}

// Fallback key without a trailing us/usa, or null.
export function dropUs(key) {
  const t = key.split(" ");
  return t.length > 1 && (t[t.length - 1] === "us" || t[t.length - 1] === "usa") ? t.slice(0, -1).join(" ") : null;
}
