/* Phoenix — the screen around the page: document list, toolbar, dialogs, menu, status bar. */
(function (PX) {
  const U = PX.U, E = PX.ed, $ = id => document.getElementById(id);
  let loadedId = null;

  /* ---------- toast ---------- */
  let toastT;
  PX.toast = function (msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); };

  /* ---------- toolbar ---------- */
  const I = {
    undo: '<path d="M4 9h9a4 4 0 0 1 0 8H8"/><path d="M7 5 3.5 9 7 13"/>',
    redo: '<path d="M16 9H7a4 4 0 0 0 0 8h5"/><path d="M13 5l3.5 4L13 13"/>',
    left: '<path d="M3 5h14M3 9h9M3 13h14M3 17h9"/>', center: '<path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9"/>',
    right: '<path d="M3 5h14M8 9h9M3 13h14M8 17h9"/>', full: '<path d="M3 5h14M3 9h14M3 13h14M3 17h14"/>',
    ul: '<path d="M8 5h9M8 10h9M8 15h9"/><circle cx="4" cy="5" r=".8"/><circle cx="4" cy="10" r=".8"/><circle cx="4" cy="15" r=".8"/>',
    ol: '<path d="M9 5h8M9 10h8M9 15h8"/><path d="M3.5 4l1-.6V7M3 11.5c0-1.4 2-1.4 2 0s-2 1.6-2 2.6h2"/>',
    clear: '<path d="M4 16l9-12M10 16h6M6 4h9"/>', comment: '<path d="M3 4h14v9H9l-4 3.5V13H3z"/><path d="M6.5 7.5h7M6.5 10h4"/>', look: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.3 12.3L17 17"/>', hl: '<path d="M5 14l6.5-6.5 3 3L8 17H5z"/><path d="M11.5 7.5l2-2 3 3-2 2M3 18.5h14"/>',
    print: '<path d="M5 8V3h10v5M5 14H3V8h14v6h-2"/><rect x="5" y="12" width="10" height="5"/>'
  };
  const ic = n => '<svg viewBox="0 0 20 20">' + I[n] + "</svg>";
  const TB = [
    ["undo", ic("undo"), "Undo (Ctrl+Z)", () => E.undo()], ["redo", ic("redo"), "Redo (Ctrl+Y)", () => E.redo()], "|",
    "style", "font", "size", "|",
    ["bold", "<b>B</b>", "Bold (Ctrl+B)", () => E.cmd("bold")], ["italic", "<i>I</i>", "Italic (Ctrl+I)", () => E.cmd("italic")],
    ["underline", "<u>U</u>", "Underline (Ctrl+U)", () => E.cmd("underline")], ["strike", "<s>S</s>", "Strikethrough", () => E.cmd("strikeThrough")], "|",
    ["left", ic("left"), "Align left", () => E.cmd("justifyLeft")], ["center", ic("center"), "Centre", () => E.cmd("justifyCenter")],
    ["right", ic("right"), "Align right", () => E.cmd("justifyRight")], ["full", ic("full"), "Justify", () => E.cmd("justifyFull")], "|",
    ["ul", ic("ul"), "Bullet list", () => E.cmd("insertUnorderedList")], ["ol", ic("ol"), "Numbered list", () => E.cmd("insertOrderedList")], "|",
    ["comment", ic("comment"), "Comment on the selected text (also: right-click the selection)", () => PX.commentSelection()],
    ["look", ic("look"), "Look up the selected word (also: right-click it)", () => PX.lookupSelection()],
    ["hl", ic("hl"), "Show / hide the comment colours on the page", () => PX.toggleHL()],
    ["clear", ic("clear"), "Clear formatting", () => E.clearFormat()], ["print", ic("print"), "Print / save as PDF", () => printDoc()]
  ];
  const STYLES = [["P", "Normal text"], ["H1", "Title"], ["H2", "Heading"], ["H3", "Subheading"], ["BLOCKQUOTE", "Quote"]];
  function buildToolbar() {
    const tb = $("toolbar"); tb.innerHTML = "";
    TB.forEach(it => {
      if (it === "|") { const s = document.createElement("span"); s.className = "sep"; tb.appendChild(s); return; }
      if (it === "style") {
        const s = document.createElement("select"); s.id = "tbStyle"; s.title = "Paragraph style";
        s.innerHTML = STYLES.map(x => '<option value="' + x[0] + '">' + x[1] + "</option>").join("");
        s.onchange = () => { E.block(s.value.toLowerCase()); E.focus(); }; tb.appendChild(s); return;
      }
      if (it === "font") {
        const s = document.createElement("select"); s.id = "tbFont"; s.title = "Font of the selected text";
        s.innerHTML = PX.FONTS.map(f => '<option style="font-family:\'' + f + '\'">' + f + "</option>").join("");
        s.onchange = () => { E.setFont(s.value); E.focus(); }; tb.appendChild(s); return;
      }
      if (it === "size") {
        const m = document.createElement("button"), p = document.createElement("button"), n = document.createElement("input");
        m.textContent = "−"; p.textContent = "+"; m.title = "Smaller"; p.title = "Larger";
        n.id = "tbSize"; n.type = "number"; n.min = 6; n.max = 96; n.step = 0.5; n.title = "Font size (pt) of the selected text";
        const set = v => { v = Math.min(96, Math.max(6, +v || 12)); n.value = v; E.setSize(v); };
        m.onclick = () => set((+n.value || 12) - (+n.value > 24 ? 2 : 1)); p.onclick = () => set((+n.value || 12) + (+n.value >= 24 ? 2 : 1));
        n.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); set(n.value); E.focus(); } };
        n.onchange = () => set(n.value);
        [m, n, p].forEach(x => tb.appendChild(x)); return;
      }
      const b = document.createElement("button"); b.id = "tb_" + it[0]; b.innerHTML = it[1]; b.title = it[2]; b.onclick = it[3];
      tb.appendChild(b);
    });
    tb.addEventListener("mousedown", e => { if (e.target.closest("button")) e.preventDefault(); });   // keep the text selection while clicking buttons
  }
  let selRaf = 0;
  E.onSelection = function () {
    if (selRaf) return; selRaf = requestAnimationFrame(() => { selRaf = 0; syncToolbar(); updateStatus(); });
  };
  function syncToolbar() {
    const s = E.state() || (PX.cur() && { size: PX.cur().text.size, font: PX.cur().text.font, block: "P" }); if (!s) return;
    ["bold", "italic", "underline", "strike", "left", "center", "right", "full", "ul", "ol"].forEach(k => { const b = $("tb_" + k); if (b) b.classList.toggle("on", !!s[k]); });
    const st = $("tbStyle"); if (st) st.value = [...st.options].some(o => o.value === s.block) ? s.block : "P";
    const sz = $("tbSize"); if (sz && document.activeElement !== sz) sz.value = s.size;
    const f = $("tbFont"); if (f && document.activeElement !== f) f.value = [...f.options].some(o => o.value === s.font) ? s.font : f.options[0].value;
    $("tb_undo").disabled = !E.canUndo(); $("tb_redo").disabled = !E.canRedo();
  }

  /* ---------- document list ---------- */
  function strip(html) { return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "); }
  function renderSide() {
    const q = PX.tmp.q.trim().toLowerCase();
    let list = PX.docList();
    if (q) list = list.filter(d => (d.title + " " + strip(d.html)).toLowerCase().includes(q));
    $("docList").innerHTML = list.map(d =>
      '<div class="doc' + (d.id === PX.ui.cur ? " on" : "") + '" data-id="' + d.id + '"><button class="dx" data-del="1" title="Delete this document">×</button><div class="t' + (d.title ? "" : " empty") + '">' + U.esc(d.title || "Untitled") +
      '</div><div class="m"><b>' + d.lang.toUpperCase() + "</b> · " + (d.words || 0).toLocaleString() + " words · " + U.ago(d.modified) + "</div></div>").join("") ||
      '<div class="none">' + (q ? "No document matches." : "No documents yet.") + "</div>";
  }
  $("docList").addEventListener("click", e => {
    const el = e.target.closest(".doc"); if (!el) return;
    if (e.target.closest("[data-del]")) { const d = PX.D.docs[el.dataset.id]; if (d) deleteDoc(d); return; }
    openDoc(el.dataset.id);
  });
  $("btnDelDoc").onclick = () => { const d = PX.cur(); if (d) deleteDoc(d); };
  $("q").addEventListener("input", e => { PX.tmp.q = e.target.value; renderSide(); });
  function openDoc(id) {
    if (id === PX.ui.cur && loadedId === id) return;
    E.layoutNow && E.layoutNow(); PX.ui.cur = id; PX.saveUI(); loadCurrent(); renderSide(); renderHead();
    if (window.innerWidth <= 820) { $("side").classList.add("off"); }
  }
  PX.openDoc = openDoc;
  function loadCurrent() {
    const d = PX.cur();
    if (!d) { E.unload(); loadedId = null; return; }
    if (loadedId !== d.id) { E.load(d); loadedId = d.id; d.words = E.stats().words; syncToolbar(); }
  }
  function renderHead() {
    const d = PX.cur(); $("docTitle").value = d ? d.title : ""; $("docTitle").disabled = !d;
    $("docLang").value = d ? d.lang : "en"; $("side").classList.toggle("off", !PX.ui.sidebar); syncTr();
  }
  function syncTr() {                                // the Turkish-letters switch only shows for Turkish documents
    const d = PX.cur(), tr = !!d && d.lang === "tr", b = $("btnTrAuto");
    b.hidden = !tr; b.classList.toggle("on", PX.S.trAuto !== false); if (tr) PX.tr.ensure();
  }
  $("btnTrAuto").onclick = () => {
    PX.S.trAuto = PX.S.trAuto === false; PX.save(); syncTr();
    PX.toast(PX.S.trAuto === false ? "Turkish letter autocorrect is off." : "Turkish letter autocorrect is on: finish a word with a space and ç ş ğ ı are put back.");
    E.focus();
  };
  $("docTitle").addEventListener("input", e => { const d = PX.cur(); if (!d) return; d.title = e.target.value; d.modified = Date.now(); PX.saveSoon(); renderSide(); });
  $("docLang").innerHTML = Object.entries(PX.LANGS).map(([k, v]) => '<option value="' + k + '">' + v + "</option>").join("");
  $("docLang").addEventListener("change", e => { const d = PX.cur(); if (!d) return; d.lang = e.target.value; PX.S.defaultLang = d.lang; E.refresh(); PX.saveSoon(); renderSide(); syncTr(); E.focus(); });
  $("btnNew").onclick = () => { const d = PX.newDoc(); PX.ui.cur = d.id; PX.saveUI(); PX.save(); loadCurrent(); renderSide(); renderHead(); $("docTitle").focus(); };
  $("btnSide").onclick = () => { const off = $("side").classList.toggle("off"); PX.ui.sidebar = !off; PX.saveUI(); };

  /* ---------- status bar & zoom ---------- */
  let stRaf = 0;
  function updateStatus() {
    if (stRaf) return; stRaf = requestAnimationFrame(() => {
      stRaf = 0; if (!PX.cur()) return; const s = E.stats();
      $("stPage").textContent = "Page " + (s.page || 1) + " of " + s.pages; $("stWords").textContent = s.words.toLocaleString() + " words";
      $("stChars").textContent = s.chars.toLocaleString() + " characters"; $("stSel").textContent = s.selWords ? s.selWords + " selected" : "";
      const d = PX.cur(); if (d) { d.words = s.words; }
      $("zoom").value = Math.round((PX.S.zoom || 1) * 100); $("zVal").textContent = Math.round((PX.S.zoom || 1) * 100) + " %";
      const u = $("tb_undo"); if (u) { u.disabled = !E.canUndo(); $("tb_redo").disabled = !E.canRedo(); }
    });
  }
  E.onChange = () => { updateStatus(); if (PX.ui.cur) renderSideSoon(); };
  const renderSideSoon = U.debounce(renderSide, 1200);
  $("zoom").addEventListener("input", e => { E.setZoom(+e.target.value / 100); updateStatus(); });
  $("zIn").onclick = () => { E.setZoom((PX.S.zoom || 1) + 0.1); updateStatus(); };
  $("zOut").onclick = () => { E.setZoom((PX.S.zoom || 1) - 0.1); updateStatus(); };
  $("zVal").onclick = () => { E.fitWidth(); updateStatus(); };

  /* ---------- where it is saved ---------- */
  function renderFile() {
    const F = PX.file, c = $("fileChip"); let t, cls = "";
    if (!F.ok) { t = "Saved in this browser"; }
    else if (F.state === "none") { t = "Choose a save folder"; cls = "warn"; }
    else if (F.state === "needs") { t = "Reconnect “" + F.name + "”"; cls = "warn"; }
    else if (F.state === "error") { t = "Could not save to “" + F.name + "”"; cls = "bad"; }
    else if (F.state === "saving") { t = "Saving…"; cls = "ok"; }
    else { t = "● Saved in " + F.name + "/Phoenix.phx"; cls = "ok"; }
    c.textContent = t; c.className = "chip " + cls;
  }
  PX.onFileState = renderFile;
  $("fileChip").onclick = () => {
    const F = PX.file;
    if (!F.ok) PX.toast("This browser cannot save into a folder. Use Brave, Chrome or Edge, or make backups from the ⋯ menu.");
    else if (F.state === "needs" || F.state === "error") PX.reconnect(); else if (F.state === "none") PX.chooseFolder();
    else PX.toast("Phoenix saves every change into " + F.name + "/Phoenix.phx on its own. Change the folder from the ⋯ menu.");
  };

  /* ---------- ⋯ menu ---------- */
  function buildMenu() {
    const F = PX.file, d = PX.cur();
    $("menu").innerHTML =
      (F.ok ? '<button data-a="folder">' + (F.dir ? "Change save folder…" : "Choose save folder…") + "</button>" : "") +
      '<button data-a="backup">Download a backup (.phx)</button><button data-a="restore">Restore from a backup…</button><hr>' +
      (d ? '<button data-a="txt">Export this document as text (.txt)</button><button data-a="print">Print / save as PDF</button><button data-a="dup">Duplicate this document</button><hr>' +
        '<button data-a="del" class="danger">Delete this document…</button>' : "");
  }
  $("btnMenu").onclick = e => { e.stopPropagation(); const m = $("menu"); if (m.hidden) buildMenu(); m.hidden = !m.hidden; };
  document.addEventListener("click", e => { if (!e.target.closest("#menu")) $("menu").hidden = true; });
  $("menu").addEventListener("click", e => {
    const a = e.target.closest("button"); if (!a) return; $("menu").hidden = true;
    const d = PX.cur();
    ({
      folder: () => PX.chooseFolder(), backup: () => PX.downloadBackup(), restore: () => $("restoreInput").click(), print: () => printDoc(),
      txt: () => { if (!d) return; downloadText(U.safeName(d.title) + ".txt", (d.title ? d.title + "\n\n" : "") + E.plainText(d.html)); },
      dup: () => { if (!d) return; E.layoutNow(); const n = PX.newDoc((d.title || "Untitled") + " (copy)", d.html); n.lang = d.lang; n.page = Object.assign({}, d.page); n.text = Object.assign({}, d.text); n.words = d.words; n.comments = JSON.parse(JSON.stringify(d.comments || [])); PX.ui.cur = n.id; PX.save(); loadCurrent(); renderSide(); renderHead(); },
      del: () => { if (d) deleteDoc(d); }
    })[a.dataset.a]();
  });
  $("restoreInput").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) PX.restoreFrom(f); });
  function deleteDoc(d) {
    const mine = PX.D.world.filter(c => c.doc === d.id);
    if (!confirm("Delete “" + (d.title || "Untitled") + "”?\n\n" + (mine.length ? "Its " + mine.length + " world card" + (mine.length === 1 ? "" : "s") + " will be deleted with it.\n\n" : "") + "This cannot be undone (unless you have a backup).")) return;
    const gone = new Set(mine.map(c => c.id));                                    // cards of this document and any links to them go too
    PX.D.world = PX.D.world.filter(c => !gone.has(c.id));
    PX.D.world.forEach(c => Object.keys(c.f).forEach(k => { if (gone.has(c.f[k])) delete c.f[k]; else if (Array.isArray(c.f[k])) c.f[k] = c.f[k].filter(x => !gone.has(x)); }));
    delete PX.D.docs[d.id]; loadedId = null;
    let next = PX.docList()[0]; if (!next) next = PX.newDoc();
    PX.ui.cur = next.id; PX.save(); PX.saveUI(); loadCurrent(); renderSide(); renderHead();
  }
  function downloadText(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- printing ---------- */
  function printDoc() {
    const d = PX.cur(); if (!d) return; E.layoutNow();
    const p = d.page, t = d.text; let w = p.w, h = p.h; if (p.landscape) [w, h] = [h, w];
    const pos = { left: "left", center: "center", right: "right" }[p.numbers];
    const css = "@page{size:" + w + "mm " + h + "mm;margin:" + p.mt + "mm " + p.mr + "mm " + p.mb + "mm " + p.ml + "mm;" +
      (pos ? "@bottom-" + pos + "{content:counter(page);font:10pt Georgia,serif;color:#555}" : "") + "}";
    $("print").innerHTML = "<style>" + css + '</style><div class="doc-body' + (t.indent ? " indent" : "") + '" style="--font:\'' + t.font + "';--fs:" + t.size + "pt;--lh:" + t.lh + ";--ps:" + t.ps + 'em" lang="' + d.lang + '">' + d.html + "</div>";
    setTimeout(() => { window.print(); }, 50);
  }

  /* ---------- page & text dialog ---------- */
  const dlg = $("dlgSetup");
  $("sSize").innerHTML = Object.keys(PX.SIZES).map(k => "<option>" + k + "</option>").join("");
  $("sMargins").innerHTML = Object.keys(PX.MARGINS).map(k => "<option>" + k + "</option>").join("") + "<option>Custom</option>";
  $("tFont").innerHTML = PX.FONTS.map(f => '<option style="font-family:\'' + f + '\'">' + f + "</option>").join("");
  const num = id => parseFloat($(id).value) || 0;
  function customToggle() { $("sCustom").style.display = $("sSize").value === "Custom" ? "" : "none"; }
  function marginPreset() { const m = PX.MARGINS[$("sMargins").value]; if (m) { ["sMt", "sMr", "sMb", "sMl"].forEach((id, i) => { $(id).value = m[i]; }); } }
  $("sSize").onchange = () => { const s = PX.SIZES[$("sSize").value]; if (s) { $("sW").value = s[0]; $("sH").value = s[1]; } customToggle(); };
  $("sMargins").onchange = marginPreset;
  ["sMt", "sMr", "sMb", "sMl"].forEach(id => { $(id).oninput = () => { $("sMargins").value = Object.keys(PX.MARGINS).find(k => PX.MARGINS[k].join() === [num("sMt"), num("sMr"), num("sMb"), num("sMl")].join()) || "Custom"; }; });
  $("btnSetup").onclick = () => {
    const d = PX.cur(); if (!d) return; const p = d.page, t = d.text;
    $("sSize").value = p.size; $("sW").value = p.w; $("sH").value = p.h; $("sOrient").value = p.landscape ? "l" : "p";
    $("sMt").value = p.mt; $("sMr").value = p.mr; $("sMb").value = p.mb; $("sMl").value = p.ml;
    $("sMargins").value = Object.keys(PX.MARGINS).find(k => PX.MARGINS[k].join() === [p.mt, p.mr, p.mb, p.ml].join()) || "Custom";
    $("sNum").value = p.numbers; $("sPaper").value = p.paper;
    $("tFont").value = t.font; $("tSize").value = t.size; $("tLh").value = String(t.lh); $("tPs").value = String(t.ps); $("tIndent").checked = !!t.indent;
    customToggle(); dlg.showModal();
  };
  $("setupForm").addEventListener("submit", e => {
    if (e.submitter && e.submitter.value !== "ok") return;
    const d = PX.cur(); if (!d) return;
    const size = $("sSize").value, s = PX.SIZES[size];
    const page = { size, w: s ? s[0] : Math.max(50, num("sW")), h: s ? s[1] : Math.max(50, num("sH")), landscape: $("sOrient").value === "l",
      mt: num("sMt"), mr: num("sMr"), mb: num("sMb"), ml: num("sMl"), numbers: $("sNum").value, paper: $("sPaper").value };
    page.mt = Math.min(page.mt, page.h / 3); page.mb = Math.min(page.mb, page.h / 3); page.ml = Math.min(page.ml, page.w / 3); page.mr = Math.min(page.mr, page.w / 3);
    const text = { font: $("tFont").value, size: Math.min(48, Math.max(6, num("tSize") || 12)), lh: +$("tLh").value, ps: +$("tPs").value, indent: $("tIndent").checked };
    d.page = page; d.text = text;
    if ($("sDefault").checked) { PX.S.defaultPage = Object.assign({}, page); PX.S.defaultText = Object.assign({}, text); }
    E.refresh(); PX.save(); E.focus();
  });

  /* ---------- keyboard: save is automatic, but Ctrl+S should not open the browser's dialog ---------- */
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); PX.save(); PX.writeFileNow(); PX.toast("Saved."); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); printDoc(); }
  });

  /* ---------- first start & full redraw ---------- */
  const WELCOME = "<h1>Welcome to Phoenix</h1>" +
    "<p>This is your writing room. Every change is saved on its own, so there is nothing to remember. Pick a save folder in the top right and your writing lands in one file there, Phoenix.phx.</p>" +
    "<p>The page you are looking at is real: use “Page &amp; text…” above to change the paper size, the margins, the font, the line spacing, and whether paragraphs are indented. The toolbar changes the selected text.</p>" +
    "<h2>Writing in three languages</h2>" +
    "<p>Each document has its own language (English, Deutsch or Türkçe) next to its title. The browser underlines mistakes using that language, as long as the dictionary is switched on in the browser’s own language settings.</p>" +
    "<p>Delete this document whenever you like and start your own.</p>";
  PX.render = function () {
    loadedId = null; if (!PX.cur()) { const l = PX.docList(); PX.ui.cur = l.length ? l[0].id : ""; }
    loadCurrent(); renderSide(); renderHead(); renderFile(); updateStatus();
  };
  PX.start = function () {
    buildToolbar(); E.init();
    if (!Object.keys(PX.D.docs).length) { const d = PX.newDoc("Welcome", WELCOME); PX.ui.cur = d.id; PX.save(); }
    if (!PX.cur()) PX.ui.cur = PX.docList()[0].id;
    PX.render(); syncToolbar();
  };
})(window.PX);
