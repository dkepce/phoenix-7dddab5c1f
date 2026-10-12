/* Phoenix — the Read tab. Every document is shown in a way that suits its type:
   book + journal = an open book whose pages turn (arrow keys), document = pages flipping up on a clipboard, story = calm single pages,
   email = a message in an inbox, note = a sticky note on a cork board.

   Pages: we lay a document out exactly like the editor does (same break rules as js/editor.js, copied here in a headless form):
   the text is measured once in a hidden box where invisible spacers push every line that would be cut by a page edge onto the next page.
   A page is then just a window onto that laid-out column, shifted up by (page number x page step). Pages are only built when they are near the one being read. */
(function (PX) {
  const U = PX.U, $ = id => document.getElementById(id);
  const R = (PX.read = {});
  const GAP = 28, FLIP_MS = 900;
  let ctl = null;                                    // the controller of whatever is on screen: { el, natural:[w,h]|null, key(e), hud(), dispose() }

  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const px = n => Math.round(n * 100) / 100 + "px";

  /* ---------- pagination (headless copy of the editor's layout) ---------- */
  const host = h("div"); host.id = "rdMeasure"; document.body.appendChild(host);
  const rg = document.createRange();
  const BLOCKS = /^(P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|DIV)$/;
  function geom(p) {
    let w = p.w, hh = p.h; if (p.landscape) [w, hh] = [hh, w];
    const g = { pw: U.mm2px(w), ph: U.mm2px(hh), mt: U.mm2px(p.mt), mr: U.mm2px(p.mr), mb: U.mm2px(p.mb), ml: U.mm2px(p.ml) };
    g.C = Math.max(120, g.ph - g.mt - g.mb); g.G = g.mb + GAP + g.mt; return g;
  }
  function unitOf(node, root) { let n = node.parentNode; while (n && n !== root && !BLOCKS.test(n.tagName)) n = n.parentNode; return n && n !== root ? n : null; }
  function lead(node, hh) { const el = node.parentElement; let lh = el ? parseFloat(getComputedStyle(el).lineHeight) : NaN; if (isNaN(lh)) lh = hh * 1.2; return Math.max(0, (lh - hh) / 2); }
  function charIndex(b) {
    const nodes = []; let total = 0; const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (!n.nodeValue.length) continue; nodes.push({ n, s: total }); total += n.nodeValue.length; }
    return { nodes, total };
  }
  function locate(ci, idx) { let lo = 0, hi = ci.nodes.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ci.nodes[m].s <= idx) lo = m; else hi = m - 1; } return { node: ci.nodes[lo].n, off: idx - ci.nodes[lo].s }; }
  function rectAt(ci, idx) { const l = locate(ci, idx); rg.setStart(l.node, l.off); rg.setEnd(l.node, l.off + 1); const rs = rg.getClientRects(); if (!rs.length) return null; const r = rs[0]; return r.width === 0 && r.height === 0 ? null : r; }
  function validFrom(ci, idx, max) { for (let i = idx; i <= max && i < idx + 600; i++) { const r = rectAt(ci, i); if (r) return { idx: i, r }; } return null; }
  function gap(hh, inline) { const s = document.createElement(inline ? "span" : "div"); s.className = "pgap" + (inline ? " in" : ""); s.style.height = hh + "px"; return s; }

  function place(root, g) {                          // returns the number of pages; the spacers are left in `root`
    const C = g.C, G = g.G, base = root.getBoundingClientRect().top + g.mt, Y = v => v - base;
    const pageStart = p => p * (C + G), pageEnd = p => p * (C + G) + C;
    let S = 0, page = 0; const ins = [];
    for (const b of Array.from(root.children)) {
      const cs = getComputedStyle(b), r = b.getBoundingClientRect();
      const top = Y(r.top), bottom = Y(r.bottom) - (parseFloat(cs.paddingBottom) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
      if (bottom + S <= pageEnd(page) + 0.5) continue;
      if (b.classList.contains("fig")) { const hh = pageStart(page + 1) - (top + S); if (hh > 0) { ins.push({ before: b, h: hh }); S += hh; page++; } continue; }     // a picture is never cut (same rule as the editor)
      const ci = charIndex(b), first = validFrom(ci, 0, ci.total - 1);
      if (!first) { const hh = pageStart(page + 1) - (top + S); if (hh > 0) { ins.push({ before: b, h: hh }); S += hh; page++; } continue; }
      let from = first.idx;
      for (let guard = 0; guard < 400; guard++) {
        const limit = pageEnd(page) + 0.5 - S; let lo = from, hi = ci.total - 1, hit = null;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, f = validFrom(ci, mid, hi);
          if (!f) { hi = mid - 1; continue; }
          const l = locate(ci, f.idx), bot = Y(f.r.bottom) + lead(l.node, Y(f.r.bottom) - Y(f.r.top));
          if (bot > limit) { hit = f; hi = mid - 1; } else lo = f.idx + 1;
        }
        if (!hit) break;
        let start = hit, i = hit.idx - 1, steps = 0, topMin = Y(hit.r.top);
        while (i >= from && steps++ < 600) { const r2 = rectAt(ci, i); if (!r2) { i--; continue; } if (Y(r2.bottom) <= Y(hit.r.top) + 1) break; start = { idx: i, r: r2 }; topMin = Math.min(topMin, Y(r2.top)); i--; }
        const sl = locate(ci, start.idx), ld = lead(sl.node, Y(start.r.bottom) - Y(start.r.top)), lineTop = topMin - ld;
        const unit = unitOf(sl.node, root); let atUnitStart = false;
        if (unit) { rg.setStart(unit, 0); rg.setEnd(sl.node, sl.off); atUnitStart = rg.toString().trim() === ""; }
        if (atUnitStart) {
          const ur = unit.getBoundingClientRect(), ucs = getComputedStyle(unit), pt = (parseFloat(ucs.paddingTop) || 0) + (parseFloat(ucs.borderTopWidth) || 0);
          const hh = Math.max(1, pageStart(page + 1) - (Y(ur.top) + S) - pt); ins.push({ before: unit, h: hh }); S += hh;
        } else { const hh = Math.max(1, pageStart(page + 1) - (lineTop + S)); ins.push({ node: sl.node, off: sl.off, h: hh }); S += hh; }
        page++; from = start.idx + 1; if (from >= ci.total) break;
      }
    }
    for (let k = ins.length - 1; k >= 0; k--) {
      const it = ins[k];
      if (it.before) it.before.parentNode.insertBefore(gap(it.h, false), it.before);
      else { let tn = it.node; if (it.off > 0) tn = tn.splitText(it.off); tn.parentNode.insertBefore(gap(it.h, true), tn); }
    }
    return page + 1;
  }

  const cache = new Map();
  function paginate(d, pre) {
    const key = [d.id, d.modified, JSON.stringify(d.page), JSON.stringify(d.text), d.lang, pre || "", PX.img.ver].join("|");
    if (cache.has(key)) return cache.get(key);
    const g = geom(d.page), t = d.text, el = bodyEl(d, true);
    el.style.width = px(g.pw); el.style.padding = [g.mt, g.mr, g.mb, g.ml].map(px).join(" "); el.style.setProperty("--C", px(g.C));
    el.innerHTML = (pre || "") + (d.html || "<p><br></p>");
    el.querySelectorAll(".pgap").forEach(n => n.remove());
    PX.img.hydrate(el);
    host.appendChild(el);
    const pages = place(el, g); host.removeChild(el);
    const info = { g, pages, el, pa: PX.PAPER[d.page.paper] || PX.PAPER.paper, numbers: d.page.numbers, words: d.words || 0 };
    cache.set(key, info); if (cache.size > 60) cache.delete(cache.keys().next().value);
    return info;
  }
  function bodyEl(d, indentToo) {                    // an element that styles text the way this document's settings say
    const t = d.text, el = h("div", "doc-body" + (t.indent ? " indent" : ""));
    el.style.setProperty("--font", '"' + t.font + '"'); el.style.setProperty("--fs", px(U.pt2px(t.size))); el.style.setProperty("--lh", t.lh); el.style.setProperty("--ps", t.ps + "em");
    el.lang = d.lang; return el;
  }
  function pageEl(info, i, label) {                  // page i of a paginated document
    const g = info.g, p = h("div", "rpage"); p.style.width = px(g.pw); p.style.height = px(g.ph);
    p.style.setProperty("--sheet", info.pa[0]); p.style.setProperty("--ink", info.pa[1]);
    const body = info.el.cloneNode(true); body.style.transform = "translateY(" + px(-i * (g.C + g.G)) + ")"; p.appendChild(body);
    if (label != null && info.numbers !== "none") {
      const n = h("span", "pnum " + info.numbers, label); n.style.bottom = px(Math.max(4, g.mb / 2 - 7)); n.style.left = px(g.ml); n.style.right = px(g.mr); p.appendChild(n);
    }
    return p;
  }
  const plain = html => { const t = document.createElement("div"); t.innerHTML = html || ""; return t.textContent; };
  const wordsOf = d => d.words || U.words(plain(d.html));
  const fmtDate = (iso, opt) => { const t = new Date(iso + "T12:00:00"); return isNaN(t) ? "" : t.toLocaleDateString(undefined, opt || { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

  /* ---------- the list on the left ---------- */
  let filter = PX.ui.readFilter || "all";
  function items() {
    const q = ($("rdQ").value || "").trim().toLowerCase();
    let list = PX.topList().filter(d => filter === "all" || d.type === filter);
    if (q) list = list.filter(d => (d.title + " " + plain(d.html) + " " + Object.values(d.meta || {}).join(" ")).toLowerCase().includes(q));
    const key = d => d.type === "journal" ? Date.parse((d.meta.date || U.today()) + "T12:00:00") : d.modified;
    return list.sort((a, b) => key(b) - key(a));
  }
  function renderList() {
    $("rdFilter").innerHTML = '<button data-f="all" class="' + (filter === "all" ? "on" : "") + '">All</button>' + Object.entries(PX.TYPES).filter(([, t]) => !t.hidden).map(([k, t]) =>
      '<button data-f="' + k + '" class="' + (filter === k ? "on" : "") + '" title="' + t.name + 's" style="--tc:' + t.color + '">' + t.icon + "</button>").join("");
    const cur = PX.ui.readId, list = items();
    $("rdItems").innerHTML = list.map(d => {
      const t = PX.TYPES[d.type], kids = d.type === "book" ? PX.chapters(d.id).length : 0;
      const sub = d.type === "book" ? kids + (kids === 1 ? " chapter" : " chapters") + (d.meta.author ? " · " + U.esc(d.meta.author) : "") :
        d.type === "journal" ? U.esc(fmtDate(d.meta.date, { day: "numeric", month: "short", year: "numeric" })) :
        d.type === "email" ? "To " + U.esc(d.meta.to || "…") : wordsOf(d).toLocaleString() + " words";
      const title = d.title || (d.type === "journal" ? fmtDate(d.meta.date, { weekday: "long" }) : "Untitled");
      return '<div class="ri' + (d.id === cur ? " on" : "") + '" data-id="' + d.id + '" style="--tc:' + t.color + '"><span class="ti">' + t.icon + '</span><div class="rt"><div class="rn">' + U.esc(title) + '</div><div class="rm">' + t.name + " · " + sub + "</div></div></div>";
    }).join("") || '<div class="none">Nothing here yet. Write something first.</div>';
  }
  $("rdFilter").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; filter = PX.ui.readFilter = b.dataset.f; PX.saveUI(); renderList(); });
  $("rdItems").addEventListener("click", e => { const it = e.target.closest(".ri"); if (it) R.open(it.dataset.id); });
  $("rdQ").addEventListener("input", renderList);

  /* ---------- showing a document ---------- */
  R.show = function () {
    let id = PX.ui.readId; const d0 = PX.D.docs[id];
    if (!d0 || d0.type === "chapter") {                                  // default: what you were writing, or the first thing in the list
      const c = PX.cur(); id = c ? (c.type === "chapter" ? c.parent : c.id) : ((items()[0] || {}).id);
    }
    if (id && PX.D.docs[id]) { PX.ui.readId = id; PX.saveUI(); }
    renderList(); mount();
  };
  R.open = function (id, side) {
    const d = PX.D.docs[id]; if (!d) return;
    PX.ui.readId = d.type === "chapter" ? d.parent : d.id; PX.saveUI(); R.startAt = side;
    if (PX.ui.view !== "read") PX.setView("read"); else { renderList(); mount(); }
  };
  R.render = function () { if (PX.ui.view === "read") { renderList(); mount(); } };

  function unmount() { if (ctl) { try { ctl.dispose && ctl.dispose(); } catch (e) { } ctl.el.remove(); ctl = null; } $("rdHud").innerHTML = ""; }
  function mount() {
    unmount();
    const d = PX.D.docs[PX.ui.readId], view = $("rdView");
    $("rdStage").className = d ? "t-" + d.type : "";
    if (!d) { view.innerHTML = '<div class="rd-empty">Pick something on the left to read it.</div>'; return; }
    view.innerHTML = "";
    const make = { book: mountBook, journal: mountBook, document: mountBoard, story: mountStory, chapter: mountStory, email: mountMail, note: mountNote }[d.type] || mountStory;
    ctl = make(d); view.appendChild(ctl.el); R.startAt = null; fit(); hud();
  }
  function fit() {
    if (!ctl || !ctl.natural) return;
    const view = $("rdView"), W = view.clientWidth, H = view.clientHeight; if (!W || !H) return;
    const [nw, nh] = ctl.natural, k = Math.min((W - 70) / nw, (H - 110) / nh, 1.35);
    ctl.fitEl.style.transform = "translate(-50%,-50%) scale(" + k + ")";
  }
  new ResizeObserver(() => fit()).observe($("rdView"));
  function hud() {
    if (!ctl) return;
    const x = ctl.hud ? ctl.hud() : null; if (!x) { $("rdHud").innerHTML = ""; return; }
    $("rdHud").innerHTML = (x.nav ? '<button data-n="-1" title="Previous (←)"' + (x.first ? " disabled" : "") + '>‹</button>' : "") + '<span class="hl">' + x.label + "</span>" + (x.nav ? '<button data-n="1" title="Next (→)"' + (x.last ? " disabled" : "") + ">›</button>" : "") +
      (x.extra || "") + (x.edit ? '<button data-edit="' + x.edit + '" class="ed" title="Open this in Write">Edit</button>' : "") + (x.hint ? '<span class="hint">' + x.hint + "</span>" : "");
  }
  $("rdHud").addEventListener("click", e => {
    const n = e.target.closest("[data-n]"); if (n && ctl && ctl.step) { ctl.step(+n.dataset.n); return; }
    const a = e.target.closest("[data-act]"); if (a && ctl && ctl.act) { ctl.act(a.dataset.act); return; }
    const ed = e.target.closest("[data-edit]"); if (ed) { PX.setView("write"); PX.openDoc(ed.dataset.edit); }
  });
  document.addEventListener("keydown", e => {
    if (PX.ui.view !== "read" || !ctl || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ""))) return;
    if (ctl.key && ctl.key(e)) { e.preventDefault(); }
  });

  /* ================= BOOK and JOURNAL: an open book whose pages turn ================= */
  function bookModel(d) {
    const journal = d.type === "journal";
    let secs;
    if (journal) {
      secs = Object.values(PX.D.docs).filter(x => x.type === "journal").sort((a, b) => (a.meta.date || "").localeCompare(b.meta.date || "") || a.created - b.created).map(x => ({
        doc: x, pre: PX.docHeader(x), name: fmtDate(x.meta.date, { day: "numeric", month: "long", year: "numeric" }) }));
    } else {
      secs = PX.chapters(d.id).map((c, i) => ({ doc: c, pre: PX.docHeader(c), name: "Chapter " + (i + 1) + (c.title ? " · " + c.title : "") }));
    }
    const ref = journal ? (secs[0] ? secs[0].doc : d) : d;                            // page size & type settings of the whole book
    const g = geom(ref.page), pa = PX.PAPER[ref.page.paper] || PX.PAPER.paper;
    const M = { d, journal, secs, g, pa, ref, font: ref.text.font, fs: U.pt2px(ref.text.size), lh: ref.text.lh, sides: [] };
    const cover = PX.COVERS[d.meta.cover] || PX.COVERS[journal ? "tan" : "oxblood"];
    M.cover = cover[0]; M.title = journal ? "Journal" : (d.title || "Untitled book"); M.author = journal ? "" : (d.meta.author || "");
    const S = M.sides; S.push({ k: "cover" }, { k: "endF" });
    secs.forEach(s => { s.info = paginate(s.doc, s.pre); });
    let tocRows = [];
    if (!journal) {
      S.push({ k: "title" }, { k: "copy" });
      const cap = Math.max(5, Math.floor((g.C - M.fs * 5) / (M.fs * M.lh * 1.7))), nTocPages = Math.max(1, Math.ceil(secs.length / cap));
      M.tocCap = cap; M.tocStart = S.length;
      for (let i = 0; i < nTocPages; i++) S.push({ k: "toc", from: i * cap, first: i === 0 });
      if (S.length % 2) S.push({ k: "blank" });
    }
    M.bodyStart = S.length;
    secs.forEach((s, si) => {
      if (!journal && S.length % 2) S.push({ k: "blank" });                            // a chapter starts on a right-hand page
      s.side = S.length;
      for (let i = 0; i < s.info.pages; i++) S.push({ k: "page", info: s.info, i, si });
    });
    if (!secs.length) S.push({ k: "empty" });
    if (S.length % 2) S.push({ k: "blank" });
    S.push({ k: "endB" }, { k: "back" });
    S.forEach((s, i) => { if (s.k === "page") s.label = i - M.bodyStart + 1; });
    secs.forEach(s => { s.label = s.side - M.bodyStart + 1; });
    return M;
  }
  function frontEl(M, cls, inner) {                  // a plain sheet of the book's paper for front matter
    const p = h("div", "rpage " + cls); p.style.width = px(M.g.pw); p.style.height = px(M.g.ph);
    p.style.setProperty("--sheet", M.pa[0]); p.style.setProperty("--ink", M.pa[1]);
    p.style.setProperty("--ffont", '"' + M.font + '", Georgia, serif'); p.style.setProperty("--ffs", px(M.fs));
    p.innerHTML = '<div class="rp-in" style="padding:' + [M.g.mt, M.g.mr, M.g.mb, M.g.ml].map(px).join(" ") + '">' + (inner || "") + "</div>"; return p;
  }
  function sideEl(M, i) {
    const s = M.sides[i], g = M.g; let e;
    const board = cls => { const b = h("div", "rboard " + cls); b.style.width = px(g.pw); b.style.height = px(g.ph); b.style.setProperty("--cover", M.cover); b.style.setProperty("--fs", px(g.pw * 0.082)); return b; };
    switch (s.k) {
      case "cover": e = board("cover"); e.innerHTML = '<div class="orn"></div><div class="ct">' + U.esc(M.title) + '</div><div class="orn small"></div>' + (M.author ? '<div class="ca">' + U.esc(M.author) + "</div>" : ""); break;
      case "back": e = board("cover backc"); e.innerHTML = '<div class="orn small"></div>'; break;
      case "endF": case "endB": e = board("endpaper"); break;
      case "title": e = frontEl(M, "front-title", '<div class="ft-t">' + U.esc(M.title) + '</div><div class="ft-o">❦</div>' + (M.author ? '<div class="ft-a">' + U.esc(M.author) + "</div>" : "")); break;
      case "copy": e = frontEl(M, "front-copy", "<div class=\"fc\">" + U.esc(M.title) + (M.author ? "<br>" + U.esc(M.author) : "") + "<br><br>Written in Phoenix<br>" + new Date().getFullYear() + "</div>"); break;
      case "toc": {
        const rows = M.secs.slice(s.from, s.from + M.tocCap).map((sec, k) => '<li data-go="' + sec.side + '"><span class="tn">' + (s.from + k + 1) + '</span><span class="tt">' + U.esc(sec.doc.title || "Untitled chapter") + '</span><span class="tl"></span><span class="tp">' + sec.label + "</span></li>").join("");
        e = frontEl(M, "front-toc", (s.first ? '<div class="toc-h">Contents</div>' : "") + "<ol>" + (rows || '<li class="toc-none">No chapters yet.</li>') + "</ol>"); break;
      }
      case "page": e = pageEl(s.info, s.i, s.label); break;
      case "empty": e = frontEl(M, "front-empty", '<div class="fc">Nothing written yet.</div>'); break;
      default: e = frontEl(M, "front-blank", "");
    }
    return e;
  }
  function mountBook(d) {
    const M = bookModel(d), g = M.g, N = M.sides.length / 2, root = h("div", "rd-fit"), book = h("div", "rd-book" + (M.journal ? " journal" : ""));
    root.style.width = px(g.pw * 2); root.style.height = px(g.ph); root.appendChild(book);
    if (M.journal) book.appendChild(h("div", "rb-ribbon")); else book.appendChild(h("div", "rb-ribbon"));
    const inner = h("div", "rb-inner"); book.appendChild(inner);
    const leaves = [], filled = [], turned = [];
    for (let j = 0; j < N; j++) {
      const L = h("div", "rb-leaf"); L.style.width = px(g.pw); L.style.height = px(g.ph);
      L.appendChild(h("div", "rb-face front")); L.appendChild(h("div", "rb-face back"));
      L.style.zIndex = N - j + 1; inner.appendChild(L); leaves.push(L); filled.push(false); turned.push(false);
    }
    function fill(j) {
      if (j < 0 || j >= N || filled[j]) return; filled[j] = true; const L = leaves[j];
      [["front", 2 * j], ["back", 2 * j + 1]].forEach(([w, i]) => {
        const f = L.querySelector("." + w); f.innerHTML = ""; f.classList.toggle("pl", i % 2 === 1); f.classList.toggle("pr", i % 2 === 0);   // left or right page: which edge gets the fold shadow
        f.appendChild(sideEl(M, i));
      });
    }
    function near(s) {
      for (let j = 0; j < N; j++) { if (Math.abs(j - s) <= 3) fill(j); else if (Math.abs(j - s) > 7 && filled[j]) { filled[j] = false; leaves[j].querySelectorAll(".rb-face").forEach(f => { f.innerHTML = ""; }); } }
    }
    let s = 0;                                       // number of leaves turned over
    const shift = () => { inner.style.transform = "translateX(" + (s === 0 ? -g.pw / 2 : s === N ? g.pw / 2 : 0) + "px)"; book.classList.toggle("closed", s === 0 || s === N); };
    function settle(j) { leaves[j].style.zIndex = turned[j] ? j + 2 : N - j + 1; }
    let busy = 0;
    function goto(n, instant) {
      n = Math.max(0, Math.min(N, n)); if (n === s) return;
      const fwd = n > s, a = fwd ? s : n, b = fwd ? n : s, count = b - a, order = [];
      for (let j = a; j < b; j++) order.push(fwd ? j : b - 1 - (j - a));          // forward: first leaf first; back: the top leaf of the left pile first
      near(n); order.forEach(j => fill(j));
      const animated = Math.min(count, 8);
      order.forEach((j, k) => {
        const L = leaves[j], snap = instant || k < count - animated;
        L.classList.toggle("snap", snap); turned[j] = fwd;
        if (snap) { L.classList.toggle("turned", fwd); settle(j); return; }
        const kk = k - (count - animated);
        L.style.zIndex = 1000 + (fwd ? j : N - j); L.style.transitionDelay = kk * 85 + "ms";
        L.classList.toggle("turned", fwd);
        setTimeout(() => { L.style.transitionDelay = ""; settle(j); }, FLIP_MS + kk * 85 + 40);
      });
      s = n; shift(); syncMark(null, true); hud();
    }
    function step(k) { goto(s + k); }

    /* ----- bookmark: a long strip with the book's name, or a folded corner (style is a per-book option) ----- */
    const mkey = M.journal ? "journal" : d.id, MARK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
    const markRec = () => PX.D.marks[mkey], mStyle = () => (markRec() && markRec().style) || "strip";
    const markSide = () => {                         // which page (side index) holds the bookmark, -1 if none
      const m = markRec(); if (!m || !m.doc) return -1; const sec = M.secs.find(x => x.doc.id === m.doc);
      return sec ? sec.side + Math.max(0, Math.min(m.i || 0, sec.info.pages - 1)) : -1;
    };
    const markSpread = () => { const k = markSide(); return k < 0 ? -1 : Math.ceil(k / 2); };
    let mel = null, mtimer = 0;                      // the bookmark drawn on the open book
    function bmEl(kind, side) {
      const right = side % 2 === 0;
      if (kind === "strip") {
        const w = Math.round(g.pw * 0.11), el = h("div", "bm bm-strip"), o = '<span class="bm-o"></span>';
        el.style.cssText = "width:" + px(w) + ";height:" + px(g.ph * 1.1) + ";top:" + px(-g.ph * 0.035) + ";left:" + px(right ? g.pw + g.pw * 0.035 : g.pw - g.pw * 0.035 - w) + ";--cover:" + M.cover + ";font-size:" + px(g.pw * 0.04);
        el.innerHTML = '<div class="bm-card">' + o + '<span class="bm-t">' + U.esc(M.title) + "</span>" + o + '<span class="bm-d">❦</span></div>';
        return el;
      }
      const sz = Math.round(g.pw * 0.21), el = h("div", "bm bm-corner " + (right ? "r" : "l"));
      el.style.cssText = "width:" + px(sz) + ";height:" + px(sz) + ";top:" + px(g.ph - sz) + ";left:" + px(right ? 2 * g.pw - sz : 0) + ";--sheet:" + M.pa[0];
      el.innerHTML = '<div class="bc-under"></div><div class="bc-sh"></div><div class="bc-flap"><div class="bc-front"></div><div class="bc-back"></div></div>';
      return el;
    }
    function syncMark(mode, later) {                 // mode "enter"/"leave" animate; otherwise just show it when the marked spread is open
      const sd = markSide(), here = sd >= 0 && markSpread() === s && s > 0 && s < N;
      if (mode === "leave") {
        if (mel) { const old = mel; mel = null; old.classList.add("leave"); old.classList.remove("on"); setTimeout(() => old.remove(), 1000); }
        book.classList.remove("has-mark"); return;
      }
      if (!here) { if (mel) { const old = mel; mel = null; old.classList.add("away"); setTimeout(() => old.remove(), 320); } book.classList.remove("has-mark"); return; }
      if (mel && mel.dataset.k === mStyle() && +mel.dataset.side === sd) return;
      if (later && !mode) { clearTimeout(mtimer); mtimer = setTimeout(() => syncMark(), 780); return; }            // wait until the pages have turned
      if (mel) mel.remove();
      mel = bmEl(mStyle(), sd); mel.dataset.k = mStyle(); mel.dataset.side = sd; book.appendChild(mel); book.classList.add("has-mark");
      if (mode === "enter") { mel.classList.add("enter"); setTimeout(() => { if (mel) mel.classList.add("on"); }, 60); } else mel.classList.add("on", "still");
    }
    function toggleMark() {
      const hereNow = markSide() >= 0 && markSpread() === s && s > 0 && s < N;
      if (hereNow) { markRec().doc = ""; PX.save(); syncMark("leave"); hud(); return; }
      const l = s > 0 ? 2 * s - 1 : -1, r = s < N ? 2 * s : -1, ok = i => i >= 0 && M.sides[i] && M.sides[i].k === "page", sd = ok(r) ? r : ok(l) ? l : -1;
      if (sd < 0) { PX.toast("Turn to a page of a chapter first, then place the bookmark there."); return; }
      const x = M.sides[sd], rec = PX.D.marks[mkey] = PX.D.marks[mkey] || { style: "strip", doc: "", i: 0 };
      rec.doc = M.secs[x.si].doc.id; rec.i = x.i; PX.save();
      if (mel) { mel.remove(); mel = null; } syncMark("enter"); hud();
    }
    function swapStyle() {
      const rec = PX.D.marks[mkey] = PX.D.marks[mkey] || { style: "strip", doc: "", i: 0 };
      rec.style = rec.style === "corner" ? "strip" : "corner"; PX.save();
      if (mel) { mel.remove(); mel = null; } syncMark("enter"); hud();
      PX.toast(rec.style === "corner" ? "Bookmark style: folded corner." : "Bookmark style: strip with the book's title.");
    }
    function markButtons() {
      const hereNow = markSide() >= 0 && markSpread() === s && s > 0 && s < N, elsewhere = markSide() >= 0 && !hereNow;
      return '<button data-act="mark" class="bmb' + (hereNow ? " on" : "") + '" title="' + (hereNow ? "Remove the bookmark (B)" : "Place a bookmark on this page (B)") + '">' + MARK_ICON + "</button>" +
        (elsewhere ? '<button data-act="tomark" class="sm" title="Go to the bookmark">↩ Bookmark</button>' : "") +
        '<button data-act="mstyle" class="sm" title="Swap the bookmark style">' + (mStyle() === "corner" ? "Corner" : "Strip") + "</button>";
    }
    function sideLabel(i) { const x = M.sides[i]; return x && x.k === "page" ? x.label : null; }
    function secOf(i) { const x = M.sides[i]; return x && x.k === "page" ? M.secs[x.si] : null; }
    function where() {
      const l = s > 0 ? 2 * s - 1 : null, r = s < N ? 2 * s : null, pgs = [l, r].map(i => i == null ? null : sideLabel(i)).filter(v => v != null);
      const sec = secOf(r) || secOf(l);
      let label;
      if (s === 0) label = M.title; else if (s === N) label = "The end";
      else if (sec) label = U.esc(sec.name) + " · page " + pgs.join("–") + " of " + (M.sides.length - 2 - M.bodyStart);
      else label = M.sides[r] && M.sides[r].k === "toc" ? "Contents" : M.sides[r] && M.sides[r].k === "title" ? "Title page" : "";
      return { label, edit: sec ? sec.doc.id : d.id };
    }
    book.addEventListener("click", e => {
      const go = e.target.closest("[data-go]"); if (go) { goto(Math.ceil(+go.dataset.go / 2)); return; }
      if (window.getSelection().toString()) return;
      if (s === 0) { step(1); return; }
      if (s === N) { step(-1); return; }
      const r = book.getBoundingClientRect(); (e.clientX > r.left + r.width / 2 ? step(1) : step(-1));
    });
    const startSide = R.startAt != null ? R.startAt : (M.journal ? (M.secs.find(x => x.doc.id === PX.ui.readId) || {}).side : null);
    near(0); shift();
    const first = startSide != null ? Math.ceil(startSide / 2) : (PX.ui.readPos && PX.ui.readPos[d.id]) || Math.max(0, markSpread());     // left-hand pages (odd) show up one spread later; a new reader opens at the bookmark
    if (first) goto(Math.min(first, N), true);
    syncMark();
    const remember = () => { PX.ui.readPos = PX.ui.readPos || {}; PX.ui.readPos[d.id] = s; PX.saveUI(); };
    return {
      el: root, fitEl: root, natural: [g.pw * 2 + 60, g.ph + 40], step,
      key(e) {
        const k = e.key;
        if (k === "ArrowRight" || k === "PageDown" || k === " ") step(1); else if (k === "ArrowLeft" || k === "PageUp") step(-1);
        else if (k === "Home") goto(0); else if (k === "End") goto(N); else if (k === "b" || k === "B") toggleMark(); else return false;
        remember(); return true;
      },
      act(name) { if (name === "mark") toggleMark(); else if (name === "tomark") goto(markSpread()); else if (name === "mstyle") swapStyle(); },
      hud() { const w = where(); remember(); return { nav: true, first: s === 0, last: s === N, label: w.label, edit: w.edit, extra: markButtons(), hint: "← → turn the pages · B bookmark" }; },
      dispose() { clearTimeout(mtimer); }
    };
  }

  /* ================= DOCUMENT: pages flip up on a clipboard ================= */
  function mountBoard(d) {
    const info = paginate(d), g = info.g, N = info.pages, root = h("div", "rd-fit"), W = g.pw + 110, H = g.ph + 190;
    root.style.width = px(W); root.style.height = px(H);
    const board = h("div", "rd-board"); board.style.cssText = "width:" + px(W) + ";height:" + px(H);
    board.innerHTML = '<div class="bd-label">' + U.esc(d.title || "Untitled document") + '</div><div class="bd-clip"><i></i></div>' +
      '<div class="bd-stamp s-' + (d.meta.status || "Draft").replace(/\s/g, "").toLowerCase() + '">' + U.esc((d.meta.status || "Draft").toUpperCase()) + "</div>";
    const pile = h("div", "bd-pile"); pile.style.cssText = "left:55px;top:84px;width:" + px(g.pw) + ";height:" + px(g.ph); board.appendChild(pile); root.appendChild(board);
    const sheets = [], filled = [], flipped = [];
    for (let j = 0; j < N; j++) {
      const S = h("div", "bd-sheet"); S.style.zIndex = N - j + 1; S.appendChild(h("div", "bd-face front")); S.appendChild(h("div", "bd-face back"));
      pile.appendChild(S); sheets.push(S); filled.push(false); flipped.push(false);
    }
    const fill = j => { if (j < 0 || j >= N || filled[j]) return; filled[j] = true; sheets[j].querySelector(".front").appendChild(pageEl(info, j, j + 1)); };
    let s = 0;
    const near = () => { for (let j = s - 1; j <= s + 3; j++) fill(j); };
    function goto(n) {
      n = Math.max(0, Math.min(N - 1, n)); if (n === s) return;
      const fwd = n > s, a = fwd ? s : n, b = fwd ? n : s; near(); for (let j = a; j <= b; j++) fill(j);
      const order = []; for (let j = a; j < b; j++) order.push(fwd ? j : b - 1 - (j - a));
      order.forEach((j, k) => {
        const S = sheets[j], dl = Math.min(k, 8) * 90; flipped[j] = fwd; S.style.setProperty("--d", dl + "ms"); S.style.zIndex = 1000 + (fwd ? j : N - j);
        S.classList.toggle("up", fwd);
        setTimeout(() => { S.style.removeProperty("--d"); S.style.zIndex = flipped[j] ? j + 2 : N - j + 1; }, FLIP_MS + dl + 40);
      });
      s = n; near(); hud();
    }
    near();
    board.addEventListener("click", e => { if (window.getSelection().toString()) return; const r = board.getBoundingClientRect(); (e.clientY > r.top + r.height * 0.5 ? goto(s + 1) : goto(s - 1)); });
    const start = (PX.ui.readPos && PX.ui.readPos[d.id]) || 0; if (start) { s = Math.min(start, N - 1); for (let j = 0; j < s; j++) { sheets[j].classList.add("up", "snap"); flipped[j] = true; sheets[j].style.zIndex = j + 2; } near(); setTimeout(() => sheets.forEach(x => x.classList.remove("snap")), 80); }
    const remember = () => { PX.ui.readPos = PX.ui.readPos || {}; PX.ui.readPos[d.id] = s; PX.saveUI(); };
    return {
      el: root, fitEl: root, natural: [W + 30, H + 130], step: k => goto(s + k),
      key(e) { const k = e.key; if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " ") goto(s + 1); else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") goto(s - 1); else if (k === "Home") goto(0); else if (k === "End") goto(N - 1); else return false; return true; },
      hud() { remember(); return { nav: true, first: s === 0, last: s === N - 1, label: "Page " + (s + 1) + " of " + N, edit: d.id, hint: "← → flip the pages up" }; }
    };
  }

  /* ================= STORY: calm single pages ================= */
  function mountStory(d) {
    const info = paginate(d), g = info.g, N = info.pages, root = h("div", "rd-fit rd-story");
    root.style.width = px(g.pw); root.style.height = px(g.ph);
    let s = (PX.ui.readPos && PX.ui.readPos[d.id]) || 0; s = Math.min(s, N - 1);
    let curEl = null;
    function show(n, dir) {
      const p = pageEl(info, n, n + 1); p.classList.add("st-page"); root.appendChild(p);
      if (curEl) { const old = curEl; old.classList.add(dir > 0 ? "out-l" : "out-r"); setTimeout(() => old.remove(), 420); p.classList.add(dir > 0 ? "in-r" : "in-l"); requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove("in-r", "in-l"))); }
      curEl = p;
    }
    show(s, 0);
    function goto(n) { n = Math.max(0, Math.min(N - 1, n)); if (n === s) return; const dir = n > s ? 1 : -1; s = n; show(s, dir); hud(); }
    const words = wordsOf(d), mins = Math.max(1, Math.round(words / 200));
    root.addEventListener("click", e => { if (window.getSelection().toString()) return; const r = root.getBoundingClientRect(); goto(e.clientX > r.left + r.width / 2 ? s + 1 : s - 1); });
    return {
      el: root, fitEl: root, natural: [g.pw + 20, g.ph + 20], step: k => goto(s + k),
      key(e) { const k = e.key; if (k === "ArrowRight" || k === "PageDown" || k === " ") goto(s + 1); else if (k === "ArrowLeft" || k === "PageUp") goto(s - 1); else if (k === "Home") goto(0); else if (k === "End") goto(N - 1); else return false; return true; },
      hud() { PX.ui.readPos = PX.ui.readPos || {}; PX.ui.readPos[d.id] = s; PX.saveUI(); return { nav: true, first: s === 0, last: s === N - 1, label: U.esc(d.title || "Untitled") + " · page " + (s + 1) + " of " + N, edit: d.id, hint: words.toLocaleString() + " words · about " + mins + " min" }; }
    };
  }

  /* ================= EMAIL ================= */
  function mountMail(d) {
    const root = h("div", "rd-scroll"), m = d.meta, from = m.from || "Me", to = m.to || "(no recipient)";
    const when = new Date(d.modified).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    root.innerHTML = '<div class="mail"><div class="mail-bar"><i></i><i></i><i></i><span>Inbox</span></div><div class="mail-card">' +
      '<h1 class="m-subj">' + U.esc(d.title || "(no subject)") + '</h1><div class="m-head"><span class="avatar">' + U.esc(from.trim().charAt(0).toUpperCase() || "?") + '</span><div class="m-who"><b>' + U.esc(from) + '</b><div class="m-to">to ' + U.esc(to) + '</div></div><span class="m-date">' + U.esc(when) + "</span></div>" +
      '<div class="m-rule"></div></div></div>';
    const body = bodyEl(d); body.classList.add("m-body"); body.innerHTML = d.html || ""; body.style.setProperty("--ink", "#26303c"); PX.img.hydrate(body); root.querySelector(".mail-card").appendChild(body);
    return { el: root, hud: () => ({ label: "Email · " + wordsOf(d).toLocaleString() + " words", edit: d.id }) };
  }

  /* ================= NOTE ================= */
  function mountNote(d) {
    const root = h("div", "rd-scroll cork"), c = (PX.NOTE_COLORS[d.meta.color] || PX.NOTE_COLORS.yellow)[0];
    root.innerHTML = '<div class="sticky" style="--note:' + c + '"><span class="pin"></span>' + (d.title ? "<h3>" + U.esc(d.title) + "</h3>" : "") + "</div>";
    const body = bodyEl(d); body.classList.add("n-body"); body.innerHTML = d.html || ""; body.style.setProperty("--ink", "#3a3320"); PX.img.hydrate(body); root.querySelector(".sticky").appendChild(body);
    return { el: root, hud: () => ({ label: "Note · " + wordsOf(d).toLocaleString() + " words", edit: d.id }) };
  }
})(window.PX);
