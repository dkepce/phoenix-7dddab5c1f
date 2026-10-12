/* Phoenix — Study tab (step 2): comments collected from the text, grouped by page, shown as cards. Plus the right-click menu and the comment dialog. */
(function (PX) {
  const U = PX.U, E = PX.ed, $ = id => document.getElementById(id);
  const KINDS = { good: "Strength", fix: "To improve", lang: "Language", note: "Note" };
  PX.KINDS = KINDS; PX.tmp.scope = "cur"; PX.tmp.sel = "";

  /* ---------- Write / Study ---------- */
  PX.setView = function (v) {
    PX.ui.view = v; PX.saveUI();
    $("tabWrite").classList.toggle("on", v === "write"); $("tabStudy").classList.toggle("on", v === "study");
    $("work").hidden = v !== "write"; $("study").hidden = v !== "study";
    $("side").classList.toggle("nov", v !== "write"); $("btnSide").style.visibility = v === "write" ? "" : "hidden";
    hideCtx();
    if (v === "write") { E.layoutNow(); E.refreshComments(); } else renderStudy();
  };
  $("tabWrite").onclick = () => PX.setView("write");
  $("tabStudy").onclick = () => PX.setView("study");

  /* ---------- right-click menu on selected text ---------- */
  const ctx = document.createElement("div"); ctx.id = "ctx"; ctx.hidden = true; document.body.appendChild(ctx);
  let ctxInfo = null;
  function hideCtx() { ctx.hidden = true; }
  E.onContext = function (x, y, info) {
    ctxInfo = info;
    ctx.innerHTML = '<button data-a="cm">Comment…</button><hr><button data-a="copy">Copy</button><button data-a="cut">Cut</button>';
    ctx.hidden = false;
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 8)) + "px"; ctx.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 8)) + "px";
  };
  document.addEventListener("mousedown", e => { if (!e.target.closest("#ctx")) hideCtx(); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideCtx(); });
  window.addEventListener("blur", hideCtx); document.getElementById("stage").addEventListener("scroll", hideCtx);
  ctx.addEventListener("mousedown", e => e.preventDefault());           // keep the text selected while clicking the menu
  ctx.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; hideCtx();
    if (b.dataset.a === "cm") openComment(ctxInfo, null); else { E.focus(); document.execCommand(b.dataset.a); }
  });
  PX.commentSelection = function () {
    const info = E.selectionInfo();
    if (!info) { PX.toast("Select a word, a sentence or a paragraph first, then comment on it."); return; }
    openComment(info, null);
  };

  /* ---------- comment dialog ---------- */
  const dlg = $("dlgComment"); let target = null;                        // { doc, comment } when editing, { info } when new
  function openComment(info, found) {
    target = found ? { doc: found.doc, c: found.c } : { info };
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
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  const docs = () => (PX.tmp.scope === "all" ? PX.docList() : [PX.cur()]).filter(Boolean);
  function badge() {
    let n = 0; Object.values(PX.D.docs).forEach(d => (d.comments || []).forEach(c => { if (!c.done) n++; }));
    $("tabStudy").textContent = "Study" + (n ? " (" + n + ")" : "");
  }
  PX.updateBadge = badge;
  function renderStudy() {
    badge(); let html = "", first = null;
    docs().forEach(d => {
      const cs = (d.comments || []).slice().sort((a, b) => (a.page || 0) - (b.page || 0) || (a.pos || 0) - (b.pos || 0));
      if (!cs.length) return;
      if (PX.tmp.scope === "all") html += '<h3 class="dh">' + U.esc(d.title || "Untitled") + "</h3>";
      let lastPage = -1;
      cs.forEach(c => {
        if (!first) first = c;
        if ((c.page || 0) !== lastPage) { lastPage = c.page || 0; html += '<div class="pg">' + (lastPage ? "Page " + lastPage : "Passage changed") + "</div>"; }
        html += '<div class="cm' + (c.id === PX.tmp.sel ? " on" : "") + (c.done ? " done" : "") + '" data-d="' + d.id + '" data-id="' + c.id + '">' +
          '<span class="k ' + c.kind + '">' + KINDS[c.kind] + '</span><div class="qt">“' + U.esc(trunc(c.quote, 80)) + '”</div><div class="tx">' + U.esc(trunc(c.text, 100)) + "</div></div>";
      });
    });
    $("cmList").innerHTML = html || '<div class="none">No comments yet.<br><br>In <b>Write</b>, select a word, a sentence or a paragraph, right-click it and choose <b>Comment…</b>.</div>';
    renderDetail();
  }
  function findSel() {
    for (const d of Object.values(PX.D.docs)) { const c = (d.comments || []).find(x => x.id === PX.tmp.sel); if (c) return { doc: d, c }; }
    return null;
  }
  function renderDetail() {
    const s = findSel(), box = $("cmDetail");
    if (!s) { box.innerHTML = '<div class="none center">Pick a comment on the left to see it here as a card.</div>'; return; }
    const { doc, c } = s, lost = doc.id === PX.ui.cur && E.found && E.found[c.id] === false;
    box.innerHTML = '<div class="card' + (c.done ? " done" : "") + '"><div class="cmeta"><span class="k ' + c.kind + '">' + KINDS[c.kind] + "</span> " +
      U.esc(doc.title || "Untitled") + " · " + (c.page ? "Page " + c.page : "passage changed") + " · " + U.esc(c.author || "You") + " · " + new Date(c.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + "</div>" +
      '<blockquote class="quote">“' + U.esc(c.quote) + "”</blockquote>" +
      (lost ? '<div class="warn">This passage has been changed since you commented on it. The quote above is what the comment was about.</div>' : "") +
      '<div class="ctext">' + U.esc(c.text) + "</div>" +
      '<div class="actions"><button class="primary" data-a="show">Show in text</button><button data-a="edit">Edit</button><button data-a="done">' + (c.done ? "Mark as open again" : "Mark as done") + '</button><button data-a="del" class="danger">Delete</button></div></div>';
  }
  $("cmList").addEventListener("click", e => {
    const el = e.target.closest(".cm"); if (!el) return;
    PX.tmp.sel = el.dataset.id; renderStudy();
  });
  $("cmDetail").addEventListener("click", e => {
    const b = e.target.closest("button"), s = findSel(); if (!b || !s) return;
    const a = b.dataset.a;
    if (a === "show") {
      PX.setView("write"); PX.openDoc(s.doc.id);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!E.reveal(s.c.id)) PX.toast("That passage has been changed, so I cannot find it in the text any more."); }));
    } else if (a === "edit") openComment(null, s);
    else if (a === "done") { s.c.done = !s.c.done; PX.save(); E.refreshComments(); renderStudy(); }
    else if (a === "del") {
      if (!confirm("Delete this comment?")) return;
      s.doc.comments = s.doc.comments.filter(x => x.id !== s.c.id); PX.tmp.sel = ""; PX.save(); E.refreshComments(); renderStudy();
    }
  });
  $("stScope").addEventListener("change", e => { PX.tmp.scope = e.target.value; renderStudy(); });
  E.onComments = function () { badge(); if (!$("study").hidden) renderStudy(); };

  /* when the whole data is replaced (opening a backup, another device) the Study tab follows */
  const render0 = PX.render;
  PX.render = function () { render0(); badge(); if (!$("study").hidden) renderStudy(); };
  badge();
})(window.PX);
