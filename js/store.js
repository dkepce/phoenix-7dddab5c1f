/* Phoenix — data, saving (browser storage + Phoenix.phx in a folder the user picks). Same idea as LabGorilla's .lbk. */
(function (PX) {
  const U = PX.U;

  /* ---------- page & text presets ---------- */
  PX.SIZES = { A4: [210, 297], A5: [148, 210], A6: [105, 148], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Custom: null };
  PX.MARGINS = { Normal: [25.4, 25.4, 25.4, 25.4], Narrow: [12.7, 12.7, 12.7, 12.7], Moderate: [25.4, 19.1, 25.4, 19.1], Wide: [25.4, 50.8, 25.4, 50.8], Book: [22, 22, 25, 25] };   // top, right, bottom, left
  PX.FONTS = ["Georgia", "Palatino Linotype", "Book Antiqua", "Cambria", "Times New Roman", "Garamond", "Calibri", "Segoe UI", "Arial", "Verdana", "Trebuchet MS", "Consolas", "Courier New"];
  PX.LANGS = { en: "English", de: "Deutsch", tr: "Türkçe" };
  PX.PAPER = { paper: ["#fbf6e6", "#2a241f"], white: ["#ffffff", "#1c1c1c"], night: ["#232a38", "#e9e2cf"] };

  const DEFAULT_PAGE = { size: "A4", w: 210, h: 297, landscape: false, mt: 25.4, mr: 25.4, mb: 25.4, ml: 25.4, numbers: "center", paper: "paper" };
  const DEFAULT_TEXT = { font: "Georgia", size: 12, lh: 1.5, ps: 0.6, indent: false };
  const DEFAULT_S = { defaultLang: "en", defaultPage: DEFAULT_PAGE, defaultText: DEFAULT_TEXT, zoom: 1 };
  const DEFAULT_UI = { cur: "", sidebar: true, view: "write" };
  PX.DEFAULT_PAGE = DEFAULT_PAGE; PX.DEFAULT_TEXT = DEFAULT_TEXT;

  function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  PX.S = Object.assign({}, DEFAULT_S, load("phoenix.settings", null) || {});
  PX.D = load("phoenix.data", null) || {};
  PX.ui = Object.assign({}, DEFAULT_UI, load("phoenix.ui", null) || {});
  PX.tmp = { toast: "", q: "" };

  /* ---------- document types ----------
     Every document has a type. "chapter" belongs to a book (doc.parent) and is not offered in the New dialog.
     page/text are the starting settings of a new document of that type (a story uses the user's own defaults). */
  const pg = (size, w, h, m, numbers, paper) => ({ size, w, h, landscape: false, mt: m[0], mr: m[1], mb: m[2], ml: m[3], numbers, paper });
  const BOOK_PAGE = pg("A5", 148, 210, PX.MARGINS.Book, "center", "paper");
  const BOOK_TEXT = { font: "Georgia", size: 11, lh: 1.5, ps: 0, indent: true };
  const ic = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
  PX.TYPES = {
    story: { name: "Story", color: "#f7b32b", desc: "Fiction and longer writing, with world cards. Read as calm pages.", ph: "Untitled",
      icon: ic('<path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z"/><path d="M16 8 2 22M17.5 15H9"/>') },
    book: { name: "Book", color: "#e08a5f", desc: "Chapters in order, a cover and an automatic table of contents. Read as an open book.", ph: "Book title",
      page: BOOK_PAGE, text: BOOK_TEXT, meta: { author: "", cover: "oxblood" },
      icon: ic('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') },
    document: { name: "Document", color: "#8fb6e8", desc: "Letters, reports, anything formal. Read pinned to a board, pages flip up.", ph: "Document title",
      page: pg("A4", 210, 297, PX.MARGINS.Normal, "right", "white"), text: { font: "Calibri", size: 11, lh: 1.15, ps: 0.6, indent: false }, meta: { status: "Draft" },
      icon: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>') },
    note: { name: "Note", color: "#f2d94e", desc: "A quick thought on a small sheet. Read as a sticky note.", ph: "Title (optional)",
      page: pg("A6", 105, 148, [10, 10, 10, 10], "none", "paper"), text: { font: "Trebuchet MS", size: 12, lh: 1.4, ps: 0.4, indent: false }, meta: { color: "yellow" },
      icon: ic('<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>') },
    email: { name: "Email", color: "#7fd1b9", desc: "To, from and a subject line. Read like a message in an inbox.", ph: "Subject",
      page: pg("A5", 148, 210, [15, 15, 15, 15], "none", "white"), text: { font: "Segoe UI", size: 11, lh: 1.4, ps: 0.6, indent: false }, meta: { from: "", to: "" },
      icon: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>') },
    journal: { name: "Journal", color: "#b79cf0", desc: "One entry per day, with a date. All entries read together in a leather journal.", ph: "Title (optional)",
      page: BOOK_PAGE, text: { font: "Georgia", size: 11, lh: 1.6, ps: 0.4, indent: false }, meta: { date: "" },
      icon: ic('<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18M10 8h6M10 12h6"/>') },
    chapter: { name: "Chapter", color: "#e08a5f", hidden: true, ph: "Chapter title",
      icon: ic('<path d="M6 3h12v18l-6-4-6 4z"/>') }
  };
  PX.COVERS = { oxblood: ["#6e1f26", "Oxblood"], navy: ["#1f3354", "Navy"], forest: ["#20473a", "Forest"], charcoal: ["#2c2f36", "Charcoal"], plum: ["#4a2a52", "Plum"], tan: ["#8a5a2b", "Tan"] };
  PX.NOTE_COLORS = { yellow: ["#f6e27a", "Yellow"], pink: ["#f4b6c2", "Pink"], blue: ["#a9d4f0", "Blue"], green: ["#b8e0a8", "Green"], orange: ["#f5c08a", "Orange"] };
  PX.STATUSES = ["Draft", "In review", "Final"];

  PX.fixData = function () {
    const D = PX.D;
    D.docs = D.docs || {}; D.vocab = D.vocab || []; D.world = D.world || []; D.grammar = D.grammar || [];
    D.grammar.forEach(r => { r.examples = r.examples || []; r.rule = r.rule || ""; r.title = r.title || ""; });
    D.world.forEach(c => { c.f = c.f || {}; c.extra = c.extra || []; c.notes = c.notes || ""; c.name = c.name || ""; });
    D.world = D.world.filter(c => c.name.trim() || Object.keys(c.f).length || c.notes.trim() || c.extra.length);       // forgotten empty stubs
    const fullest = Object.values(D.docs).filter(d => d.type !== "chapter").sort((a, b) => (b.words || 0) - (a.words || 0))[0];                          // cards made before documents were their home: put them in the fullest document
    D.world.forEach(c => { if (!c.doc || !D.docs[c.doc]) c.doc = fullest ? fullest.id : ""; });
    Object.values(D.docs).forEach(d => {
      d.title = d.title || ""; d.lang = d.lang || "en"; d.html = d.html || "<p><br></p>";
      d.page = Object.assign({}, DEFAULT_PAGE, d.page); d.text = Object.assign({}, DEFAULT_TEXT, d.text);
      d.created = d.created || Date.now(); d.modified = d.modified || d.created; d.words = d.words || 0; d.comments = d.comments || [];
      d.type = PX.TYPES[d.type] ? d.type : "story"; d.meta = d.meta || {};                                            // documents from before types existed are stories
      if (d.type === "chapter" && !D.docs[d.parent]) { d.type = "story"; delete d.parent; }                          // a chapter whose book is gone becomes a story
      if (d.type !== "chapter") delete d.parent; else d.order = d.order || 0;
    });
    D.world.forEach(c => { const d = D.docs[c.doc]; if (d && d.type === "chapter") c.doc = d.parent; });                  // a chapter has no world of its own: its cards belong to the book
    PX.S.defaultPage = Object.assign({}, DEFAULT_PAGE, PX.S.defaultPage); PX.S.defaultText = Object.assign({}, DEFAULT_TEXT, PX.S.defaultText);
  };
  PX.fixData();

  /* opts: { type, parent (book id, for a chapter), meta } */
  PX.newDoc = function (title, html, opts) {
    opts = opts || {};
    const id = U.uid(), now = Date.now(), type = PX.TYPES[opts.type] ? opts.type : "story", T = PX.TYPES[type], parent = opts.parent && PX.D.docs[opts.parent];
    const page = parent ? parent.page : T.page || PX.S.defaultPage, text = parent ? parent.text : T.text || PX.S.defaultText;      // a chapter starts with its book's page & text
    const d = PX.D.docs[id] = { id, title: title || "", lang: parent ? parent.lang : PX.S.defaultLang, html: html || "<p><br></p>", page: Object.assign({}, page), text: Object.assign({}, text),
      created: now, modified: now, words: 0, comments: [], type, meta: Object.assign({}, T.meta, opts.meta) };
    if (type === "journal" && !d.meta.date) d.meta.date = U.today();
    if (parent) { d.order = PX.chapters(parent.id).length; d.type = "chapter"; d.parent = parent.id; }
    return d;
  };
  PX.docList = () => Object.values(PX.D.docs).sort((a, b) => b.modified - a.modified);
  PX.chapters = bookId => Object.values(PX.D.docs).filter(d => d.type === "chapter" && d.parent === bookId).sort((a, b) => a.order - b.order || a.created - b.created);
  PX.topList = () => PX.docList().filter(d => d.type !== "chapter");           // everything except chapters (those hang under their book)
  PX.cur = () => PX.D.docs[PX.ui.cur] || null;

  /* ---------- saving ---------- */
  let savedAt = 0; try { savedAt = +localStorage.getItem("phoenix.savedAt") || 0; } catch (e) { }
  let lastSer = JSON.stringify({ S: PX.S, D: PX.D });
  PX.payload = () => ({ app: "phoenix", version: 1, saved: new Date(savedAt || Date.now()).toISOString(), settings: PX.S, data: PX.D });
  function persistLocal() {
    try {
      localStorage.setItem("phoenix.settings", JSON.stringify(PX.S));
      localStorage.setItem("phoenix.data", JSON.stringify(PX.D));
      localStorage.setItem("phoenix.savedAt", String(savedAt));
    } catch (e) { PX.toast("Browser storage is full. Please choose a folder or make a backup."); }
  }
  PX.save = function () {
    const ser = JSON.stringify({ S: PX.S, D: PX.D });
    if (ser === lastSer) return;
    lastSer = ser; savedAt = Date.now(); persistLocal(); PX.scheduleFileWrite();
  };
  PX.saveSoon = U.debounce(() => PX.save(), 500);
  PX.saveUI = U.debounce(() => { try { localStorage.setItem("phoenix.ui", JSON.stringify(PX.ui)); } catch (e) { } }, 300);

  /* ---------- IndexedDB (remembers the chosen folder) ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("phoenix", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
  async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } }
  async function idbDel(k) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { } }

  /* ---------- Phoenix.phx in a folder the user picks (File System Access API) ---------- */
  const FS_OK = !!window.showDirectoryPicker;
  const F = (PX.file = { ok: FS_OK, dir: null, state: FS_OK ? "none" : "local", name: "", timer: null, lastWrite: 0, msg: "" });
  PX.onFileState = () => { };
  function setState(s) { F.state = s; PX.onFileState(); }
  async function perm(h, ask) {
    if (!h.queryPermission) return true;
    const o = { mode: "readwrite" };
    if ((await h.queryPermission(o)) === "granted") return true;
    return !!ask && (await h.requestPermission(o)) === "granted";
  }
  PX.hasContent = () => Object.values(PX.D.docs).some(d => d.words > 0 || d.title);
  PX.scheduleFileWrite = function () { if (!F.dir) return; clearTimeout(F.timer); F.timer = setTimeout(() => writeFile(false), 700); };
  async function writeFile(ask) {
    if (!F.dir) return; clearTimeout(F.timer); F.timer = null;
    try {
      if (!(await perm(F.dir, ask))) { setState("needs"); return false; }
      setState("saving");
      const fh = await F.dir.getFileHandle("Phoenix.phx", { create: true });
      const w = await fh.createWritable(); await w.write(JSON.stringify(PX.payload())); await w.close();
      F.lastWrite = Date.now(); setState("ok"); return true;
    } catch (e) { F.msg = e.message; setState("error"); return false; }
  }
  PX.writeFileNow = () => writeFile(true);
  async function readPhx(dir) {
    const fh = await dir.getFileHandle("Phoenix.phx");
    return JSON.parse(await (await fh.getFile()).text());
  }
  function checkPayload(j) { if (!j || j.app !== "phoenix" || !j.data) throw new Error("not a Phoenix file"); return j; }
  PX.applyPayload = function (j) {
    checkPayload(j);
    PX.S = Object.assign({}, DEFAULT_S, j.settings); PX.D = j.data; PX.fixData();
    savedAt = j.saved ? Date.parse(j.saved) || Date.now() : Date.now();
    lastSer = JSON.stringify({ S: PX.S, D: PX.D }); persistLocal();
    if (!PX.D.docs[PX.ui.cur]) PX.ui.cur = (PX.docList()[0] || {}).id || "";
    PX.render();
  };
  async function syncFromFile() {
    try {
      const j = checkPayload(await readPhx(F.dir)), fsaved = Date.parse(j.saved) || 0;
      if (fsaved > savedAt + 1000) PX.applyPayload(j);
      else if (savedAt > fsaved + 1000) await writeFile(false);
      setState("ok");
    } catch (e) {
      if (e.name === "NotFoundError") await writeFile(false); else setState("error");
    }
  }
  PX.chooseFolder = async function () {
    try {
      const dir = await showDirectoryPicker({ id: "phoenix", mode: "readwrite" });
      let existing = null;
      try { existing = checkPayload(await readPhx(dir)); } catch (e) { }
      if (existing && PX.hasContent() && !confirm("This folder already contains a Phoenix.phx.\n\nOpen it? What is on screen now will be replaced.\n(Press Cancel to keep what you have and choose another folder.)")) return;
      F.dir = dir; F.name = dir.name; await idbSet("dir", dir);
      if (existing) PX.applyPayload(existing); else await writeFile(true);
      setState("ok");
      PX.toast("Done: Phoenix now saves itself into " + dir.name + "/Phoenix.phx");
    } catch (e) { if (e.name !== "AbortError") PX.toast("That did not work: " + e.message); }
  };
  PX.reconnect = async function () {
    if (!F.dir) return false;
    try { if (await perm(F.dir, true)) { await syncFromFile(); return F.state === "ok"; } } catch (e) { }
    setState("needs"); return false;
  };
  PX.unlinkFolder = async function () { F.dir = null; F.name = ""; await idbDel("dir"); setState(FS_OK ? "none" : "local"); };
  /* a .phx file opened from Explorer/Finder (double-click) arrives here as a file handle */
  PX.openLaunched = async function (handle) {
    try {
      const file = await handle.getFile(), j = checkPayload(JSON.parse(await file.text())), when = Date.parse(j.saved) || 0;
      if (Math.abs(when - savedAt) < 1500) { PX.toast("“" + file.name + "” is already what Phoenix shows."); return; }
      if (PX.hasContent()) {
        const older = when < savedAt;
        const msg = older
          ? "“" + file.name + "” is OLDER than what is in Phoenix now (saved " + new Date(when).toLocaleString() + " vs " + new Date(savedAt).toLocaleString() + ").\n\nOpen it anyway? This replaces everything on screen" + (F.dir ? " and in the linked folder" : "") + "."
          : "Open “" + file.name + "”?\n\nThis replaces everything on screen" + (F.dir ? " and in the linked folder" : "") + " with the contents of this file.";
        if (!confirm(msg)) return;
      }
      PX.applyPayload(j); if (F.dir) await writeFile(false);
      PX.toast("Opened " + file.name + ".");
    } catch (e) { PX.toast(e.message === "not a Phoenix file" ? "That file is not a Phoenix file." : "That file could not be opened: " + e.message); }
  };
  PX.initFile = async function () {
    if (window.launchQueue) launchQueue.setConsumer(p => { if (p.files && p.files.length) PX.openLaunched(p.files[0]); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    PX.onFileState();
    if (!FS_OK) return;
    const dir = await idbGet("dir"); if (!dir) return;
    F.dir = dir; F.name = dir.name;
    if (!(await perm(dir, false))) { setState("needs"); return; }
    await syncFromFile();
  };
  /* pick up changes written elsewhere when you come back to the window */
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !F.dir || F.state === "needs") return;
    try { if (await perm(F.dir, false)) { const fh = await F.dir.getFileHandle("Phoenix.phx"); const f = await fh.getFile(); if (f.lastModified > F.lastWrite + 2000 && (JSON.parse(await f.text()).saved || "") > new Date(savedAt + 1000).toISOString()) await syncFromFile(); } } catch (e) { }
  });
  window.addEventListener("beforeunload", () => { if (PX.flushEditor) PX.flushEditor(); if (F.timer) writeFile(false); });

  PX.downloadBackup = function () {
    const blob = new Blob([JSON.stringify(PX.payload())], { type: "application/x-phoenix" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Phoenix-" + U.today() + ".phx";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    PX.toast("Backup saved: Phoenix-" + U.today() + ".phx (see your Downloads folder).");
  };
  PX.restoreFrom = async function (file) {
    try {
      const j = checkPayload(JSON.parse(await file.text()));
      if (!confirm("Replace everything in Phoenix with the backup from " + (j.saved || "").slice(0, 10) + "?")) return;
      PX.applyPayload(j); PX.save(); if (F.dir) await writeFile(false); PX.toast("Backup restored.");
    } catch (e) { PX.toast("That file is not a Phoenix backup."); }
  };
})(window.PX);
