// Finds employers on the page, asks the background worker for their data, and shows chips.
// Never throws into the page: any failure just means no chips for that scan.
(function () {
  if (window.__optEmployerChecker) return;
  window.__optEmployerChecker = true;

  var results = {};       // employer name -> lookup result from the worker
  var pending = {};       // employer name -> true while a request is out
  var timer = null;
  var chips = new WeakMap(); // anchor element -> {name, ui}

  function ask(names) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: "lookup", names: names }, function (resp) {
          if (chrome.runtime.lastError || !resp) { resolve(null); return; }
          resolve(resp.results || null);
        });
      } catch (e) { resolve(null); }
    });
  }

  function place(target, kind) {
    var rec = chips.get(target.anchor);
    if (!rec || !rec.ui.host.isConnected) {
      var ui = OptUI.createChips(kind === "card");
      rec = { name: null, ui: ui };
      chips.set(target.anchor, rec);
      var slot = kind === "card" && target.card ? OptReader.titleSlot(target.card, target.anchor) : null;
      if (slot && slot.mode === "append") slot.ref.appendChild(ui.host);
      else if (slot) slot.ref.insertAdjacentElement("afterend", ui.host);
      else target.anchor.insertAdjacentElement("afterend", ui.host);
    }
    if (rec.name !== target.name || rec.shown !== !!results[target.name]) {
      rec.name = target.name;
      var res = results[target.name];
      rec.shown = !!res;
      if (!res) { rec.ui.showBusy(); return; }
      var view = OptView.buildView(target.name, res);
      rec.ui.show(view, function (btn) { OptUI.openPopup(view, btn, OptView.summary(view)); });
    }
  }

  function scan() {
    timer = null;
    try {
      if (!OptReader.applies(location)) return;      // LinkedIn is a single-page app: re-check the path on every scan
      var targets = OptReader.readCards(document).map(function (c) { return { anchor: c.anchor, card: c.el, name: c.name, kind: "card" }; });
      var d = OptReader.readDetail(document, location);
      if (d) targets.push({ anchor: d.anchor, name: d.name, kind: "detail" });
      if (!targets.length) return;
      var need = [];
      targets.forEach(function (t) { if (!results[t.name] && !pending[t.name] && need.indexOf(t.name) < 0) need.push(t.name); });
      targets.forEach(function (t) { place(t, t.kind); });
      if (!need.length) return;
      need.forEach(function (n) { pending[n] = true; });
      ask(need).then(function (res) {
        need.forEach(function (n) { delete pending[n]; });
        if (res) need.forEach(function (n) { if (res[n]) results[n] = res[n]; });
        else need.forEach(function (n) { results[n] = { error: "worker unavailable", key: "" }; setTimeout(function () { delete results[n]; }, 15000); });
        scan();
      });
    } catch (e) { /* stay quiet */ }
  }

  function schedule() { if (!timer) timer = setTimeout(scan, 400); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
