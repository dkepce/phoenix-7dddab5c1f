/* Phoenix — the page editor.
   One editable column of text; after every change we insert invisible "gap" spacers so that no line is ever cut
   by a page edge, and we draw the page sheets behind the text. Undo/redo is our own (the spacers would confuse the browser's). */
(function (PX) {
  const U = PX.U;
  const E = (PX.ed = {});
  const GAP = 28;                       // visible space between two sheets (px at 100 %)
  let ed, paper, sheets, wrap, stage;   // elements
  let doc = null, zoom = 1, composing = false, pendingSize = 12;
  let hist = [], hidx = -1, lastPush = 0, breakNext = false, raf = 0, pages = 1, sheetKey = "";
  const rg = document.createRange();

  /* ---------- page geometry ---------- */
  function geom() {
    const p = doc.page; let w = p.w, h = p.h; if (p.landscape) [w, h] = [h, w];
    const g = { pw: U.mm2px(w), ph: U.mm2px(h), mt: U.mm2px(p.mt), mr: U.mm2px(p.mr), mb: U.mm2px(p.mb), ml: U.mm2px(p.ml) };
    g.C = Math.max(120, g.ph - g.mt - g.mb);      // height of the text area on one page
    g.G = g.mb + GAP + g.mt;                       // height of the jump from one text area to the next
    return g;
  }

  /* ---------- applying a document's page & text settings ---------- */
  function applyStyle() {
    const g = geom(), t = doc.text, pa = PX.PAPER[doc.page.paper] || PX.PAPER.paper;
    paper.style.width = g.pw + "px";
    paper.style.setProperty("--sheet", pa[0]); paper.style.setProperty("--ink", pa[1]);
    ed.style.width = g.pw + "px"; ed.style.setProperty("--C", g.C + "px");        // --C = height of the text area: full-page pictures are exactly that tall
    ed.style.padding = g.mt + "px " + g.mr + "px " + g.mb + "px " + g.ml + "px";
    ed.style.setProperty("--font", '"' + t.font + '"');
    ed.style.setProperty("--fs", U.pt2px(t.size) + "px");
    ed.style.setProperty("--lh", t.lh);
    ed.style.setProperty("--ps", t.ps + "em");
    ed.classList.toggle("indent", !!t.indent);
    ed.lang = doc.lang; ed.setAttribute("lang", doc.lang);
    pendingSize = t.size;
  }
  function applyZoom() {
    zoom = PX.S.zoom || 1;
    paper.style.transform = "scale(" + zoom + ")";
    const g = doc ? geom() : { pw: 794 };
    const h = pages * (doc ? g.ph : 1123) + (pages - 1) * GAP;
    wrap.style.width = g.pw * zoom + "px"; wrap.style.height = h * zoom + "px";
  }

  /* ---------- the spacers ---------- */
  function stripGaps() {
    ed.querySelectorAll(".pgap").forEach(n => n.remove());
    ed.normalize();
  }
  function gap(h, inline) {
    const s = document.createElement(inline ? "span" : "div");
    s.className = "pgap" + (inline ? " in" : ""); s.contentEditable = "false"; s.style.height = h + "px";
    return s;
  }
  const BLOCKS = /^(P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|DIV)$/;
  function unitOf(node) { let n = node.parentNode; while (n && n !== ed && !BLOCKS.test(n.tagName)) n = n.parentNode; return n && n !== ed ? n : null; }
  function lead(node, h) {                       // half-leading above/below a character box
    const el = node.parentElement; let lh = el ? parseFloat(getComputedStyle(el).lineHeight) : NaN;
    if (isNaN(lh)) lh = h * 1.2;
    return Math.max(0, (lh - h) / 2);
  }

  /* index of text characters inside a block, so we can binary-search for the first line that crosses a page edge */
  function charIndex(b) {
    const nodes = []; let total = 0;
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (!n.nodeValue.length) continue; nodes.push({ n, s: total }); total += n.nodeValue.length; }
    return { nodes, total };
  }
  function locate(ci, idx) {
    let lo = 0, hi = ci.nodes.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ci.nodes[m].s <= idx) lo = m; else hi = m - 1; }
    return { node: ci.nodes[lo].n, off: idx - ci.nodes[lo].s };
  }
  function rectAt(ci, idx) {
    const l = locate(ci, idx); rg.setStart(l.node, l.off); rg.setEnd(l.node, l.off + 1);
    const rs = rg.getClientRects(); if (!rs.length) return null;
    const r = rs[0]; return r.width === 0 && r.height === 0 ? null : r;
  }
  function validFrom(ci, idx, max) { for (let i = idx; i <= max && i < idx + 600; i++) { const r = rectAt(ci, i); if (r) return { idx: i, r }; } return null; }

  /* the locked heading of a chapter / journal entry (PX.docHeader): kept at the very top, rebuilt whenever the title, the date or the chapter number changes */
  function syncHeader() {
    const t = document.createElement("div"); t.innerHTML = PX.docHeader(doc);
    const want = Array.from(t.children), cur = Array.from(ed.children).filter(c => c.dataset && c.dataset.hd);
    if (cur.length && ed.firstElementChild !== cur[0]) cur.forEach(c => c.remove());                   // it ended up somewhere else: start again
    else if (cur.map(c => c.outerHTML).join("") === want.map(c => c.outerHTML).join("")) return;
    else cur.forEach(c => c.remove());
    want.reverse().forEach(n => ed.insertBefore(n, ed.firstChild));
    if (!Array.from(ed.children).some(c => !(c.dataset && c.dataset.hd) && !c.classList.contains("pgap"))) { const p = document.createElement("p"); p.innerHTML = "<br>"; ed.appendChild(p); }   // always keep a paragraph to write in
  }
  function atTextStart() {                           // the cursor is at the very start of the first paragraph, right below the locked heading
    const s = getSelection(); if (!s.rangeCount || !s.isCollapsed || !ed.contains(s.anchorNode)) return false;
    let n = s.anchorNode; while (n && n.parentNode !== ed) n = n.parentNode; if (!n) return false;
    let prev = n.previousElementSibling; while (prev && prev.classList.contains("pgap")) prev = prev.previousElementSibling;
    if (!prev || !(prev.dataset && prev.dataset.hd)) return false;
    const r = s.getRangeAt(0), pre = document.createRange(); pre.selectNodeContents(n); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString() === "";
  }
  E.relayout = () => { if (doc) scheduleLayout(false); };                 // e.g. the title changed: the heading is rebuilt, nothing else
  const bodyText = () => { let s = ""; ed.childNodes.forEach(c => { if (!(c.nodeType === 1 && c.dataset && c.dataset.hd)) s += c.textContent; }); return s; };     // the text you wrote, without the heading

  /* ---------- layout: decide where pages break ---------- */
  function layout() {
    if (!doc || composing) return;
    raf = 0;
    if (!ed.getClientRects().length) return;           // the Write tab is hidden: nothing to measure (it re-runs when shown again)
    fixSizeSpans();
    stripGaps();
    syncHeader();
    snapshot();
    const g = geom(), C = g.C, G = g.G;
    const base = ed.getBoundingClientRect().top + g.mt * zoom;
    const Y = v => (v - base) / zoom;
    const pageStart = p => p * (C + G), pageEnd = p => p * (C + G) + C;
    let S = 0, page = 0; const ins = [];
    for (const b of Array.from(ed.children)) {
      const cs = getComputedStyle(b), r = b.getBoundingClientRect();
      const top = Y(r.top), bottom = Y(r.bottom) - (parseFloat(cs.paddingBottom) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
      if (bottom + S <= pageEnd(page) + 0.5) continue;
      if (b.classList.contains("fig")) {                                    // a picture is never cut: if it does not fit, the whole block goes to the next page
        const h = pageStart(page + 1) - (top + S); if (h > 0) { ins.push({ before: b, h }); S += h; page++; }
        continue;
      }
      const ci = charIndex(b), first = validFrom(ci, 0, ci.total - 1);
      if (!first) {                                                         // nothing to split: move the whole block
        const h = pageStart(page + 1) - (top + S);
        if (h > 0) { ins.push({ before: b, h }); S += h; page++; }
        continue;
      }
      let from = first.idx;
      for (let guard = 0; guard < 400; guard++) {
        // first character whose line ends below the page edge
        const limit = pageEnd(page) + 0.5 - S; let lo = from, hi = ci.total - 1, hit = null;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, f = validFrom(ci, mid, hi);
          if (!f) { hi = mid - 1; continue; }
          const l = locate(ci, f.idx), bot = Y(f.r.bottom) + lead(l.node, Y(f.r.bottom) - Y(f.r.top));
          if (bot > limit) { hit = f; hi = mid - 1; } else lo = f.idx + 1;
        }
        if (!hit) break;
        // walk back to the first character of that line
        let start = hit, i = hit.idx - 1, steps = 0, topMin = Y(hit.r.top);
        while (i >= from && steps++ < 600) {
          const r = rectAt(ci, i); if (!r) { i--; continue; }
          if (Y(r.bottom) <= Y(hit.r.top) + 1) break;
          start = { idx: i, r }; topMin = Math.min(topMin, Y(r.top)); i--;
        }
        const sl = locate(ci, start.idx), ld = lead(sl.node, Y(start.r.bottom) - Y(start.r.top)), lineTop = topMin - ld;
        const unit = unitOf(sl.node);
        let atUnitStart = false;
        if (unit) { rg.setStart(unit, 0); rg.setEnd(sl.node, sl.off); atUnitStart = rg.toString().trim() === ""; }
        if (atUnitStart) {                                                   // the line is the first one of its paragraph: move the paragraph
          const ur = unit.getBoundingClientRect(), ucs = getComputedStyle(unit);
          const pt = (parseFloat(ucs.paddingTop) || 0) + (parseFloat(ucs.borderTopWidth) || 0);
          const h = Math.max(1, pageStart(page + 1) - (Y(ur.top) + S) - pt);
          ins.push({ before: unit, h }); S += h;
        } else {
          const h = Math.max(1, pageStart(page + 1) - (lineTop + S));
          ins.push({ node: sl.node, off: sl.off, h }); S += h;
        }
        page++; from = start.idx + 1;
        if (from >= ci.total) break;
      }
    }
    for (let k = ins.length - 1; k >= 0; k--) {                              // later ones first so earlier positions stay valid
      const it = ins[k];
      if (it.before) it.before.parentNode.insertBefore(gap(it.h, false), it.before);
      else {
        let tn = it.node;
        if (it.off > 0) tn = tn.splitText(it.off);
        tn.parentNode.insertBefore(gap(it.h, true), tn);
      }
    }
    pages = page + 1;
    drawSheets(g);
    applyZoom();
    refreshSoon();
    if (E.onChange) E.onChange();
  }
  function drawSheets(g) {
    const num = doc.page.numbers, key = pages + "|" + g.ph + "|" + g.pw + "|" + num + "|" + g.mb;
    ed.style.minHeight = pages * g.ph + (pages - 1) * GAP + "px";
    paper.style.height = pages * g.ph + (pages - 1) * GAP + "px";
    if (key === sheetKey) return; sheetKey = key;
    let html = "";
    for (let i = 0; i < pages; i++) {
      html += '<div class="sheet" style="top:' + i * (g.ph + GAP) + "px;height:" + g.ph + 'px">' +
        (num !== "none" ? '<span class="pnum ' + num + '" style="bottom:' + Math.max(4, g.mb / 2 - 7) + "px;left:" + g.ml + "px;right:" + g.mr + 'px">' + (i + 1) + "</span>" : "") + "</div>";
    }
    sheets.innerHTML = html;
  }
  function scheduleLayout(force) { if (force) breakNext = true; if (!raf) raf = requestAnimationFrame(layout); }
  E.layoutNow = function () { if (raf) cancelAnimationFrame(raf); raf = 0; layout(); };

  /* ---------- history (our own undo/redo) ---------- */
  function pathOf(node) {
    const p = []; while (node && node !== ed) { const par = node.parentNode; if (!par) return null; p.push(Array.prototype.indexOf.call(par.childNodes, node)); node = par; }
    return node === ed ? p.reverse() : null;
  }
  function nodeAt(path) { let n = ed; for (const i of path) { if (!n.childNodes[i]) return null; n = n.childNodes[i]; } return n; }
  function getSel() {
    const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0);
    if (!ed.contains(r.startContainer) || !ed.contains(r.endContainer)) return null;
    const a = pathOf(r.startContainer), b = pathOf(r.endContainer); if (!a || !b) return null;
    return { s: a, so: r.startOffset, e: b, eo: r.endOffset };
  }
  function setSel(sel) {
    try {
      const s = getSelection(); s.removeAllRanges(); const r = document.createRange();
      const a = sel && nodeAt(sel.s), b = sel && nodeAt(sel.e);
      if (a && b) { r.setStart(a, Math.min(sel.so, a.nodeType === 3 ? a.nodeValue.length : a.childNodes.length)); r.setEnd(b, Math.min(sel.eo, b.nodeType === 3 ? b.nodeValue.length : b.childNodes.length)); }
      else { r.selectNodeContents(ed); r.collapse(false); }
      s.addRange(r);
    } catch (e) { }
  }
  function snapshot() {
    const html = ed.innerHTML;
    if (hidx >= 0 && hist[hidx].html === html) return;
    const entry = { html, sel: getSel() }, now = Date.now();
    if (hidx >= 0 && hidx === hist.length - 1 && !breakNext && now - lastPush < 900) hist[hidx] = entry;
    else { hist.length = hidx + 1; hist.push(entry); hidx++; lastPush = now; if (hist.length > 300) { hist.shift(); hidx--; } }
    breakNext = false;
    if (pendingAuto) { pendingAuto.entry = hist[hidx]; lastAuto = pendingAuto; pendingAuto = null; }
    doc.html = PX.img.stripUrls(PX.stripHeader(html)); doc.modified = Date.now(); doc.words = U.words(bodyText());
    PX.saveSoon();
  }
  function restore(h) {
    ed.innerHTML = h.html; ed.focus(); setSel(h.sel); breakNext = true;
    layout(); doc.html = PX.img.stripUrls(PX.stripHeader(ed.innerHTML)); doc.modified = Date.now(); doc.words = U.words(bodyText()); PX.saveSoon();
    caretIntoView();
  }
  E.undo = function () {
    E.layoutNow();
    if (lastAuto && hist[hidx] === lastAuto.entry) {      // undoing the automatic correction itself means "leave this word alone"
      PX.S.trKeep = PX.S.trKeep || {}; PX.S.trKeep[lastAuto.typed.toLowerCase()] = 1; PX.saveSoon();
      PX.toast("Okay, “" + lastAuto.typed + "” will not be changed again.");
    }
    lastAuto = null;
    if (hidx > 0) { hidx--; restore(hist[hidx]); }
  };
  E.redo = function () { E.layoutNow(); if (hidx < hist.length - 1) { hidx++; restore(hist[hidx]); } };
  E.canUndo = () => hidx > 0; E.canRedo = () => hidx < hist.length - 1;

  /* ---------- formatting commands ---------- */
  function fixSizeSpans() {
    ed.querySelectorAll('font[size="7"], span[style*="xxx-large"]').forEach(el => {
      if (el.tagName === "FONT") { const s = document.createElement("span"); while (el.firstChild) s.appendChild(el.firstChild); el.replaceWith(s); el = s; }
      el.style.fontSize = pendingSize + "pt";
    });
    ed.querySelectorAll("font[face]").forEach(el => { const s = document.createElement("span"); s.style.fontFamily = el.getAttribute("face"); while (el.firstChild) s.appendChild(el.firstChild); el.replaceWith(s); });
  }
  let lastRange = null;                       // the selection before the user clicked a dropdown in the toolbar
  function focusEd() {
    if (document.activeElement === ed) return;
    ed.focus();
    if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
  }
  E.cmd = function (name, arg) { focusEd(); document.execCommand(name, false, arg); scheduleLayout(true); };
  E.block = tag => E.cmd("formatBlock", "<" + tag + ">");
  E.setSize = function (pt) { pendingSize = pt; E.cmd("fontSize", "7"); };
  E.setFont = name => E.cmd("fontName", name);
  E.focus = () => ed.focus();
  E.clearFormat = function () { focusEd(); document.execCommand("removeFormat"); document.execCommand("formatBlock", false, "<p>"); scheduleLayout(true); };

  /* what the toolbar should show for the current selection */
  E.state = function () {
    const s = getSelection(); if (!s.rangeCount || !ed.contains(s.anchorNode)) return null;
    let el = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode; if (!el || el === ed) el = ed.firstElementChild || ed;
    const cs = getComputedStyle(el), q = c => { try { return document.queryCommandState(c); } catch (e) { return false; } };
    let b = el; while (b && b !== ed && !BLOCKS.test(b.tagName) && !/^(UL|OL)$/.test(b.tagName)) b = b.parentElement;
    return {
      bold: q("bold"), italic: q("italic"), underline: q("underline"), strike: q("strikeThrough"), ul: q("insertUnorderedList"), ol: q("insertOrderedList"),
      left: q("justifyLeft"), center: q("justifyCenter"), right: q("justifyRight"), full: q("justifyFull"),
      block: b && b !== ed ? (b.tagName === "LI" ? "P" : b.tagName) : "P",
      size: Math.round(U.px2pt(parseFloat(cs.fontSize)) * 2) / 2, font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim()
    };
  };

  /* ---------- statistics, current page ---------- */
  E.stats = function () {
    const text = bodyText(), sel = getSelection();
    let selWords = 0; if (sel.rangeCount && !sel.isCollapsed && ed.contains(sel.anchorNode)) selWords = U.words(sel.toString());
    return { words: U.words(text), chars: text.length, pages, selWords, page: currentPage() };
  };
  function currentPage() {
    const s = getSelection(); if (!s.rangeCount || !ed.contains(s.anchorNode)) return 0;
    let r = s.getRangeAt(0).cloneRange(); r.collapse(true); let rc = r.getClientRects()[0];
    if (!rc) { const el = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode; rc = el.getBoundingClientRect(); }
    const y = (rc.top - paper.getBoundingClientRect().top) / zoom, ph = geom().ph;
    return Math.min(pages, Math.max(1, Math.floor((y + 4) / (ph + GAP)) + 1));
  }
  function caretIntoView() {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0).cloneRange(); r.collapse(false);
    const rc = r.getClientRects()[0] || (s.focusNode && (s.focusNode.nodeType === 3 ? s.focusNode.parentElement : s.focusNode).getBoundingClientRect());
    if (!rc) return; const sr = stage.getBoundingClientRect();
    if (rc.bottom > sr.bottom - 40) stage.scrollTop += rc.bottom - sr.bottom + 80;
    else if (rc.top < sr.top + 20) stage.scrollTop -= sr.top - rc.top + 80;
  }
  E.gotoPage = function (n) {
    const g = geom(), y = (n - 1) * (g.ph + GAP) * zoom; stage.scrollTop = paper.offsetTop + y - 12;
  };

  /* ---------- paste: keep headings/lists/bold/italic, drop everything else ---------- */
  const KEEP = { P: "P", H1: "H1", H2: "H2", H3: "H3", H4: "H3", H5: "H3", H6: "H3", UL: "UL", OL: "OL", LI: "LI", BLOCKQUOTE: "BLOCKQUOTE", DIV: "P", B: "B", STRONG: "B", I: "I", EM: "I", U: "U", S: "S", STRIKE: "S", SUB: "SUB", SUP: "SUP", BR: "BR" };
  function sanitize(src, out) {
    src.childNodes.forEach(c => {
      if (c.nodeType === 3) { out.appendChild(document.createTextNode(c.nodeValue.replace(/ /g, " "))); return; }
      if (c.nodeType !== 1) return;
      const tag = c.tagName;
      if (tag === "FIGURE" && c.dataset.img && PX.D.images[c.dataset.img]) {                       // a picture copied from Phoenix itself
        const cap = (c.querySelector("figcaption") || {}).textContent || "", sz = /plate/.test(c.className) ? "plate" : /small/.test(c.className) ? "small" : "wide";
        out.appendChild(E.makeFigure(PX.D.images[c.dataset.img], sz, cap)); return;
      }
      if (c.classList.contains("pgap") || /^(SCRIPT|STYLE|META|LINK|IMG|IFRAME|OBJECT|HEAD|TITLE|SVG|CANVAS)$/.test(tag)) return;
      let tgt = out;
      if (KEEP[tag]) { const el = document.createElement(KEEP[tag]); out.appendChild(el); if (tag !== "BR") tgt = el; else return; }
      else if (tag === "SPAN") {
        const st = c.style; let t = out;
        if (st.fontWeight === "bold" || +st.fontWeight >= 600) { const e = document.createElement("b"); t.appendChild(e); t = e; }
        if (st.fontStyle === "italic") { const e = document.createElement("i"); t.appendChild(e); t = e; }
        if (/underline/.test(st.textDecoration || st.textDecorationLine)) { const e = document.createElement("u"); t.appendChild(e); t = e; }
        tgt = t;
      }
      sanitize(c, tgt);
    });
  }
  function onPaste(e) {
    const cd = e.clipboardData; if (!cd) return;
    const pics = Array.from(cd.files || []).filter(f => /^image\//.test(f.type));
    if (pics.length && !cd.getData("text/plain")) { e.preventDefault(); if (PX.images) PX.images.addFiles(pics); return; }       // a copied picture (screenshot, from a browser)
    e.preventDefault();
    const html = cd.getData("text/html"), text = cd.getData("text/plain");
    let out;
    if (html) { const d = new DOMParser().parseFromString(html, "text/html"), frag = document.createElement("div"); sanitize(d.body, frag); out = frag.innerHTML; }
    if (!out || !out.trim()) out = text.split(/\r?\n/).map(l => "<p>" + (U.esc(l) || "<br>") + "</p>").join("");
    document.execCommand("insertHTML", false, out); scheduleLayout(true);
  }

  /* ---------- loading a document into the page ---------- */
  E.load = function (d) {
    doc = d; applyStyle();
    ed.innerHTML = PX.docHeader(d) + (d.html || "<p><br></p>");
    if (!ed.firstChild) ed.innerHTML = "<p><br></p>";
    PX.img.hydrate(ed); if (E.onLoad) E.onLoad();
    sheetKey = ""; pages = 1; hist = [{ html: ed.innerHTML, sel: null }]; hidx = 0; breakNext = true;
    layout(); stage.scrollTop = 0;
  };
  E.refresh = function () { if (!doc) return; applyStyle(); sheetKey = ""; layout(); };
  E.unload = function () { doc = null; ed.innerHTML = ""; if (hasHL) ["note", "good", "fix", "lang"].forEach(k => CSS.highlights.delete("pxc-" + k)); };
  E.setZoom = function (z) { PX.S.zoom = Math.min(2.5, Math.max(0.4, z)); applyZoom(); PX.saveSoon(); };
  E.fitWidth = function () { const g = geom(); E.setZoom((stage.clientWidth - 48) / g.pw); };
  E.plainText = function (html) {
    const d = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    const parts = []; d.body.querySelectorAll("p,h1,h2,h3,blockquote,li").forEach(el => { if (el.tagName === "BLOCKQUOTE" && el.querySelector("p")) return; parts.push(el.textContent); });
    return parts.join("\n\n").trim();
  };
  E.cleanHtml = () => PX.img.stripUrls(PX.stripHeader(ed.innerHTML).replace(/<(span|div)[^>]*class="pgap[^"]*"[^>]*><\/\1>/g, ""));

  /* ---------- pictures: <figure class="fig plate|wide|small" data-img="id"><img data-img="id" width height alt><figcaption>…</figcaption></figure> ----------
     plate = a page of its own, wide = the width of the text, small = centred, about half the width. The block is not editable text: it is changed with the bar that appears when it is clicked. */
  E.makeFigure = function (rec, size, caption) {
    const f = document.createElement("figure"); f.className = "fig " + size; f.contentEditable = "false"; f.dataset.img = rec.id;
    const i = document.createElement("img"); i.dataset.img = rec.id; i.setAttribute("width", rec.w || 800); i.setAttribute("height", rec.h || 600); i.alt = caption || rec.name || "";
    f.appendChild(i); if (caption) { const c = document.createElement("figcaption"); c.textContent = caption; f.appendChild(c); }
    PX.img.hydrate(f); return f;
  };
  E.insertFigure = function (rec, size) {            // after the paragraph the cursor is in (an empty paragraph is replaced)
    if (!doc) return null; focusEd(); stripGaps();
    let blk = null; const s = getSelection();
    if (s.rangeCount && ed.contains(s.anchorNode)) { let n = s.anchorNode; while (n && n.parentNode !== ed) n = n.parentNode; blk = n; }
    if (!blk) blk = ed.lastElementChild;
    const fig = E.makeFigure(rec, size, ""), empty = blk && blk.tagName === "P" && !blk.textContent.trim() && !blk.querySelector("img");
    if (blk && !empty) blk.after(fig); else if (blk) blk.replaceWith(fig); else ed.appendChild(fig);
    let nx = fig.nextElementSibling; if (!nx || nx.classList.contains("fig")) { nx = document.createElement("p"); nx.innerHTML = "<br>"; fig.after(nx); }
    try { const r = document.createRange(); r.selectNodeContents(nx); r.collapse(true); s.removeAllRanges(); s.addRange(r); } catch (e) { }       // cursor goes to the text after the picture
    E.touch(); return fig;
  };
  E.touch = function () { breakNext = true; scheduleLayout(true); };
  E.hydrate = () => { if (doc) PX.img.hydrate(ed); };

  /* ---------- comments ----------
     A comment remembers the passage it is about as quoted text (plus a little text before and after it). We find that passage
     again whenever needed and paint it with the CSS Highlight API, so the document itself never gets marker tags. */
  function pageOfY(top) { const y = (top - paper.getBoundingClientRect().top) / zoom; return Math.min(pages, Math.max(1, Math.floor((y + 4) / (geom().ph + GAP)) + 1)); }
  function flat() {                               // all text of the document as one string, remembering which text node starts where
    const nodes = []; let text = "", last = null;
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      if (n.parentElement && n.parentElement.closest(".pgap")) continue;
      const u = unitOf(n) || ed;
      if (last && u !== last && text && !/ $/.test(text)) text += " ";
      last = u; nodes.push({ n, s: text.length }); text += n.nodeValue.replace(/\s/g, " ");
    }
    return { text, nodes };
  }
  E.selectionInfo = function () {
    const s = getSelection(); if (!s.rangeCount || s.isCollapsed || !ed.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0), f = flat(); let a = Infinity, b = -1;
    f.nodes.forEach(e => {
      if (!r.intersectsNode(e.n)) return; const len = e.n.nodeValue.length;
      const x = e.n === r.startContainer ? r.startOffset : 0, y = e.n === r.endContainer ? r.endOffset : len;
      if (y <= x) return; a = Math.min(a, e.s + x); b = Math.max(b, e.s + y);
    });
    if (b < 0) return null;
    while (a < b && f.text[a] === " ") a++; while (b > a && f.text[b - 1] === " ") b--;
    if (b <= a) return null;
    const rc = r.getClientRects()[0];
    // the whole sentence around the selection (used as the example sentence for a word)
    const ends = [...f.text.slice(0, a).matchAll(/[.!?…]+["”')\]]*\s+/g)].pop(), s0 = ends ? ends.index + ends[0].length : 0;
    const e1 = f.text.slice(b).match(/[.!?…]+["”')\]]*(\s|$)/), s1 = e1 ? b + e1.index + e1[0].trimEnd().length : f.text.length;
    return { quote: f.text.slice(a, b), pos: a, before: f.text.slice(Math.max(0, a - 24), a), after: f.text.slice(b, b + 24), page: rc ? pageOfY(rc.top) : 1, sentence: f.text.slice(s0, s1).trim().slice(0, 500) };
  };
  const common = (a, b, fromEnd) => { let i = 0; while (i < a.length && i < b.length && (fromEnd ? a[a.length - 1 - i] === b[b.length - 1 - i] : a[i] === b[i])) i++; return i; };
  function findQuote(f, c) {
    const q = c.quote; if (!q) return -1; let best = -1, score = -Infinity, i = -1;
    while ((i = f.text.indexOf(q, i + 1)) !== -1) {      // the same words may occur twice: prefer the one with the same surroundings, then the nearest to where it was
      const sc = (common(f.text.slice(Math.max(0, i - 24), i), c.before || "", true) + common(f.text.slice(i + q.length, i + q.length + 24), c.after || "", false)) * 100000 - Math.abs(i - (c.pos || 0));
      if (sc > score) { score = sc; best = i; }
    }
    return best;
  }
  function toRange(f, s, e) {
    let a = null, b = null;
    for (const x of f.nodes) {
      const len = x.n.nodeValue.length;
      if (!a && x.s + len > s) a = { n: x.n, o: Math.max(0, s - x.s) };
      if (x.s < e && x.s + len >= e) { b = { n: x.n, o: Math.min(len, e - x.s) }; break; }
    }
    if (!a || !b) return null;
    const r = document.createRange(); r.setStart(a.n, a.o); r.setEnd(b.n, b.o); return r;
  }
  const hasHL = !!(window.CSS && CSS.highlights && window.Highlight);
  E.found = {};                                   // comment id -> was its passage found in the open document?
  E.refreshComments = function () {
    if (!doc || !ed.getClientRects().length) return;
    const list = doc.comments || [], groups = { note: [], good: [], fix: [], lang: [] }; let changed = false; E.found = {};
    if (list.length) {
      const f = flat();
      list.forEach(c => {
        const i = findQuote(f, c), r = i < 0 ? null : toRange(f, i, i + c.quote.length);
        E.found[c.id] = !!r;
        if (!r) { if (c.page) { c.page = 0; changed = true; } return; }
        const rc = r.getClientRects()[0], pg = rc ? pageOfY(rc.top) : c.page;
        if (c.pos !== i || c.page !== pg) { c.pos = i; c.page = pg; changed = true; }
        if (!c.done && groups[c.kind]) groups[c.kind].push(r);
      });
    }
    if (hasHL) Object.keys(groups).forEach(k => { if (E.showHL !== false && groups[k].length) CSS.highlights.set("pxc-" + k, new Highlight(...groups[k])); else CSS.highlights.delete("pxc-" + k); });
    if (changed) PX.saveSoon();
    if (E.onComments) E.onComments();
  };
  const refreshSoon = U.debounce(() => E.refreshComments(), 300);
  E.reveal = function (id) {                      // select a comment's passage in the text and scroll to it
    if (!doc) return false; const c = (doc.comments || []).find(x => x.id === id); if (!c) return false;
    E.layoutNow(); const f = flat(), i = findQuote(f, c); if (i < 0) return false;
    const r = toRange(f, i, i + c.quote.length); if (!r) return false;
    ed.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const rc = r.getClientRects()[0]; if (rc) { const sr = stage.getBoundingClientRect(); stage.scrollTop += rc.top - sr.top - sr.height / 3; }
    return true;
  };

  /* ---------- Turkish autocorrect: when a word is finished (space, punctuation, Enter) put ç ş ğ ı back ---------- */
  let lastAuto = null, pendingAuto = null;        // the last automatic correction, so that Ctrl+Z can both undo it and teach us to leave that word alone
  function wordBeforeCaret() {
    const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return null;
    const r = s.getRangeAt(0), tn = r.startContainer; if (tn.nodeType !== 3 || !ed.contains(tn)) return null;
    const before = tn.nodeValue.slice(0, r.startOffset), m = before.match(/[\p{L}'’]+$/u); if (!m) return null;
    const start = before.length - m[0].length, prev = before[start - 1];
    if (prev && /[\p{L}\p{N}@\/\\_#.:\-]/u.test(prev)) return null;            // part of an e-mail address, a path, a number...
    return { tn, start, end: before.length, word: m[0] };
  }
  function autoFix(e) {
    if (!doc || doc.lang !== "tr" || PX.S.trAuto === false || !PX.tr || !PX.tr.ready) return false;
    const isDelim = e.inputType === "insertText" && e.data && /^[ .,;:!?)"”»]$/.test(e.data), isEnter = e.inputType === "insertParagraph";
    if (!isDelim && !isEnter) return false;
    const w1 = wordBeforeCaret(); if (!w1) return false;
    const fixed = PX.tr.fixWord(w1.word); if (fixed === w1.word) return false;
    e.preventDefault();
    E.layoutNow();                                 // snapshot "word as typed" first, so Ctrl+Z brings exactly that back
    const w = wordBeforeCaret(); const ok = w && w.word === w1.word;
    if (ok) {
      breakNext = true;
      getSelection().setBaseAndExtent(w.tn, w.start, w.tn, w.end); document.execCommand("insertText", false, fixed);
      pendingAuto = { typed: w1.word };            // becomes lastAuto once the next history entry exists (see snapshot)
    }
    document.execCommand(isEnter ? "insertParagraph" : "insertText", false, e.data);
    scheduleLayout(true); return true;
  }

  /* ---------- wiring ---------- */
  E.init = function () {
    ed = document.getElementById("editor"); paper = document.getElementById("paper"); sheets = document.getElementById("sheets");
    wrap = document.getElementById("zoomWrap"); stage = document.getElementById("stage");
    try { document.execCommand("defaultParagraphSeparator", false, "p"); document.execCommand("styleWithCSS", false, true); } catch (e) { }
    ed.addEventListener("input", () => { if (!composing) scheduleLayout(false); });
    ed.addEventListener("compositionstart", () => { composing = true; });
    ed.addEventListener("compositionend", () => { composing = false; scheduleLayout(false); });
    ed.addEventListener("beforeinput", e => {
      if (autoFix(e)) return;
      if (e.inputType === "historyUndo") { e.preventDefault(); E.undo(); }
      else if (e.inputType === "historyRedo") { e.preventDefault(); E.redo(); }
      else if (/^(deleteContent|insertFromPaste|insertFromDrop|formatBold|formatItalic|formatUnderline)/.test(e.inputType) && e.inputType !== "deleteContentBackward") breakNext = true;
    });
    ed.addEventListener("keydown", e => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); E.undo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); E.redo(); }
      else if (k === "backspace" && !e.ctrlKey && !e.metaKey && atTextStart()) e.preventDefault();       // do not let Backspace eat the locked chapter heading above
      else if (k === "enter") breakNext = true;
      else if (k === "tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {   // Tab = a paragraph-sized gap (two em-spaces), not "jump to the next button"
        e.preventDefault(); document.execCommand("insertText", false, "  "); scheduleLayout(true);
      }
    });
    ed.addEventListener("contextmenu", e => {         // right-click on selected text: our menu (comment...); anywhere else the browser's own menu (spelling suggestions)
      const s = getSelection(); if (!E.onContext || !s.rangeCount || s.isCollapsed || !ed.contains(s.anchorNode)) return;
      const inside = Array.from(s.getRangeAt(0).getClientRects()).some(b => e.clientX >= b.left - 3 && e.clientX <= b.right + 3 && e.clientY >= b.top - 3 && e.clientY <= b.bottom + 3);
      if (!inside) return; const info = E.selectionInfo(); if (!info) return;
      e.preventDefault(); E.onContext(e.clientX, e.clientY, info);
    });
    ed.addEventListener("paste", onPaste);
    ed.addEventListener("dragover", e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); });
    ed.addEventListener("drop", e => {                                  // only picture files are accepted; the rest of outside content is not
      e.preventDefault(); const pics = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /^image\//.test(f.type));
      if (pics.length && PX.images) PX.images.addFiles(pics);
    });
    ed.addEventListener("keyup", caretIntoView);
    document.addEventListener("selectionchange", () => {
      const s = getSelection();
      if (doc && s.rangeCount && ed.contains(s.anchorNode)) { lastRange = s.getRangeAt(0).cloneRange(); if (E.onSelection) E.onSelection(); }
    });
    PX.flushEditor = () => { if (raf && doc) E.layoutNow(); };
    new ResizeObserver(() => { if (doc && stage.clientWidth) applyZoom(); }).observe(stage);
  };
})(window.PX);
