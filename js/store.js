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

  PX.fixData = function () {
    const D = PX.D;
    D.docs = D.docs || {};
    Object.values(D.docs).forEach(d => {
      d.title = d.title || ""; d.lang = d.lang || "en"; d.html = d.html || "<p><br></p>";
      d.page = Object.assign({}, DEFAULT_PAGE, d.page); d.text = Object.assign({}, DEFAULT_TEXT, d.text);
      d.created = d.created || Date.now(); d.modified = d.modified || d.created; d.words = d.words || 0; d.comments = d.comments || [];
    });
    PX.S.defaultPage = Object.assign({}, DEFAULT_PAGE, PX.S.defaultPage); PX.S.defaultText = Object.assign({}, DEFAULT_TEXT, PX.S.defaultText);
  };
  PX.fixData();

  PX.newDoc = function (title, html) {
    const id = U.uid(), now = Date.now();
    PX.D.docs[id] = { id, title: title || "", lang: PX.S.defaultLang, html: html || "<p><br></p>", page: Object.assign({}, PX.S.defaultPage), text: Object.assign({}, PX.S.defaultText), created: now, modified: now, words: 0, comments: [] };
    return PX.D.docs[id];
  };
  PX.docList = () => Object.values(PX.D.docs).sort((a, b) => b.modified - a.modified);
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
