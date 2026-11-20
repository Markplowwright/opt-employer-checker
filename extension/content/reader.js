// Reads employer names from LinkedIn job pages. Classic script (no imports) so it can run as a content script
// and also be loaded in Node tests. Fails quiet: if LinkedIn changes its page, it returns nothing.
//
// LinkedIn runs more than one page layout at once (and changes them), so nothing here depends on one layout.
// Several independent readers are tried; each uses a stable signal instead of hashed class names:
//   1. classic list cards      (readable artdeco names + data-job-id)
//   2. location-line cards     (newer layout: a card is the block around ONE location line + a logo or job link)
//   3. title-confirmed employer for the detail pane / single job page ("<job> | <Employer> | LinkedIn")
//   4. company page jobs tab   ("<Employer>: Jobs | LinkedIn")
// tests/fixtures hold a compact copy of each page type; if LinkedIn changes one, its test fails.
(function (root) {
  var CARD = "li[data-occludable-job-id] .job-card-container[data-job-id]";
  var CARD_COMPANY = ".artdeco-entity-lockup__subtitle";
  var DETAIL_COMPANY = ".job-details-jobs-unified-top-card__company-name";
  var JOB_LINK = "a[href*='currentJobId='], a[href*='/jobs/view/']";
  var LOCATION = /\((on-site|remote|hybrid)\)|, [A-Z]{2}\b|metropolitan area|united states$/i;
  var DOT = /^(.+?)\s+[·•]\s+(.+)$/;          // "Employer · Location" on one line (job tracker)
  var NOT_EMPLOYER = /^(premium|promoted|viewed|saved|applied|new|easy apply|actively reviewing applicants)$/i;
  var MAX_LINES = 10;                                   // a job card is short; the sidebar profile card + footer is not
  var PATHS = /^\/(jobs(\/|$)|jobs-tracker|my-items\/|company\/[^/]+\/jobs)/;

  function clean(t) { return (t || "").replace(/\s+/g, " ").trim(); }
  // LinkedIn's tracker shows some posters as "Equinox-SMART_RECRUITERS"; drop that ATS suffix.
  function tidy(name) { return clean(name).replace(/-[A-Z0-9]+_[A-Z0-9_]+$/, ""); }
  function applies(loc) { return !!(loc && PATHS.test(loc.pathname || "")); }

  // ---- 1. classic cards
  function companyFromClassic(card) {
    var sub = card.querySelector(CARD_COMPANY);
    var name = clean(sub && sub.textContent);
    if (!name) {                                    // fallback: the logo's alt text, "<Company> logo"
      var img = card.querySelector("img[alt$=' logo']");
      if (img) name = clean(img.getAttribute("alt").replace(/ logo$/, ""));
    }
    return name;
  }
  function readClassic(doc) {
    var out = [], cards = doc.querySelectorAll(CARD);
    for (var i = 0; i < cards.length; i++) {
      var name = companyFromClassic(cards[i]);
      if (name) out.push({ el: cards[i], anchor: cards[i].querySelector(CARD_COMPANY) || cards[i], jobId: cards[i].getAttribute("data-job-id"), name: name });
    }
    return out;
  }

  // ---- 2. location-line cards (newer layouts, job tracker)
  function leafPs(el) {
    var all = el.querySelectorAll("p"), out = [];
    for (var i = 0; i < all.length; i++) if (all[i].children.length === 0 && clean(all[i].textContent)) out.push(all[i]);
    return out;
  }
  function isLoc(p) { return LOCATION.test(clean(p.textContent)); }
  function dotEmployer(p) { var m = DOT.exec(clean(p.textContent)); return m && LOCATION.test(m[2]) ? tidy(m[1]) : ""; }

  function employerIn(lines) {
    var j, n;
    for (j = 0; j < lines.length; j++) { n = dotEmployer(lines[j]); if (n) return { anchor: lines[j], name: n }; }
    for (j = 0; j < lines.length; j++) if (!isLoc(lines[j]) && !NOT_EMPLOYER.test(clean(lines[j].textContent))) return { anchor: lines[j], name: tidy(lines[j].textContent) };
    return null;
  }
  function readByLocation(doc) {
    var out = [], seen = [], ps = leafPs(doc);
    for (var i = 0; i < ps.length; i++) {
      if (!isLoc(ps[i])) continue;
      var el = ps[i], card = null, lines = null;
      for (var up = 0; up < 14 && el.parentElement; up++) {
        var par = el.parentElement, pl = leafPs(par), locs = 0;
        for (var k = 0; k < pl.length; k++) if (isLoc(pl[k])) locs++;
        if (locs > 1) break;                          // grew past one card
        el = par; lines = pl;
        if (pl.length >= 2 || (pl.length === 1 && dotEmployer(pl[0]))) card = el;
      }
      if (!card || seen.indexOf(card) >= 0 || lines.length > MAX_LINES) continue;
      // a real card has a logo or a job link; the page header and detail pane do not (or have headings / company links)
      if (!card.querySelector("img, figure, " + JOB_LINK)) continue;
      if (card.querySelector("h1, h2, h3, a[href*='/company/']")) continue;
      var emp = employerIn(lines);
      if (!emp || !emp.name) continue;
      seen.push(card);
      out.push({ el: card, anchor: emp.anchor, jobId: "", name: emp.name });
    }
    return out;
  }

  // ---- all list cards: every reader, deduped by anchor element
  function readCards(doc) {
    var all = readClassic(doc).concat(readByLocation(doc)), out = [], anchors = [];
    for (var i = 0; i < all.length; i++) {
      if (anchors.indexOf(all[i].anchor) >= 0) continue;
      anchors.push(all[i].anchor);
      out.push(all[i]);
    }
    return out;
  }

  // ---- 3. detail pane / single job page, confirmed by the page title
  function titleEmployer(doc) {
    var m = /^.+\|\s*([^|]+?)\s*\|\s*LinkedIn$/.exec(clean(doc.title));
    return m ? m[1] : "";
  }
  function getLoc(doc, loc) { return loc || doc.location || (doc.defaultView && doc.defaultView.location) || null; }

  function readDetail(doc, loc) {
    var el = doc.querySelector(DETAIL_COMPANY), name = clean(el && el.textContent);
    if (name) return { el: el, anchor: el.parentElement || el, name: name };      // classic detail pane

    loc = getLoc(doc, loc);
    var path = (loc && loc.pathname) || "", search = (loc && loc.search) || "";

    var cm = /^(.+?):\s*Jobs\s*\|\s*LinkedIn$/.exec(clean(doc.title));             // company page, Jobs tab
    if (cm && /^\/company\/[^/]+\/jobs/.test(path)) {
      var h = doc.querySelector("h1");
      return h ? { el: h, anchor: h, name: clean(cm[1]) } : null;
    }

    if (!/\/jobs\/view\//.test(path) && !/currentJobId=/.test(search)) return null; // no selected job on this page
    var want = titleEmployer(doc);
    if (!want) return null;
    var cards = readByLocation(doc), ls = doc.querySelectorAll("a[href*='/company/']");
    for (var i = 0; i < ls.length; i++) {
      var t = clean(ls[i].textContent);
      if (!t || t.toLowerCase() !== want.toLowerCase()) continue;                 // the title confirms which link is the employer
      var inCard = false;
      for (var c = 0; c < cards.length; c++) if (cards[c].el.contains(ls[i])) inCard = true;
      if (!inCard) return { el: ls[i], anchor: ls[i].parentElement || ls[i], name: t };
    }
    return null;
  }

  // Where to put small chips on a list card: on the job title line. The title block is the nearest non-empty
  // element before the employer line. If it is (inside) a link, chips go after the link, never inside it.
  function titleSlot(card, anchor) {
    var el = anchor;
    while (el && el !== card) {
      var sib = el.previousElementSibling;
      while (sib && !clean(sib.textContent)) sib = sib.previousElementSibling;
      if (sib) {
        var a = sib.tagName === "A" ? sib : sib.closest && sib.closest("a");
        if (a && card.contains(a)) return { ref: a, mode: "after" };
        // LinkedIn wraps the title in layout-only divs (display: contents). Chips must go inside the title's own
        // text block (<p> or heading) to share its line; checked on the live search page.
        var inner = sib.querySelector && sib.querySelector("p, h1, h2, h3, h4");
        return { ref: inner || sib, mode: "append" };
      }
      el = el.parentElement;
    }
    return null;
  }

  var api = { titleSlot: titleSlot, readCards: readCards, readDetail: readDetail, applies: applies, titleEmployer: titleEmployer, clean: clean };
  root.OptReader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
