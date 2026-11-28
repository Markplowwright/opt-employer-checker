// Turns a lookup result into what the chips and popup show. Pure functions, no DOM: easy to test.
// Rules: "not found" is not a verdict; green only for an exact normalized-name match (the lookup is exact-only);
// every state carries the data date; errors are "couldn't check", never "not found".
(function (root) {
  var SIZE = { a: "1 to 4", b: "5 to 9", c: "10 to 19", d: "20 to 99", e: "100 to 499", f: "500 to 999",
    g: "1,000 to 2,499", h: "2,500 to 4,999", i: "5,000 to 9,999", j: "10,000 and over" };

  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  // A record is open when the dashboard lists no end date, or says Open although an earlier end date exists (u=1).
  function isOpen(r) { return !r.t || !!r.u; }

  // Format 2 status of one record against the DATA date (not today): open | scheduled (future end) | unclear (open, end date passed) | ended.
  function recState(r, dataDate) {
    if (r.t && !r.u) return "ended";
    if (r.u) return "unclear";
    if (r.x) return !dataDate || r.x > dataDate ? "scheduled" : "unclear";
    return "open";
  }

  function recordRows(recs, head, dataDate) {
    return recs.map(function (r) {
      var meta = [];
      if (r.s) meta.push(r.s.split(",").length > 6 ? r.s.split(",").slice(0, 6).join(", ") + " +" + (r.s.split(",").length - 6) : r.s.split(",").join(", "));
      if (r.z && SIZE[r.z]) meta.push(SIZE[r.z]);
      if (r.n && r.n !== head) meta.push('as "' + r.n + '"');
      if (r.u) meta.push("an earlier end date is also listed");
      var tag = !isOpen(r) ? "Ended " + r.t : (r.x ? "Ends " + r.x : "Open");
      var st = recState(r, dataDate), tone = st === "open" ? "ok" : st === "ended" ? "ended" : "warn";
      if (dataDate && st === "unclear") tag = "Unclear";
      return { enrolled: r.e || "", meta: meta.join(" · "), tag: tag, open: isOpen(r), tone: tone, state: st };
    }).sort(function (a, b) { return a.open === b.open ? (a.enrolled < b.enrolled ? 1 : -1) : (a.open ? -1 : 1); });
  }

  function h1bView(entry, meta) {
    if (!meta || meta.h1b_full_fy == null) return { available: false };
    var h = entry && entry.h;
    var full = String(meta.h1b_full_fy), part = String(meta.h1b_partial_fy);
    var fullN = h && h[full] ? h[full][0] : 0, partN = h && h[part] ? h[part][0] : 0;
    var bars = [];
    if (h) {
      var years = Object.keys(h).map(Number).sort(function (a, b) { return a - b; }).slice(-4);
      bars = years.map(function (y) { return { label: "FY" + y + (String(y) === part ? "*" : ""), value: h[y][0], partial: String(y) === part }; });
    }
    var chip, aria;
    if (!h) { chip = "H-1B: none found"; aria = "No H-1B approvals found under this exact name"; }
    else if (fullN > 0) { chip = "H-1B: " + fmt(fullN) + " · FY" + full; aria = fmt(fullN) + (fullN === 1 ? " H-1B petition" : " H-1B petitions") + " approved in FY" + full; }
    else if (partN > 0) { chip = "H-1B: " + fmt(partN) + " · FY" + part + "*"; aria = fmt(partN) + (partN === 1 ? " H-1B petition" : " H-1B petitions") + " approved so far in FY" + part + ", a partial year"; }
    else { chip = "H-1B: 0 · FY" + full; aria = "No H-1B petitions approved in FY" + full; }
    var all = 0; if (h) Object.keys(h).forEach(function (y) { all += h[y][0]; });
    var firstYear = h ? Math.min.apply(null, Object.keys(h).map(Number)) : null;
    var note = !h ? "No H-1B records under this exact name. Spelling variants are not merged."
      : "All years since FY" + firstYear + ": " + fmt(all) + ". *FY" + part + " is partial.";
    var short = !h ? "" : fullN > 0 ? "H-1B FY" + full + ": " + fmt(fullN) : partN > 0 ? "H-1B FY" + part + "*: " + fmt(partN) : "H-1B FY" + full + ": 0";
    var mini = !h ? "H-1B 0" : fullN > 0 ? "H-1B " + fmt(fullN) : partN > 0 ? "H-1B " + fmt(partN) + "*" : "H-1B 0";
    return { available: true, chip: chip, mini: mini, aria: aria, bars: bars, note: note, short: short, scope: "exact name only" };
  }

  var LEGAL_NOTE = "This is a lead, not a confirmed match. Check the legal employer name on your offer letter or Form I-983.";
  var KIND_HEAD = {
    brand: function (n) { return "Brand match: E-Verify lists this employer as \u201c" + n + "\u201d."; },
    dots: function (n) { return "Same name apart from punctuation. E-Verify lists \u201c" + n + "\u201d."; },
    us: function (n) { return "Same name without \u201cUS\u201d. E-Verify lists \u201c" + n + "\u201d."; },
    paren: function (n) { return "Matched without, or inside, the brackets. E-Verify lists \u201c" + n + "\u201d."; },
    part: function (n) { return "Matched one part of the name, split at a comma. E-Verify lists \u201c" + n + "\u201d."; }
  };

  // Format-2 results (see lib/shards2.js). Green only for an exact name; everything else is a lead (purple).
  function buildView2(name, result) {
    var meta = result.meta || {}, date = meta.data_date || "";
    if (result.unsupported) {
      return { name: name, key: "", tone: "error", chip: "Couldn\u2019t check", eChip: "E-Verify: couldn\u2019t check", eAria: "E-Verify: couldn\u2019t check this name",
        headline: "We can\u2019t look this name up.", note: "The name has no Latin letters or digits, so it cannot be matched. This does not mean the employer is not enrolled.",
        records: [], h1b: { available: false }, staffing: "", dataDate: date, searchedFor: "" };
    }
    var h1bEntry = result.h1b || null;
    var kind = result.found ? result.matchKind : null;
    var h1b = h1bView(h1bEntry, meta);
    var entry = result.found ? result.entry : null;
    var recs = result.found ? result.records : [];
    var legal = (recs[0] && recs[0].n) || (entry && entry.n) || name;
    if (result.h1bVia && h1b.available) {   // the counts belong to the related name, not to the name on the page
      h1b.scope = "related name";
      h1b.aria += " (counted under a related name)";
      h1b.note = "Counted under the related name \u201c" + ((h1bEntry && h1bEntry.n) || legal) + "\u201d, not under \u201c" + name + "\u201d. " + h1b.note;
    }
    var staffing = entry && entry.f && entry.f.length
      ? 'The name contains "' + entry.f[0] + '", a weak hint. A W-2 staffing employer can sign an I-983 only if it is enrolled and provides and supervises your training itself.' : "";
    var base = { name: name, key: result.key, records: recordRows(recs, entry && entry.n, date), h1b: h1b, staffing: staffing, dataDate: date, displayName: legal, matchKind: kind };
    if (!result.found) {
      return Object.assign(base, { tone: "none", chip: "Not found", eChip: "E-Verify: not found", eAria: "E-Verify: not found in our data",
        headline: "No match in our E-Verify data.",
        note: "Not found is not a verdict. Our data covers about " + (meta.coverage_pct || 77) + "% of E-Verify employers and the employer may use another legal name. Ask the employer for their E-Verify company ID." });
    }
    if (kind !== "exact") {
      var n = recs.length;
      return Object.assign(base, { tone: "related", chip: "Related name", eChip: "E-Verify: related name" + (n > 1 ? "s (" + n + ")" : ""),
        eAria: "E-Verify: a related name is enrolled, not an exact match", headline: KIND_HEAD[kind](legal), note: LEGAL_NOTE });
    }
    var states = recs.map(function (r) { return recState(r, date); });
    var has = function (x) { return states.indexOf(x) >= 0; };
    if (has("open")) {
      var latest = recs.filter(function (r, i) { return states[i] === "open"; }).map(function (r) { return r.e || ""; }).sort().pop();
      var ended = states.filter(function (x) { return x === "ended"; }).length;
      return Object.assign(base, { tone: "ok", chip: "Enrolled", eChip: "E-Verify: enrolled", eAria: "E-Verify: enrolled", headline: "Enrolled, no end date listed.",
        note: "An enrollment started " + latest + " is open." + (ended ? " " + ended + " earlier " + (ended === 1 ? "enrollment has" : "enrollments have") + " ended." : "") });
    }
    if (has("scheduled")) {
      var ends = recs.filter(function (r, i) { return states[i] === "scheduled"; }).map(function (r) { return r.x; }).sort()[0];
      return Object.assign(base, { tone: "warn", chip: "Enrolled, ends " + ends, eChip: "E-Verify: enrolled, ends " + ends, eAria: "E-Verify: enrolled, with an end date of " + ends,
        headline: "Enrolled, with an end date listed: " + ends + ".", note: "The dashboard lists this enrollment as open with a future end date. Ask the employer whether it will continue." });
    }
    if (has("unclear")) {
      return Object.assign(base, { tone: "warn", chip: "Enrolled, unclear", eChip: "E-Verify: enrolled, unclear", eAria: "E-Verify: listed as open, but an end date has passed",
        headline: "Listed as open, but an end date has passed.", note: "The dashboard says Open and also lists an end date that is already past, so the status is unclear. Ask the employer for their E-Verify company ID." });
    }
    var lastEnd = recs.map(function (r) { return r.t; }).sort().pop();
    return Object.assign(base, { tone: "ended", chip: "Enrollment ended", eChip: "E-Verify: this name ended", eAria: "E-Verify: enrollment under this exact name ended",
      headline: (recs.length === 1 ? "The only enrollment under this exact name ended " : "The latest enrollment under this exact name ended ") + lastEnd + ".",
      note: "Other legal entities of this employer may be enrolled, so check the legal employer name. Our data covers about " + (meta.coverage_pct || 77) + "% of E-Verify employers." });
  }

  function buildView(name, result) {
    if (result && !result.error && (result.unsupported || result.matchKind || (result.meta && result.meta.format === 2))) return buildView2(name, result);
    var date = (result && result.meta && result.meta.data_date) || "";
    if (!result || result.error) {
      return { name: name, key: result && result.key || "", tone: "error", chip: "Couldn’t check",
        eChip: "E-Verify: couldn’t check", eAria: "E-Verify: couldn’t check right now",
        headline: "We couldn’t reach the data right now.",
        note: "This does not mean the employer is not enrolled. Check your connection and try again.",
        records: [], h1b: { available: false }, staffing: "", dataDate: date, searchedFor: result && result.key || "" };
    }
    var entry = result.found ? result.entry : null;
    var recs = entry ? entry.r || [] : [];
    var meta = result.meta || {};
    var h1b = h1bView(entry, meta);
    var staffing = entry && entry.f && entry.f.length
      ? 'The name contains "' + entry.f[0] + '", a weak hint. A W-2 staffing employer can sign an I-983 only if it is enrolled and provides and supervises your training itself.'
      : "";
    var base = { name: name, key: result.key, records: recordRows(recs, entry && entry.n), h1b: h1b, staffing: staffing, dataDate: date, displayName: entry && entry.n || name };
    if (!recs.length) {
      return Object.assign(base, { tone: "none", chip: "Not found", eChip: "E-Verify: not found", eAria: "E-Verify: not found in our data",
        headline: "No exact match in our E-Verify data.",
        note: "Not found is not a verdict. Our data covers about " + (meta.coverage_pct || 77) + "% of E-Verify employers. Ask the employer for their E-Verify company ID." });
    }
    var open = recs.filter(isOpen);
    if (open.length) {
      var sched = open.filter(function (r) { return r.x; });
      var latestOpen = open.map(function (r) { return r.e || ""; }).sort().pop();
      var ended = recs.length - open.length;
      return Object.assign(base, { tone: "ok", chip: "Enrolled", eChip: "E-Verify: enrolled", eAria: "E-Verify: enrolled",
        headline: sched.length === open.length ? "Enrolled, with an end date listed: " + sched[0].x + "." : "Enrolled, no end date listed.",
        note: (open.length === 1 ? "An enrollment started " + latestOpen + " is open." : open.length + " enrollments are open.") +
          (ended ? " " + ended + " earlier " + (ended === 1 ? "enrollment has" : "enrollments have") + " ended." : "") });
    }
    var lastEnd = recs.map(function (r) { return r.t; }).sort().pop();
    return Object.assign(base, { tone: "ended", chip: "Enrollment ended", eChip: "E-Verify: ended", eAria: "E-Verify: enrollment ended",
      headline: recs.length === 1 ? "Only enrollment on file ended " + lastEnd + "." : "Latest enrollment ended " + lastEnd + ".",
      note: "No current enrollment in our data. We cover about " + (meta.coverage_pct || 77) + "% of E-Verify employers, so one could be missing." });
  }

  function summary(v) {
    var parts = [];
    if (v.records.length) parts.push(v.records.length + (v.records.length === 1 ? " enrollment" : " enrollments") + " on file");
    if (v.h1b.available && v.h1b.short) parts.push(v.h1b.short);
    return parts.join(" · ");
  }

  var api = { buildView: buildView, summary: summary, SIZE: SIZE };
  root.OptView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
