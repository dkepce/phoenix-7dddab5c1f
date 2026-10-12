/* Phoenix — Study → Grammar: rule cards (explanation + example sentences), organised language → category.
   A rule can be started from a comment (button "Save as grammar rule" on Language / To improve cards): the comment becomes the explanation
   and the passage you wrote becomes the first "wrong" example, waiting for your corrected version. */
(function (PX) {
  const U = PX.U, $ = id => document.getElementById(id);
  const G = (PX.grammar = { tmp: { node: null, q: "" } });
  const LANGS = Object.keys(PX.LANGS), CATS = ["Tenses & verbs", "Word order", "Punctuation", "Prepositions & cases", "Articles & nouns", "Spelling", "Word choice", "Other"];
  PX.ui.gopen = PX.ui.gopen || {};
  const rules = () => PX.D.grammar;

  /* ---------- tree + cards ---------- */
  function node() {
    let n = G.tmp.node;
    if (!n || !LANGS.includes(n.l)) n = G.tmp.node = { l: (PX.cur() && PX.cur().lang) || "en", c: "all" };
    return n;
  }
  function renderTree() {
    const n = node();
    $("grTree").innerHTML = LANGS.map(l => {
      const mine = rules().filter(r => r.lang === l), open = PX.ui.gopen[l] !== false, count = c => mine.filter(r => r.cat === c).length;
      return '<div class="tdoc' + (n.l === l && n.c === "all" ? " on" : "") + '" data-l="' + l + '" data-c="all"><span class="chev" data-chev="1">' + (open ? "▾" : "▸") + '</span><span class="tt">' + PX.LANGS[l] + '</span><span class="n">' + mine.length + "</span></div>" +
        (open ? '<div class="tkinds">' + CATS.map(c => '<div class="tkind' + (n.l === l && n.c === c ? " on" : "") + (count(c) ? "" : " zero") + '" data-l="' + l + '" data-c="' + U.esc(c) + '"><span class="gcat">' + U.esc(c) + '</span><span class="n">' + count(c) + "</span></div>").join("") + "</div>" : "");
    }).join("");
  }
  function renderPane() {
    const n = node(), head = $("grHead"), q = G.tmp.q.trim().toLocaleLowerCase();
    if (!head.dataset.ready) {
      head.dataset.ready = "1";
      head.innerHTML = '<div class="ttl" id="grTtl"></div><div class="sub" id="grSub"></div><span class="grow"></span><input id="grFilter" type="search" placeholder="Filter rules…" autocomplete="off"><button class="primary" id="grNew">+ New rule</button>';
      $("grFilter").addEventListener("input", e => { G.tmp.q = e.target.value; renderPane(); });
      $("grNew").addEventListener("click", () => { const n2 = node(); G.edit({ lang: n2.l, cat: n2.c === "all" ? CATS[0] : n2.c }); });
    }
    let list = rules().filter(r => r.lang === n.l && (n.c === "all" || r.cat === n.c));
    if (q) list = list.filter(r => (r.title + " " + r.rule + " " + r.examples.map(x => x.wrong + " " + x.right).join(" ")).toLocaleLowerCase().includes(q));
    list = list.slice().sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    $("grTtl").innerHTML = U.esc(PX.LANGS[n.l]) + (n.c === "all" ? "" : ' <span class="gcat big">' + U.esc(n.c) + "</span>"); $("grSub").textContent = list.length + (list.length === 1 ? " rule" : " rules");
    $("grCards").innerHTML = list.map(r =>
      '<div class="gcard" data-id="' + r.id + '"><div class="gtop"><span class="gcat">' + U.esc(r.cat) + '</span></div><div class="gtitle">' + U.esc(r.title) + "</div>" +
      (r.rule ? '<div class="grule">' + U.esc(r.rule) + "</div>" : "") +
      r.examples.filter(x => x.wrong || x.right).map(x => '<div class="gex">' + (x.wrong ? '<div class="gw"><b>✗</b> ' + U.esc(x.wrong) + "</div>" : "") + (x.right ? '<div class="gr"><b>✓</b> ' + U.esc(x.right) + "</div>" : '<div class="gt">your corrected version is still missing</div>') + "</div>").join("") +
      '<div class="actions"><button data-a="edit">Edit</button><button data-a="del" class="danger">Delete</button></div></div>'
    ).join("") || '<div class="none center">' + (rules().some(r => r.lang === n.l) ? "No rule matches." : "No " + U.esc(PX.LANGS[n.l]) + " rules yet.<br><br>Press <b>+ New rule</b>, or open <b>Comments</b> and use <b>Save as grammar rule</b> on a Language comment.") + "</div>";
  }
  G.render = function () { renderTree(); renderPane(); };
  $("grTree").addEventListener("click", e => {
    const r = e.target.closest("[data-l]"); if (!r) return; const l = r.dataset.l;
    if (e.target.closest("[data-chev]")) { PX.ui.gopen[l] = PX.ui.gopen[l] === false; PX.saveUI(); renderTree(); return; }
    if (r.dataset.c === "all") PX.ui.gopen[l] = true;
    G.tmp.node = { l, c: r.dataset.c }; PX.saveUI(); G.render(); $("grCards").scrollTop = 0;
  });
  $("grCards").addEventListener("click", e => {
    const b = e.target.closest("button"), card = e.target.closest(".gcard"); if (!b || !card) return;
    const r = rules().find(x => x.id === card.dataset.id); if (!r) return;
    if (b.dataset.a === "edit") G.edit(r);
    else if (b.dataset.a === "del" && confirm("Delete the rule “" + r.title + "”?")) { PX.D.grammar = rules().filter(x => x.id !== r.id); PX.save(); G.render(); }
  });

  /* ---------- the rule dialog (new / edit / from a comment) ---------- */
  const dlg = $("dlgRule"); let target = null, exs = [];
  $("rCat").innerHTML = CATS.map(c => "<option>" + U.esc(c) + "</option>").join(""); $("rLang").innerHTML = LANGS.map(l => '<option value="' + l + '">' + PX.LANGS[l] + "</option>").join("");
  G.edit = function (r) {                            // r: an existing rule, or the start of a new one
    target = r.id ? r : null; exs = (r.examples || []).map(x => ({ wrong: x.wrong || "", right: x.right || "" })); if (!exs.length) exs.push({ wrong: "", right: "" });
    $("rTitleHd").textContent = r.id ? "Edit rule" : "New rule";
    $("rTitle").value = r.title || ""; $("rLang").value = r.lang || "en"; $("rCat").value = CATS.includes(r.cat) ? r.cat : CATS[0]; $("rRule").value = r.rule || "";
    $("rSrc").textContent = (r.src && r.src.quote) ? "From your text: “" + r.src.quote + "”" + (r.src.doc && PX.D.docs[r.src.doc] ? " (" + (PX.D.docs[r.src.doc].title || "Untitled") + ")" : "") : ""; $("rSrc").hidden = !$("rSrc").textContent;
    G.pendingSrc = r.src || null; drawEx(); dlg.showModal(); $("rTitle").focus();
  };
  function drawEx() {
    $("rEx").innerHTML = exs.map((x, i) => '<div class="rex"><input class="rw" data-i="' + i + '" value="' + U.esc(x.wrong) + '" placeholder="✗ wrong (optional)"><input class="rr" data-i="' + i + '" value="' + U.esc(x.right) + '" placeholder="✓ correct"><button type="button" data-i="' + i + '" class="rdel" title="Remove this example">×</button></div>').join("");
  }
  $("rEx").addEventListener("input", e => { const i = +e.target.dataset.i; if (e.target.classList.contains("rw")) exs[i].wrong = e.target.value; else if (e.target.classList.contains("rr")) exs[i].right = e.target.value; });
  $("rEx").addEventListener("click", e => { const b = e.target.closest(".rdel"); if (b) { exs.splice(+b.dataset.i, 1); if (!exs.length) exs.push({ wrong: "", right: "" }); drawEx(); } });
  $("rAdd").addEventListener("click", () => { exs.push({ wrong: "", right: "" }); drawEx(); const n = $("rEx").querySelectorAll(".rw"); n[n.length - 1].focus(); });
  $("rForm").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value !== "ok") return;
    const title = $("rTitle").value.trim(); if (!title) { e.preventDefault(); PX.toast("Give the rule a short title first, or press Cancel."); return; }
    const data = { title, lang: $("rLang").value, cat: $("rCat").value, rule: $("rRule").value.trim(), examples: exs.filter(x => x.wrong.trim() || x.right.trim()).map(x => ({ wrong: x.wrong.trim(), right: x.right.trim() })), modified: Date.now() };
    if (target) Object.assign(target, data); else rules().push(Object.assign({ id: U.uid(), created: Date.now(), src: G.pendingSrc || null }, data));
    G.tmp.node = { l: data.lang, c: "all" }; PX.save(); PX.toast("Rule saved."); if (!$("study").hidden && PX.ui.panel === "grammar") G.render();
  });

  /* ---------- from a comment ---------- */
  function guessCat(t) {
    if (/comma|full stop|semicolon|punctuation|quotation|apostrophe|capital letter/i.test(t)) return "Punctuation";
    if (/tense|past|present|future|was feeling|simple past|verb/i.test(t)) return "Tenses & verbs";
    if (/word order|the more/i.test(t)) return "Word order";
    if (/preposition|wait for|\bafter\b.*\bas\b|\bcase\b/i.test(t)) return "Prepositions & cases";
    if (/uncountable|article|\bthe\b/i.test(t)) return "Articles & nouns";
    if (/spell|hyphen/i.test(t)) return "Spelling";
    if (/word choice|natural|idiom|sound/i.test(t)) return "Word choice";
    return "Other";
  }
  G.fromComment = function (doc, c) {
    const first = c.text.split(/(?<=[.!?:])\s/)[0].trim(), title = first.length > 90 ? first.slice(0, 89).trimEnd() + "…" : first;
    G.edit({ lang: doc.lang, cat: guessCat(c.text), title, rule: c.text, examples: [{ wrong: c.quote, right: "" }], src: { doc: doc.id, quote: c.quote, cid: c.id } });
  };

  const render1 = PX.render;
  PX.render = function () { render1(); if (!$("study").hidden && PX.ui.panel === "grammar") G.render(); };
})(window.PX);
