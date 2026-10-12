/* Phoenix — Vocabulary (step 2b): look a word up (Wiktionary, MyMemory, Datamuse), save it with your own sentence, browse your personal dictionary in the Study tab.
   Only the single word you look up is ever sent to those services — never your text. */
(function (PX) {
  const U = PX.U, E = PX.ed, $ = id => document.getElementById(id);
  const LC = { en: "English", de: "Deutsch", tr: "Türkçe" }, CODES = Object.keys(LC);
  const WIKI = "https://en.wiktionary.org/";
  PX.ui.panel = PX.ui.panel || "comments"; PX.tmp.vnode = "all"; PX.tmp.vq = "";
  const vocab = () => PX.D.vocab;

  /* ---------- network ---------- */
  async function jget(url) { const r = await fetch(url); if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; } return r.json(); }
  const plain = h => new DOMParser().parseFromString("<body>" + h + "</body>", "text/html").body.textContent.replace(/\s+/g, " ").trim();   // inert parse: nothing from the web is ever run
  function variants(w, lang) {                    // English words are lower-case (a capitalised hit would only be a surname), German nouns are capitalised
    const lo = w.toLocaleLowerCase(lang), cap = lo.charAt(0).toLocaleUpperCase(lang) + lo.slice(1);
    return [...new Set(lang === "en" ? [w, lo] : [w, lo, cap])];
  }
  async function wiktionary(word, lang) {          // German nouns are capitalised, Turkish has its own i/İ: try the likely spellings
    for (const v of variants(word, lang)) {
      try { return { title: v, data: await jget(WIKI + "api/rest_v1/page/definition/" + encodeURIComponent(v)) }; }
      catch (e) { if (e.status === 404 || e.status === 400) continue; throw e; }
    }
    return { title: word, data: null };
  }
  const entriesFor = (data, lang) => ((data && data[lang]) || []).map(e => ({ pos: e.partOfSpeech, defs: (e.definitions || []).map(d => plain(d.definition || "")).filter(Boolean).slice(0, 8) })).filter(e => e.defs.length);
  async function suggest(w, lang) {
    const out = [], add = x => { if (x && x.toLocaleLowerCase() !== w.toLocaleLowerCase() && !out.includes(x)) out.push(x); }, jobs = [];
    if (lang === "en") jobs.push(jget("https://api.datamuse.com/words?sp=" + encodeURIComponent(w) + "&max=6").then(a => a.forEach(x => add(x.word))).catch(() => { }));
    jobs.push(jget(WIKI + "w/api.php?action=opensearch&format=json&origin=*&limit=8&search=" + encodeURIComponent(w)).then(a => (a[1] || []).forEach(add)).catch(() => { }));
    await Promise.all(jobs); return out.slice(0, 10);
  }
  async function translate(w, from) {
    const res = await Promise.all(CODES.filter(to => to !== from).map(to =>
      jget("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(w) + "&langpair=" + from + "|" + to).then(j => {
        const t = j.responseData && j.responseData.translatedText;
        return t && !/MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(t) && t.toLocaleLowerCase() !== w.toLocaleLowerCase() ? { to, t } : null;
      }).catch(() => null)));
    return res.filter(Boolean);
  }

  /* ---------- Turkish typed without ç ş ğ ı (e.g. on a German keyboard) ----------
     ü and ö are on a German keyboard, so they are taken as typed. For c, g, i, s we try every spelling and keep the ones Wiktionary knows as Turkish. */
  const TRAMB = { c: "cç", g: "gğ", i: "iı", s: "sş" };
  async function existing(titles) {               // which of these pages exist? (50 titles per request)
    const out = new Set();
    for (let i = 0; i < titles.length; i += 50) {
      try {
        const j = await jget(WIKI + "w/api.php?action=query&format=json&origin=*&titles=" + encodeURIComponent(titles.slice(i, i + 50).join("|")));
        Object.values((j.query && j.query.pages) || {}).forEach(p => { if (!("missing" in p)) out.add(p.title); });
      } catch (e) { }
    }
    return out;
  }
  async function trAlternatives(word) {
    const lo = word.toLocaleLowerCase("tr"), letters = [...lo], n = letters.filter(ch => TRAMB[ch]).length;
    if (!n || n > 8) return [];
    let combos = [""]; letters.forEach(ch => { const next = []; combos.forEach(c => [...(TRAMB[ch] || ch)].forEach(x => next.push(c + x))); combos = next; });
    const all = [...new Set(combos.flatMap(c => [c, c.charAt(0).toLocaleUpperCase("tr") + c.slice(1)]))].filter(c => c !== word);
    const ex = await existing(all), found = all.filter(c => ex.has(c)).slice(0, 8);
    const checked = await Promise.all(found.map(c => jget(WIKI + "api/rest_v1/page/definition/" + encodeURIComponent(c)).then(j => ({ c, tr: !!(j.tr && j.tr.length) })).catch(() => ({ c, tr: null }))));
    const isCap = c => c !== c.toLocaleLowerCase("tr"), diacritics = c => (c.match(/[çğışÇĞİŞ]/g) || []).length;
    return checked.filter(x => x.tr !== false).sort((a, b) => (b.tr === true) - (a.tr === true) || isCap(a.c) - isCap(b.c) || diacritics(b.c) - diacritics(a.c)).map(x => x.c);
  }

  /* ---------- the look-up panel ---------- */
  const dlg = $("dlgLook"), L = { editing: null, pos: new Set(), seq: 0, sugSeq: 0, list: [], doc: "" };
  const langSel = $("lLang"); langSel.innerHTML = CODES.map(c => '<option value="' + c + '">' + LC[c] + "</option>").join("");
  PX.lookup = function (word, lang, sentence, docId, editing) {
    L.editing = editing || null; L.pos = new Set(editing && editing.pos ? editing.pos.split(", ") : []); L.doc = docId || (editing && editing.doc) || "";
    $("lTitle").textContent = editing ? "Edit word" : "Look up";
    $("lWord").value = word || ""; langSel.value = lang || (PX.cur() ? PX.cur().lang : "en");
    $("lDef").value = editing ? editing.def : ""; $("lTrans").value = editing ? editing.trans : ""; $("lSent").value = editing ? editing.sentence : (sentence || ""); $("lNote").value = editing ? editing.note : "";
    $("lRes").innerHTML = '<div class="none">' + (editing ? "Press “Look up” to fetch the dictionary entry again." : "Type a word and press Enter.") + "</div>"; $("lSug").innerHTML = "";
    dlg.showModal();
    if (word && !editing) doLookup(); else $("lWord").focus();
  };
  PX.lookupSelection = function () {
    const info = E.selectionInfo();
    if (info && info.quote.split(/\s+/).length <= 4) PX.lookup(info.quote.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), null, info.sentence, PX.ui.cur);
    else PX.lookup("", null, "", PX.ui.cur);
  };
  async function doLookup(noFix) {
    const w = $("lWord").value.trim(), lang = langSel.value; if (!w) { $("lWord").focus(); return; }
    const my = ++L.seq; $("lRes").innerHTML = '<div class="none">Looking up…</div>'; $("lSug").innerHTML = "";
    let wk = null, tr = [], fail = false;
    await Promise.all([wiktionary(w, lang).then(r => { wk = r; }).catch(() => { fail = true; }), translate(w, lang).then(r => { tr = r; })]);
    if (my !== L.seq) return;
    const ents = wk && wk.data ? entriesFor(wk.data, lang) : [], others = wk && wk.data ? Object.keys(wk.data).filter(k => k !== lang && k !== "other") : [];
    if (lang === "tr" && !noFix && !fail && !ents.length) {                // maybe the Turkish letters are missing: try the other spellings
      $("lRes").innerHTML = '<div class="none">Trying Turkish spellings…</div>';
      const alts = await trAlternatives(w); if (my !== L.seq) return;
      if (alts.length) {
        $("lWord").value = alts[0];
        L.fixNote = "Turkish letters added: “" + w + "” → “" + alts[0] + "”." + (alts.length > 1 ? " Other spellings that exist: " + alts.slice(1).join(", ") + "." : "");
        return doLookup(true);
      }
    }
    L.list = []; let html = "";
    if (L.fixNote) { html = '<div class="warn2">' + U.esc(L.fixNote) + "</div>"; L.fixNote = ""; }
    if (fail) html += '<div class="warn2">The dictionary could not be reached (offline?). You can still save the word and write your own definition below.</div>';
    else if (!ents.length) html += '<div class="warn2">No ' + LC[lang] + " entry found for “" + U.esc(w) + "”." + (others.length ? " There is an entry in: " + others.map(o => U.esc(LC[o] || o)).join(", ") + " (check the language on the right)." : "") + "</div>";
    ents.forEach(e => {
      html += '<div class="ent"><div class="epos">' + U.esc(e.pos) + "</div>";
      e.defs.forEach(d => { L.list.push({ pos: e.pos, text: d }); html += '<div class="df"><button type="button" class="add" data-i="' + (L.list.length - 1) + '" title="Add to my definition">+</button><span>' + U.esc(d) + "</span></div>"; });
      html += "</div>";
    });
    if (tr.length) html += '<div class="trs">' + tr.map(x => '<span class="trchip">' + x.to.toUpperCase() + ": <b>" + U.esc(x.t) + "</b></span>").join("") + "</div>";
    $("lRes").innerHTML = html;
    if (!$("lDef").value && L.list[0]) { $("lDef").value = L.list[0].text; L.pos.add(L.list[0].pos); }
    if (!$("lTrans").value && tr.length) $("lTrans").value = tr.map(x => x.to.toUpperCase() + ": " + x.t).join(" · ");
    if (ents.length && wk.title !== w) $("lWord").value = wk.title;       // keep the dictionary's own spelling (e.g. German capital letter)
    showSug(!ents.length);
  }
  async function showSug(missing) {
    const w = $("lWord").value.trim(), lang = langSel.value, my = ++L.sugSeq; if (w.length < 2) { $("lSug").innerHTML = ""; return; }
    const list = await suggest(w, lang); if (my !== L.sugSeq) return;
    $("lSug").innerHTML = list.length ? '<span class="sl">' + (missing === false ? "Similar words:" : "Did you mean:") + "</span>" + list.map(s => '<button type="button" class="sg" data-w="' + U.esc(s) + '">' + U.esc(s) + "</button>").join("") : "";
  }
  const showSugSoon = U.debounce(() => showSug(), 280);
  $("lWord").addEventListener("input", () => { L.sugSeq++; showSugSoon(); });
  $("lWord").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } });
  $("lGo").addEventListener("click", doLookup);
  langSel.addEventListener("change", () => { if ($("lWord").value.trim()) doLookup(); });
  $("lSug").addEventListener("click", e => { const b = e.target.closest(".sg"); if (b) { $("lWord").value = b.dataset.w; doLookup(); } });
  $("lRes").addEventListener("click", e => {
    const b = e.target.closest(".add"); if (!b) return; const it = L.list[+b.dataset.i], ta = $("lDef");
    ta.value = ta.value.trim() ? ta.value.trim() + "\n" + it.text : it.text; L.pos.add(it.pos);
  });
  ["lDef", "lSent"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("lOk").click(); } }));
  $("lForm").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value !== "ok") return;
    const word = $("lWord").value.trim(), lang = langSel.value;
    if (!word) { e.preventDefault(); PX.toast("Type a word first, or press Cancel."); return; }
    const item = { word, lang, pos: [...L.pos].join(", "), def: $("lDef").value.trim(), trans: $("lTrans").value.trim(), sentence: $("lSent").value.trim(), note: $("lNote").value.trim() };
    if (L.editing) Object.assign(L.editing, item);
    else {
      const same = vocab().find(x => x.lang === lang && x.word.toLocaleLowerCase(lang) === word.toLocaleLowerCase(lang));
      if (same) { if (!confirm("“" + word + "” is already in your vocabulary.\n\nReplace the saved card with this one?")) { e.preventDefault(); return; } Object.assign(same, item); }
      else vocab().push(Object.assign({ id: U.uid(), created: Date.now(), doc: L.doc || "" }, item));
    }
    PX.save(); PX.toast("Saved to Vocabulary."); if (!$("study").hidden && PX.ui.panel === "vocab") PX.renderVocab();
  });

  /* ---------- Study → Vocabulary ---------- */
  const counts = () => { const c = { all: 0 }; CODES.forEach(k => { c[k] = 0; }); vocab().forEach(v => { c.all++; c[v.lang] = (c[v.lang] || 0) + 1; }); return c; };
  function renderTree() {
    const c = counts(), n = PX.tmp.vnode;
    $("voTree").innerHTML = '<div class="tdoc' + (n === "all" ? " on" : "") + '" data-v="all"><span class="chev"></span><span class="tt">All words</span><span class="n">' + c.all + "</span></div>" +
      '<div class="tkinds">' + CODES.map(k => '<div class="tkind' + (n === k ? " on" : "") + (c[k] ? "" : " zero") + '" data-v="' + k + '"><span class="k lg">' + LC[k] + '</span><span class="n">' + c[k] + "</span></div>").join("") + "</div>";
  }
  function renderPane() {
    const n = PX.tmp.vnode, q = PX.tmp.vq.trim().toLocaleLowerCase(); let list = vocab().filter(v => n === "all" || v.lang === n);
    if (q) list = list.filter(v => (v.word + " " + v.def + " " + v.trans + " " + v.sentence + " " + v.note).toLocaleLowerCase().includes(q));
    list = list.slice().sort((a, b) => a.word.localeCompare(b.word, a.lang === "tr" ? "tr" : a.lang === "de" ? "de" : "en", { sensitivity: "base" }));
    const hv = $("voHead"); if (!hv.dataset.ready) {                   // the header is built once so typing in its boxes is never interrupted
      hv.dataset.ready = "1";
      hv.innerHTML = '<div class="ttl" id="voTtl"></div><div class="sub" id="voSub"></div><span class="grow"></span>' +
        '<input id="voFilter" type="search" placeholder="Filter my words…" autocomplete="off">' +
        '<input id="voWord" placeholder="Look up a word…" autocomplete="off"><select id="voLang"></select><button id="voGo" class="primary">Look up</button>';
      $("voLang").innerHTML = CODES.map(c => '<option value="' + c + '">' + LC[c] + "</option>").join("");
      $("voFilter").addEventListener("input", e => { PX.tmp.vq = e.target.value; renderPane(); });
      const go = () => { const w = $("voWord").value.trim(); PX.lookup(w, $("voLang").value, "", ""); $("voWord").value = ""; };
      $("voWord").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } }); $("voGo").addEventListener("click", go);
    }
    $("voTtl").textContent = "Vocabulary" + (n === "all" ? "" : " · " + LC[n]); $("voSub").textContent = list.length + (list.length === 1 ? " word" : " words");
    if (document.activeElement !== $("voWord")) $("voLang").value = n === "all" ? (PX.cur() ? PX.cur().lang : "en") : n;
    let html = "", last = "";
    list.forEach(v => {
      const L1 = v.word.charAt(0).toLocaleUpperCase(v.lang); if (L1 !== last) { last = L1; html += '<div class="pg">' + U.esc(L1) + "</div>"; }
      html += '<div class="vcard" data-id="' + v.id + '"><div class="vtop"><span class="vword">' + U.esc(v.word) + '</span><span class="k lg">' + v.lang.toUpperCase() + "</span>" + (v.pos ? '<span class="vpos">' + U.esc(v.pos) + "</span>" : "") + "</div>" +
        (v.def ? '<div class="vdef">' + U.esc(v.def) + "</div>" : "") + (v.trans ? '<div class="vtr">' + U.esc(v.trans) + "</div>" : "") +
        (v.sentence ? '<blockquote class="quote sm">“' + U.esc(v.sentence) + "”</blockquote>" : "") + (v.note ? '<div class="vnote">' + U.esc(v.note) + "</div>" : "") +
        '<div class="actions"><button data-a="edit">Edit</button><button data-a="del" class="danger">Delete</button></div></div>';
    });
    $("voCards").innerHTML = html || '<div class="none center">' + (vocab().length ? "No word matches." : "No words yet.<br><br>Select a word in <b>Write</b>, right-click it and choose <b>Look up…</b>, or use the box above.") + "</div>";
  }
  PX.renderVocab = function () { renderTree(); renderPane(); };
  $("voTree").addEventListener("click", e => { const r = e.target.closest("[data-v]"); if (!r) return; PX.tmp.vnode = r.dataset.v; renderTree(); renderPane(); $("voCards").scrollTop = 0; });
  $("voCards").addEventListener("click", e => {
    const b = e.target.closest("button"), card = e.target.closest(".vcard"); if (!b || !card) return;
    const v = vocab().find(x => x.id === card.dataset.id); if (!v) return;
    if (b.dataset.a === "edit") PX.lookup(v.word, v.lang, "", v.doc, v);
    else if (b.dataset.a === "del" && confirm("Delete “" + v.word + "” from your vocabulary?")) { PX.D.vocab = vocab().filter(x => x.id !== v.id); PX.save(); PX.renderVocab(); }
  });
})(window.PX);
