// Reads employer names from LinkedIn job pages. Classic script (no imports) so it can run as a content script
// and also be loaded in Node tests. Fails quiet: if LinkedIn changes its page, it returns nothing.
// Selectors come from a read-only look at the live jobs page (Nov 2026). LinkedIn's hashed class names are
// deliberately NOT used because they change; only the readable artdeco/job-card names and data attributes are.
(function (root) {
  var CARD = "li[data-occludable-job-id] .job-card-container[data-job-id]";
  var CARD_COMPANY = ".artdeco-entity-lockup__subtitle";
  var DETAIL_COMPANY = ".job-details-jobs-unified-top-card__company-name";

  function clean(t) { return (t || "").replace(/\s+/g, " ").trim(); }

  function companyFromCard(card) {
    var sub = card.querySelector(CARD_COMPANY);
    var name = clean(sub && sub.textContent);
    if (!name) {                                    // fallback: the logo's alt text, "<Company> logo"
      var img = card.querySelector("img[alt$=' logo']");
      if (img) name = clean(img.getAttribute("alt").replace(/ logo$/, ""));
    }
    return name;
  }

  // ---- Newer LinkedIn layout (jobs home, /jobs/search-results/): no data-job-id or artdeco classes, the job link is
  // not inside the card, and every link carries the same currentJobId. So a card is found from its location line:
  // the largest block around ONE location line that has a logo and no headings or company links (that rules out
  // the page header and the detail pane). The employer is the first other text line (<p>) in it.
  // Only tag structure and visible text are used, never hashed class names.
  var LOCATION = /\((on-site|remote|hybrid)\)|, [A-Z]{2}\b|metropolitan area|united states$/i;

  function leafPs(el) {
    var all = el.querySelectorAll("p"), out = [];
    for (var i = 0; i < all.length; i++) if (all[i].children.length === 0 && clean(all[i].textContent)) out.push(all[i]);
    return out;
  }
  function isLoc(p) { return LOCATION.test(clean(p.textContent)); }
  function readCardsNew(doc) {
    var out = [], seen = [], ps = leafPs(doc);
    for (var i = 0; i < ps.length; i++) {
      if (!isLoc(ps[i])) continue;
      var el = ps[i], card = null, lines = null;
      for (var up = 0; up < 14 && el.parentElement; up++) {
        var par = el.parentElement, pl = leafPs(par), locs = 0;
        for (var k = 0; k < pl.length; k++) if (isLoc(pl[k])) locs++;
        if (locs > 1) break;                          // grew past one card
        el = par; lines = pl;
        if (pl.length >= 2) card = el;
      }
      if (!card || seen.indexOf(card) >= 0) continue;
      if (!card.querySelector("img, figure") || card.querySelector("h1, h2, h3, a[href*='/company/']")) continue;
      seen.push(card);
      for (var j = 0; j < lines.length; j++) {
        if (!isLoc(lines[j])) { out.push({ el: card, anchor: lines[j], jobId: "", name: clean(lines[j].textContent) }); break; }
      }
    }
    return out;
  }
  function readDetailNew(doc) {
    var loc = doc.location || (doc.defaultView && doc.defaultView.location);
    if (loc && !/currentJobId=/.test(loc.search || "")) return null;   // home page has no detail pane
    var cards = readCardsNew(doc), ls = doc.querySelectorAll("a[href*='/company/']");
    for (var i = 0; i < ls.length; i++) {
      var t = clean(ls[i].textContent);
      if (!t || t.length > 80 || /employees|followers/i.test(t)) continue;
      var inCard = false;
      for (var c = 0; c < cards.length; c++) if (cards[c].el.contains(ls[i])) inCard = true;
      if (!inCard) return { el: ls[i], anchor: ls[i].parentElement || ls[i], name: t };
    }
    return null;
  }

  // Job cards currently drawn in the list (LinkedIn draws only some of them until you scroll).
  function readCards(doc) {
    var out = [];
    var cards = doc.querySelectorAll(CARD);
    for (var i = 0; i < cards.length; i++) {
      var name = companyFromCard(cards[i]);
      if (name) out.push({ el: cards[i], anchor: cards[i].querySelector(CARD_COMPANY) || cards[i], jobId: cards[i].getAttribute("data-job-id"), name: name });
    }
    return out.length ? out : readCardsNew(doc);
  }

  // The employer shown at the top of the detail pane for the selected job.
  function readDetail(doc) {
    var el = doc.querySelector(DETAIL_COMPANY);
    var name = clean(el && el.textContent);
    return name ? { el: el, anchor: el.parentElement || el, name: name } : readDetailNew(doc);
  }

  var api = { readCards: readCards, readDetail: readDetail, clean: clean };
  root.OptReader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
