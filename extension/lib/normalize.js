// Company-name normalizer. MUST produce the same key as data-pipeline/normalize.py.
// Checked against name/key pairs taken from the real index (test/vectors.json).
const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "l l c", "llp", "lp", "ltd", "limited",
  "corp", "corporation", "co", "company", "plc", "pllc", "pc", "na", "gmbh",
]);

export function normalizeName(raw) {
  if (!raw) return "";
  let s = String(raw).normalize("NFKD").replace(/\p{M}/gu, "");
  s = s.toLowerCase().replaceAll("&", " and ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  let tokens = s.split(/\s+/).filter(Boolean);
  while (tokens.length && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  while (tokens.length >= 3 && tokens.slice(-3).join(" ") === "l l c") tokens = tokens.slice(0, -3);
  return tokens.join(" ");
}
