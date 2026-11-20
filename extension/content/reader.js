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

  // Job cards currently drawn in the list (LinkedIn draws only some of them until you scroll).
  function readCards(doc) {
    var out = [];
    var cards = doc.querySelectorAll(CARD);
    for (var i = 0; i < cards.length; i++) {
      var name = companyFromCard(cards[i]);
      if (name) out.push({ el: cards[i], anchor: cards[i].querySelector(CARD_COMPANY) || cards[i], jobId: cards[i].getAttribute("data-job-id"), name: name });
    }
    return out;
  }

  // The employer shown at the top of the detail pane for the selected job.
  function readDetail(doc) {
    var el = doc.querySelector(DETAIL_COMPANY);
    var name = clean(el && el.textContent);
    return name ? { el: el, anchor: el.parentElement || el, name: name } : null;
  }

  var api = { readCards: readCards, readDetail: readDetail, clean: clean };
  root.OptReader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
