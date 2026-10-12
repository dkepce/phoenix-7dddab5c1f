/* Phoenix — Study tab (step 2): comments collected from the text. Left: a tree (document → comment types). Right: the matching comments as cards.
   Also the right-click menu, the comment dialog and the comment-colours switch. */
(function (PX) {
  const U = PX.U, E = PX.ed, $ = id => document.getElementById(id);
  const KINDS = { note: "Note", good: "Strength", lang: "Language", fix: "To improve" };     // order shown in the tree
  const PHOENIX = "🐦‍🔥";
  PX.KINDS = KINDS; PX.tmp.node = null; PX.tmp.hideDone = false;
  PX.ui.open = PX.ui.open || {};

  /* ---------- Write / Study ---------- */
  PX.setView = function (v) {
    PX.ui.view = v; PX.saveUI();
    $("tabWrite").classList.toggle("on", v === "write"); $("tabStudy").classList.toggle("on", v === "study"); $("tabWorld").classList.toggle("on", v === "world");
    $("work").hidden = v !== "write"; $("study").hidden = v !== "study"; $("world").hidden = v !== "world";
    $("side").classList.toggle("nov", v !== "write"); $("btnSide").style.visibility = v === "write" ? "" : "hidden";
    hideCtx();
    if (v === "write") { E.layoutNow(); E.refreshComments(); } else if (v === "world") PX.world.render(); else renderStudy();
  };
  $("tabWrite").onclick = () => PX.setView("write");
  $("tabStudy").onclick = () => PX.setView("study");

  /* ---------- comment colours on the page: on / off ---------- */
  E.showHL = PX.ui.showHL !== false;
  PX.syncHL = function () { const b = $("tb_hl"); if (b) b.classList.toggle("on", E.showHL); };
  PX.toggleHL = function () {
    E.showHL = !E.showHL; PX.ui.showHL = E.showHL; PX.saveUI(); PX.syncHL(); E.refreshComments();
    PX.toast(E.showHL ? "Comment colours are on." : "Comment colours are off. Comments are still in the Study tab.");
  };

  /* ---------- right-click menu on selected text ---------- */
  const ctx = document.createElement("div"); ctx.id = "ctx"; ctx.hidden = true; document.body.appendChild(ctx);
  let ctxInfo = null;
  function hideCtx() { ctx.hidden = true; }
  E.onContext = function (x, y, info) {
    ctxInfo = info;
    const short = info.quote.split(/\s+/).length <= 4, lw = info.quote.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const known = short && lw && PX.world && PX.world.find(lw, null, PX.ui.cur);
    ctx.innerHTML = (short && lw ? '<button data-a="look">Look up “' + U.esc(lw.length > 22 ? lw.slice(0, 21) + "…" : lw) + '”…</button>' +
      '<button data-a="world">' + (known ? "Open world card" : "New world card…") + "</button>" : "") +
      '<button data-a="cm">Comment…</button><hr><button data-a="copy">Copy</button><button data-a="cut">Cut</button>';
    ctx.hidden = false;
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 8)) + "px"; ctx.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 8)) + "px";
  };
  document.addEventListener("mousedown", e => { if (!e.target.closest("#ctx")) hideCtx(); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideCtx(); });
  window.addEventListener("blur", hideCtx); $("stage").addEventListener("scroll", hideCtx);
  ctx.addEventListener("mousedown", e => e.preventDefault());           // keep the text selected while clicking the menu
  ctx.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; hideCtx();
    if (b.dataset.a === "cm") openComment(ctxInfo, null);
    else if (b.dataset.a === "world") PX.world.fromText(ctxInfo.quote);
    else if (b.dataset.a === "look") PX.lookup(ctxInfo.quote.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), null, ctxInfo.sentence, PX.ui.cur);
    else { E.focus(); document.execCommand(b.dataset.a); }
  });
  PX.commentSelection = function () {
    const info = E.selectionInfo();
    if (!info) { PX.toast("Select a word, a sentence or a paragraph first, then comment on it."); return; }
    openComment(info, null);
  };

  /* ---------- comment dialog ---------- */
  const dlg = $("dlgComment"); let target = null;                        // { c } when editing, { info } when new
  function openComment(info, found) {
    target = found ? { c: found.c } : { info };
    const quote = found ? found.c.quote : info.quote;
    $("cTitle").textContent = found ? "Edit comment" : "Comment"; $("cQuote").textContent = "“" + quote + "”";
    $("cKind").value = found ? found.c.kind : "note"; $("cText").value = found ? found.c.text : "";
    dlg.showModal(); $("cText").focus();
  }
  $("cText").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("cOk").click(); } });
  $("cForm").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value !== "ok") return;
    const text = $("cText").value.trim(), kind = $("cKind").value;
    if (!text) { e.preventDefault(); PX.toast("Write something first, or press Cancel."); return; }
    if (target.c) { target.c.text = text; target.c.kind = kind; PX.save(); }
    else {
      const d = PX.cur(), i = target.info; if (!d) return;
      d.comments.push({ id: U.uid(), kind, text, quote: i.quote, pos: i.pos, before: i.before, after: i.after, page: i.page, author: "You", created: Date.now(), done: false });
      PX.save(); PX.toast("Comment saved. You will find it in the Study tab.");
    }
    E.refreshComments(); badge(); if (!$("study").hidden) renderStudy();
  });

  /* ---------- Study → Comments ---------- */
  function badge() { $("tabStudy").textContent = "Study"; }          // no comment count in the tab name (Doruk's choice)
  PX.updateBadge = badge;
  const docsWithComments = () => PX.docList().filter(d => (d.comments || []).length);
  function findComment(id) {
    for (const d of Object.values(PX.D.docs)) { const c = (d.comments || []).find(x => x.id === id); if (c) return { doc: d, c }; }
    return null;
  }
  function validNode() {                                  // make sure the selected tree entry still exists
    const n = PX.tmp.node, d = n && PX.D.docs[n.d];
    if (d && (d.comments || []).length) return n;
    const first = docsWithComments()[0]; return (PX.tmp.node = first ? { d: first.id, k: "all" } : null);
  }
  function renderStudy() {
    badge(); const p = ["vocab", "grammar"].includes(PX.ui.panel) ? PX.ui.panel : "comments";
    $("cmBody").hidden = p !== "comments"; $("voBody").hidden = p !== "vocab"; $("grBody").hidden = p !== "grammar";
    document.querySelectorAll(".stab[data-s]").forEach(b => b.classList.toggle("on", b.dataset.s === p));
    if (p === "vocab") { PX.renderVocab(); return; }
    if (p === "grammar") { PX.grammar.render(); return; }
    renderTree(); renderPane();
  }
  document.querySelectorAll(".stab[data-s]").forEach(b => { b.onclick = () => { PX.ui.panel = b.dataset.s; PX.saveUI(); renderStudy(); }; });
  function renderTree() {
    const node = validNode(), docs = docsWithComments();
    $("cmTree").innerHTML = docs.map(d => {
      const open = PX.ui.open[d.id] !== false, cs = d.comments;
      const count = k => cs.filter(c => c.kind === k).length;
      return '<div class="tdoc' + (node && node.d === d.id && node.k === "all" ? " on" : "") + '" data-d="' + d.id + '" data-k="all"><span class="chev" data-t="1">' + (open ? "▾" : "▸") + '</span><span class="ph">' + PHOENIX + '</span><span class="tt">' + U.esc(d.title || "Untitled") + '</span><span class="n">' + cs.length + "</span></div>" +
        (open ? '<div class="tkinds">' + Object.keys(KINDS).map(k => '<div class="tkind' + (node && node.d === d.id && node.k === k ? " on" : "") + (count(k) ? "" : " zero") + '" data-d="' + d.id + '" data-k="' + k + '"><span class="k ' + k + '">' + KINDS[k] + '</span><span class="n">' + count(k) + "</span></div>").join("") + "</div>" : "");
    }).join("") || '<div class="none">No comments yet.<br><br>In <b>Write</b>, select a word, a sentence or a paragraph, right-click it and choose <b>Comment…</b>.</div>';
  }
  function renderPane() {
    const node = validNode(), head = $("cmHead"), box = $("cmCards");
    if (!node) { head.innerHTML = ""; box.innerHTML = '<div class="none center">Your comments will appear here as cards.</div>'; return; }
    const d = PX.D.docs[node.d];
    let list = d.comments.filter(c => node.k === "all" || c.kind === node.k);
    const doneN = list.filter(c => c.done).length;
    if (PX.tmp.hideDone) list = list.filter(c => !c.done);
    list = list.slice().sort((a, b) => (a.page || 0) - (b.page || 0) || (a.pos || 0) - (b.pos || 0));
    head.innerHTML = '<div class="ttl"><span class="ph">' + PHOENIX + "</span> " + U.esc(d.title || "Untitled") + (node.k === "all" ? "" : ' <span class="k ' + node.k + '">' + KINDS[node.k] + "</span>") + "</div>" +
      '<div class="sub">' + list.length + (list.length === 1 ? " comment" : " comments") + '</div><span class="grow"></span>' +
      (doneN ? '<label class="hd"><input type="checkbox" id="hideDone"' + (PX.tmp.hideDone ? " checked" : "") + "> Hide done (" + doneN + ")</label>" : "");
    let html = "", last = -1;
    list.forEach(c => {
      if ((c.page || 0) !== last) { last = c.page || 0; html += '<div class="pg">' + (last ? "Page " + last : "Passage changed") + "</div>"; }
      const lost = d.id === PX.ui.cur && E.found && E.found[c.id] === false;
      html += '<div class="card' + (c.done ? " done" : "") + '" data-id="' + c.id + '"><div class="cmeta"><span class="k ' + c.kind + '">' + KINDS[c.kind] + "</span> " + (c.page ? "Page " + c.page : "passage changed") + " · " + U.esc(c.author || "You") + " · " + new Date(c.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + "</div>" +
        '<blockquote class="quote">“' + U.esc(c.quote) + "”</blockquote>" +
        (lost ? '<div class="warn">This passage has been changed since the comment was written. The quote above is what it was about.</div>' : "") +
        '<div class="ctext">' + U.esc(c.text) + "</div>" +
        '<div class="actions"><button class="primary" data-a="show">Show in text</button><button data-a="edit">Edit</button>' + (c.kind === "lang" || c.kind === "fix" ? '<button data-a="rule" title="Turn this comment into a grammar rule card">Save as grammar rule</button>' : "") + '<button data-a="done">' + (c.done ? "Open again" : "Mark as done") + '</button><button data-a="del" class="danger">Delete</button></div></div>';
    });
    box.innerHTML = html || '<div class="none center">Nothing here' + (PX.tmp.hideDone ? " (done comments are hidden)" : "") + ".</div>";
  }
  $("cmTree").addEventListener("click", e => {
    const row = e.target.closest("[data-d]"); if (!row) return;
    const id = row.dataset.d;
    if (e.target.closest(".chev")) { PX.ui.open[id] = PX.ui.open[id] === false; PX.saveUI(); renderTree(); return; }
    if (row.dataset.k === "all") PX.ui.open[id] = true;
    PX.tmp.node = { d: id, k: row.dataset.k }; PX.saveUI(); renderTree(); renderPane(); $("cmCards").scrollTop = 0;
  });
  $("cmHead").addEventListener("change", e => { if (e.target.id === "hideDone") { PX.tmp.hideDone = e.target.checked; renderPane(); } });
  $("cmCards").addEventListener("click", e => {
    const b = e.target.closest("button"), card = e.target.closest(".card"); if (!b || !card) return;
    const s = findComment(card.dataset.id); if (!s) return;
    const a = b.dataset.a;
    if (a === "show") {
      PX.setView("write"); PX.openDoc(s.doc.id);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!E.reveal(s.c.id)) PX.toast("That passage has been changed, so I cannot find it in the text any more."); }));
    } else if (a === "rule") PX.grammar.fromComment(s.doc, s.c);
    else if (a === "edit") openComment(null, s);
    else if (a === "done") { s.c.done = !s.c.done; PX.save(); E.refreshComments(); renderStudy(); }
    else if (a === "del") {
      if (!confirm("Delete this comment?")) return;
      s.doc.comments = s.doc.comments.filter(x => x.id !== s.c.id); PX.save(); E.refreshComments(); renderStudy();
    }
  });
  E.onComments = function () { badge(); if (!$("study").hidden) renderStudy(); };

  /* when the whole data is replaced (opening a backup, another device) the Study tab follows */
  const render0 = PX.render;
  PX.render = function () { render0(); badge(); if (!$("study").hidden) renderStudy(); };
  badge();
})(window.PX);
