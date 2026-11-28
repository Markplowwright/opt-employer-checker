// Chips and the details popup. Everything is built with DOM calls and textContent (never innerHTML),
// inside shadow roots so LinkedIn's styles cannot change how it looks and ours cannot leak into the page.
(function (root) {
  var SVG = "http://www.w3.org/2000/svg";
  var TONES = { ok: ["#e1f3e8", "#0d5c33"], ended: ["#fcefd2", "#7a4300"], none: ["#e9ecf0", "#3b4450"], error: ["#fbe3df", "#8a1f11"], busy: ["#eef1f5", "#5a6472"], warn: ["#fff1b8", "#5c4500"], related: ["#ece7fb", "#4b2a99"] };
  var ICON = { ok: "M8 12.5l2.8 2.8L16 9.5", ended: "M12 7.5V12l3 2", none: "M8.5 12h7", error: "M12 7.5v5M12 15.8v.4", busy: "M8.5 12h7", warn: "M12 7.5v5M12 15.8v.4", related: "M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8z" };
  var SEARCH_URL = null; // set to the search page address when that page exists; the button stays hidden until then

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px}",
    ".row.s{flex-wrap:nowrap;gap:4px;margin:0}",
    ".row.s button.chip{min-height:20px;gap:3px;padding:0 7px 0 4px;font-size:11px}",
    ".row.s button.chip.plain{padding:0 7px}",
    ".row.m{gap:4px 6px}",
    ".row.m button.chip{min-height:22px;gap:4px;padding:0 8px 0 5px;font-size:11px}",
    ".row.m button.chip.plain{padding:0 8px}",
    "button.chip{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0 10px 0 6px;border:0;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;line-height:1}",
    "button.chip.plain{padding:0 10px}",
    "button.chip:focus-visible,button.btn:focus-visible,a:focus-visible{outline:2px solid #1f5fbf;outline-offset:2px}",
    "svg{flex:none}",
    ".pop{position:fixed;z-index:2147483000;width:300px;max-height:min(calc(100vh - 16px),720px);overflow:auto;background:#fff;color:#1b1f24;border:1px solid #d3d8df;border-radius:16px;box-shadow:0 12px 32px rgba(20,30,50,.18),0 2px 6px rgba(20,30,50,.08)}",
    ".hd{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px;background:#f7f9fb;border-bottom:1px solid #e6e9ee;position:sticky;top:0;cursor:grab;touch-action:none;user-select:none}",
    ".pop.drag .hd{cursor:grabbing}",
    ".hd .t{flex:1;font-size:12.5px;font-weight:600}",
    "button.x{width:32px;height:32px;border:0;background:transparent;border-radius:8px;color:#3b4450;cursor:pointer;display:flex;align-items:center;justify-content:center}",
    ".bd{display:flex;flex-direction:column;gap:14px;padding:14px}",
    ".lbl{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#5a6472}",
    ".emp{font-size:18px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}",
    ".sm{font-size:12px;color:#5a6472;line-height:1.45}",
    ".vchip{display:inline-flex;align-self:flex-start;align-items:center;gap:6px;padding:5px 12px 5px 8px;border-radius:999px;font-size:13px;font-weight:600}",
    ".hl{font-size:14.5px;font-weight:600;line-height:1.35}",
    ".tx{font-size:13px;line-height:1.5;color:#3b4450}",
    "button.btn{display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px solid #d3d8df;background:#fff;color:#1f5fbf;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;width:100%}",
    "a.btn{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 14px;border-radius:10px;background:#1f5fbf;color:#fff;font-size:13px;font-weight:600;text-decoration:none}",
    ".sec{display:flex;flex-direction:column;gap:8px}",
    ".st{font-size:12px;font-weight:700}",
    ".st span{font-weight:500;color:#5a6472}",
    ".recs{border:1px solid #e0e4ea;border-radius:10px;overflow:hidden}",
    ".rec{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;padding:9px 11px;border-top:1px solid #e0e4ea}",
    ".rec:first-child{border-top:0}",
    ".rec[hidden]{display:none}",
    ".rec .a{font-size:13px;font-weight:600;white-space:nowrap}",
    ".tag{flex:none;font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:999px}",
    ".bars{display:flex;align-items:flex-end;gap:8px;height:84px;padding:0 4px;border-bottom:1px solid #d3d8df}",
    ".bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;min-width:0}",
    ".bar i{display:block;width:100%;border-radius:4px 4px 0 0;background:#1f5fbf}",
    ".bar i.p{background:#b7cdf0;border:1px dashed #1f5fbf}",
    ".bar b{font-size:11px;font-weight:600}",
    ".labs{display:flex;gap:8px;padding:0 4px}",
    ".labs span{flex:1;text-align:center;font-size:11px;color:#5a6472}",
    ".stf{padding:11px;border:1px dashed #aab2be;border-radius:10px;background:#f7f9fb}",
    ".stf b{display:block;font-size:13px;margin-bottom:3px}",
    ".ft{display:flex;flex-direction:column;gap:5px;padding:11px 14px 13px;background:#f7f9fb;border-top:1px solid #e6e9ee;font-size:11.5px;line-height:1.5;color:#5a6472}",
    ".ft a{color:#1f5fbf}"
  ].join("\n");

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) for (var k in props) { if (k === "text") e.textContent = props[k]; else if (k === "style") e.setAttribute("style", props[k]); else e.setAttribute(k, props[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function svg(path, size, extra) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2.2");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    (extra || []).forEach(function (d) { var p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); s.appendChild(p); });
    var paths = String(path).split("|");
    paths.forEach(function (d) { if (d) { var p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); s.appendChild(p); } });
    return s;
  }
  function circleIcon(tone, size) {
    var s = svg(ICON[tone] || ICON.none, size);
    var c = document.createElementNS(SVG, "circle"); c.setAttribute("cx", 12); c.setAttribute("cy", 12); c.setAttribute("r", 9);
    s.insertBefore(c, s.firstChild);
    return s;
  }
  function shadowHost(attrs) {
    var host = document.createElement("div");
    host.setAttribute("data-opt-host", "1");
    for (var k in attrs || {}) host.setAttribute(k, attrs[k]);
    var sr = host.attachShadow({ mode: "open" });
    sr.appendChild(el("style", { text: CSS }));
    return { host: host, sr: sr };
  }

  // ---- chips next to an employer name ----
  // compact = small chips that sit on the job title line of a list card; full size is used beside the employer
  // name in the detail pane / single job page.
  function createChips(compact) {
    // The detail chips sit in LinkedIn's company row, which spreads its items apart on wide windows.
    // An auto right margin keeps them next to the company name (12px away) and leaves the row's menu on the right.
    var h = shadowHost({ style: compact ? "display:inline-block;vertical-align:middle;margin-left:8px" : "display:block;margin:0 auto 0 12px" });
    var row = el("div", { class: compact ? "row s" : "row m" });
    h.sr.appendChild(row);
    return {
      host: h.host,
      showBusy: function () {
        row.textContent = "";
        row.appendChild(el("button", { class: "chip plain", disabled: "", "aria-label": "Checking this employer", style: "background:" + TONES.busy[0] + ";color:" + TONES.busy[1] + ";cursor:default" }, ["OPT check…"]));
      },
      show: function (view, onOpen) {
        row.textContent = "";
        var t = TONES[view.tone] || TONES.none;
        var b1 = el("button", { class: "chip", title: view.eChip, "aria-label": view.eAria + ". Open details", style: "background:" + t[0] + ";color:" + t[1] }, [circleIcon(view.tone, 12), compact ? "E-Verify" : view.eChip]);
        b1.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); onOpen(b1); });
        row.appendChild(b1);
        if (view.h1b.available) {
          var b2 = el("button", { class: "chip plain", title: view.h1b.chip, "aria-label": view.h1b.aria + ". Open details", style: "background:#e6edfa;color:#1b3a80" }, [compact ? view.h1b.mini : view.h1b.chip]);
          b2.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); onOpen(b2); });
          row.appendChild(b2);
        }
      }
    };
  }

  // ---- the popup ----
  var popup = null; // {host, sr, returnTo, cleanup}
  var lastPos = null; // where the person last dragged the popup to; reused for the next one on this page
  var PAD = 8;

  // Keep a w x h box fully inside a vw x vh window (top-left stays visible if the box is bigger than the window).
  function clampPos(left, top, w, h, vw, vh, pad) {
    var p = pad == null ? PAD : pad;
    return { left: Math.max(p, Math.min(left, vw - w - p)), top: Math.max(p, Math.min(top, vh - h - p)) };
  }

  function closePopup() {
    if (!popup) return;
    var back = popup.returnTo;
    if (popup.cleanup) popup.cleanup();
    popup.host.remove(); popup = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onOutside, true);
    if (back && back.isConnected) { try { back.focus(); } catch (e) { /* ignore */ } }
  }
  function onKey(ev) { if (ev.key === "Escape") { ev.stopPropagation(); closePopup(); } }
  function onOutside(ev) {
    if (!popup) return;
    var path = ev.composedPath ? ev.composedPath() : [];
    for (var i = 0; i < path.length; i++) { if (path[i] === popup.host || (path[i].getAttribute && path[i].getAttribute("data-opt-host"))) return; }
    closePopup();
  }

  function section(title, sub, body) {
    var t = el("div", { class: "st" }, [title]);
    if (sub) t.appendChild(el("span", { text: " · " + sub }));
    return el("div", { class: "sec" }, [t].concat(body));
  }

  function detailsNode(v) {
    var d = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
    if (v.tone !== "none" && v.tone !== "error") d.appendChild(el("div", { class: "tx", text: v.note }));   // none/error already show it above
    if (v.records.length) {
      // Long lists start collapsed: the first two rows (open ones first, newest first), the rest one click away,
      // so the H-1B section below is never pushed far down the card.
      var SHOW_FIRST = 2, total = v.records.length;
      var list = el("div", { class: "recs" }), extra = [];
      v.records.forEach(function (r, i) {
        var tc = r.tone ? TONES[r.tone] : (r.open ? TONES.ok : TONES.ended);
        var row = el("div", { class: "rec" }, [
          el("div", null, [el("div", { class: "a", text: "Enrolled " + r.enrolled }), r.meta ? el("div", { class: "sm", text: r.meta }) : null]),
          el("div", { class: "tag", text: r.tag, style: "background:" + tc[0] + ";color:" + tc[1] })
        ]);
        if (i >= SHOW_FIRST) { row.hidden = true; extra.push(row); }
        list.appendChild(row);
      });
      var parts = [list];
      if (extra.length) {
        var more = el("button", { class: "btn", "aria-expanded": "false" });
        var paint = function (open) {
          more.setAttribute("aria-expanded", open ? "true" : "false");
          more.textContent = "";
          more.appendChild(document.createTextNode(open ? "Show fewer enrollments" : "Show all " + total + " enrollments"));
          more.appendChild(svg(open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6", 14));
        };
        paint(false);
        more.addEventListener("click", function () {
          var open = more.getAttribute("aria-expanded") !== "true";
          extra.forEach(function (row) { row.hidden = !open; });
          paint(open);
        });
        parts.push(more);
      }
      d.appendChild(section("E-Verify enrollments", total + " on file", parts));
    }
    if (v.h1b.available) {
      var body = [];
      if (v.h1b.bars.length) {
        var max = Math.max.apply(null, v.h1b.bars.map(function (b) { return b.value; }).concat([1]));
        var bars = el("div", { class: "bars" }), labs = el("div", { class: "labs" });
        v.h1b.bars.forEach(function (b) {
          bars.appendChild(el("div", { class: "bar" }, [el("b", { text: b.value.toLocaleString("en-US") }), el("i", { class: b.partial ? "p" : "", style: "height:" + Math.max(3, Math.round(b.value / max * 52)) + "px" })]));
          labs.appendChild(el("span", { text: b.label }));
        });
        body.push(bars, labs);
      }
      body.push(el("div", { class: "sm", text: v.h1b.note }));
      d.appendChild(section("H-1B petitions approved", v.h1b.scope || "exact name only", body));
    }
    if (v.staffing) d.appendChild(el("div", { class: "stf" }, [el("b", { text: "May be a staffing or consulting firm" }), el("div", { class: "tx", text: v.staffing })]));
    d.appendChild(el("div", { class: "sm", text: "Some E-Verify enrollments cover only federal-contract work." }));
    return d;
  }

  function openPopup(view, anchor, summaryText) {
    closePopup();
    var h = shadowHost(), toggleRefit = null;
    var pop = el("div", { class: "pop", role: "dialog", "aria-label": "Employer details for " + view.name });
    var closeBtn = el("button", { class: "x", "aria-label": "Close details" }, [svg("M6 6l12 12|M18 6L6 18", 16)]);
    closeBtn.addEventListener("click", closePopup);
    pop.appendChild(el("div", { class: "hd" }, [svg("M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z|M9 12l2.2 2.2L15.5 10", 18), el("span", { class: "t", text: "OPT Employer Checker" }), closeBtn]));

    var t = TONES[view.tone] || TONES.none;
    var body = el("div", { class: "bd" });
    body.appendChild(el("div", { style: "display:flex;flex-direction:column;gap:4px" }, [
      el("div", { class: "lbl", text: "Employer on this page" }),
      el("div", { class: "emp", text: view.name }),
      el("div", { class: "sm", text: (view.tone === "none" || view.tone === "error" ? "Searched for: " : view.tone === "related" ? "Closest match: " : "Exact name match: ") + view.key })
    ]));
    var vb = el("div", { style: "display:flex;flex-direction:column;gap:8px" }, [
      el("div", { class: "vchip", style: "background:" + t[0] + ";color:" + t[1] }, [circleIcon(view.tone, 16), view.chip]),
      el("div", { class: "hl", text: view.headline })
    ]);
    if (view.tone === "none" || view.tone === "error") vb.appendChild(el("div", { class: "tx", text: view.note }));
    var sum = summaryText && view.tone !== "error" ? el("div", { class: "tx", text: summaryText }) : null;
    if (sum) vb.appendChild(sum);
    body.appendChild(vb);

    if (view.tone !== "error") {
      var details = null;
      var toggle = el("button", { class: "btn", "aria-expanded": "false" }, ["Show details", svg("M6 9l6 6 6-6", 14)]);
      var slot = el("div");
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
        toggle.textContent = "";
        toggle.appendChild(document.createTextNode(open ? "Show details" : "Hide details"));
        toggle.appendChild(svg(open ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6", 14));
        slot.textContent = "";
        if (!open) { details = detailsNode(view); slot.appendChild(details); }
        if (toggleRefit) toggleRefit();
      });
      body.appendChild(toggle); body.appendChild(slot);
      if (SEARCH_URL) body.appendChild(el("a", { class: "btn", href: SEARCH_URL, target: "_blank", rel: "noopener" }, ["Open full search", svg("M5 12h14|M13 6l6 6-6 6", 16)]));
    }
    pop.appendChild(body);

    var src1 = el("a", { href: "https://www.e-verify.gov/e-verify-employer-search", target: "_blank", rel: "noopener", text: "E-Verify source" });
    var src2 = el("a", { href: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", target: "_blank", rel: "noopener", text: "H-1B source" });
    pop.appendChild(el("div", { class: "ft" }, [
      el("div", null, ["Data as of " + (view.dataDate || "unknown") + " · ", src1, " · ", src2]),
      el("div", { text: "Unofficial. Not affiliated with DHS or USCIS. This can’t guarantee an I-983 will be accepted. Ask your DSO." })
    ]));
    h.sr.appendChild(pop);
    document.body.appendChild(h.host);

    // place beside the chip (or where the person last left it), keep inside the window
    var r = anchor.getBoundingClientRect(), w = 300, pad = PAD;
    var left = r.right + pad + w <= window.innerWidth ? r.right + pad : (r.left - pad - w >= 0 ? r.left - pad - w : Math.max(pad, (window.innerWidth - w) / 2));
    var top = r.top - 8;
    if (lastPos) { left = lastPos.left; top = lastPos.top; }
    var cur = { left: 0, top: 0 };
    function place(l, t) {
      cur = clampPos(l, t, pop.offsetWidth || w, pop.offsetHeight, window.innerWidth, window.innerHeight, pad);
      pop.style.left = cur.left + "px"; pop.style.top = cur.top + "px";
    }
    place(left, top);

    // Move it by the title bar (mouse, touch or pen), or with the arrow keys on the title bar.
    var hd = pop.firstChild, drag = null;
    hd.setAttribute("tabindex", "0");
    hd.setAttribute("title", "Drag to move");
    hd.setAttribute("aria-label", "Move this window: drag, or use the arrow keys");
    hd.addEventListener("pointerdown", function (ev) {
      if (ev.button > 0 || (ev.target.closest && ev.target.closest("button"))) return;
      drag = { dx: ev.clientX - cur.left, dy: ev.clientY - cur.top };
      pop.classList.add("drag");
      try { hd.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      ev.preventDefault();
    });
    hd.addEventListener("pointermove", function (ev) { if (drag) place(ev.clientX - drag.dx, ev.clientY - drag.dy); });
    function endDrag() { if (!drag) return; drag = null; pop.classList.remove("drag"); lastPos = { left: cur.left, top: cur.top }; }
    hd.addEventListener("pointerup", endDrag);
    hd.addEventListener("pointercancel", endDrag);
    hd.addEventListener("keydown", function (ev) {
      var step = ev.shiftKey ? 64 : 16, dx = 0, dy = 0;
      if (ev.key === "ArrowLeft") dx = -step; else if (ev.key === "ArrowRight") dx = step;
      else if (ev.key === "ArrowUp") dy = -step; else if (ev.key === "ArrowDown") dy = step; else return;
      ev.preventDefault(); ev.stopPropagation();
      place(cur.left + dx, cur.top + dy); lastPos = { left: cur.left, top: cur.top };
    });

    // When it grows (Show details) or the window shrinks, pull it back inside so nothing is cut off.
    var onResize = function () { place(cur.left, cur.top); };
    window.addEventListener("resize", onResize);
    var ro = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(pop);
    toggleRefit = onResize;

    popup = { host: h.host, returnTo: anchor, cleanup: function () { window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); } };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onOutside, true);
    closeBtn.focus();
  }

  var api = { createChips: createChips, openPopup: openPopup, closePopup: closePopup, clampPos: clampPos };
  root.OptUI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
