/* Phoenix — document types in the Write tab: the "New…" picker, the small row of type-specific fields under the title
   (email: from/to, journal: date, note: colour, document: status, book: author/cover), and the book overview with its chapter list. */
(function (PX) {
  const U = PX.U, $ = id => document.getElementById(id);
  const K = (PX.kinds = {});
  const T = d => PX.TYPES[d.type];

  /* ---------- New… ---------- */
  K.chooseNew = function () {
    $("newTiles").innerHTML = Object.entries(PX.TYPES).filter(([, t]) => !t.hidden).map(([k, t]) =>
      '<button type="button" class="ntile" data-k="' + k + '" style="--tc:' + t.color + '"><span class="ni">' + t.icon + '</span><b>' + t.name + "</b><small>" + t.desc + "</small></button>").join("");
    $("dlgNew").showModal();
  };
  $("newTiles").addEventListener("click", e => {
    const b = e.target.closest(".ntile"); if (!b) return;
    $("dlgNew").close(); K.create(b.dataset.k);
  });
  K.create = function (type) {
    const d = PX.newDoc("", null, { type });
    if (type === "book") PX.newDoc("", null, { type: "chapter", parent: d.id });        // a book starts with its first chapter
    PX.showNew(d);
  };
  K.addChapter = function (bookId) {
    const c = PX.newDoc("", null, { type: "chapter", parent: bookId });
    PX.showNew(c);
  };

  /* ---------- row under the title ---------- */
  const swatches = (map, cur, attr) => Object.entries(map).map(([k, v]) =>
    '<button type="button" class="sw' + (k === cur ? " on" : "") + '" data-' + attr + '="' + k + '" style="background:' + v[0] + '" title="' + v[1] + '"></button>').join("");
  const field = (label, key, val, ph, type) => '<label class="mf">' + label + ' <input data-m="' + key + '" type="' + (type || "text") + '" value="' + U.esc(val || "") + '" placeholder="' + (ph || "") + '" autocomplete="off"></label>';

  K.render = function (titleOnly) {
    const d = PX.cur(), row = $("metaRow"), home = $("bookHome");
    if (!d) { row.hidden = true; home.hidden = true; return; }
    const t = T(d), book = d.type === "book", parent = d.type === "chapter" && PX.D.docs[d.parent];
    $("docTitle").placeholder = t.ph;
    if (book) { if (titleOnly) { paintCoverPreview(d); return; } renderBook(d); }
    if (titleOnly) return;
    $("btnDelDoc").textContent = "Delete " + t.name.toLowerCase();
    let h = '<span class="tbadge" style="--tc:' + t.color + '"><span class="ni">' + t.icon + "</span>" + t.name + "</span>";
    const m = d.meta;
    if (parent) {
      const kids = PX.chapters(parent.id), n = kids.findIndex(c => c.id === d.id) + 1;
      h += '<button type="button" class="mlink" data-open="' + parent.id + '">◂ ' + U.esc(parent.title || "Untitled book") + '</button><span class="mtxt">Chapter ' + n + " of " + kids.length + "</span>";
    }
    if (d.type === "email") h += field("From", "from", m.from, "your name") + field("To", "to", m.to, "recipient");
    if (d.type === "journal") h += field("Date", "date", m.date, "", "date");
    if (d.type === "note") h += '<span class="mtxt">Colour</span><span class="sws">' + swatches(PX.NOTE_COLORS, m.color, "nc") + "</span>";
    if (d.type === "document") h += '<label class="mf">Status <select data-m="status">' + PX.STATUSES.map(s => "<option" + (m.status === s ? " selected" : "") + ">" + s + "</option>").join("") + "</select></label>";
    if (book) {
      const bs = (PX.D.marks[d.id] || {}).style || "strip";
      h += field("Author", "author", m.author, "your name") + '<span class="mtxt">Cover</span><span class="sws">' + swatches(PX.COVERS, m.cover, "cv") + "</span>" +
        '<label class="mf">Bookmark <select data-bm="1"><option value="strip"' + (bs === "strip" ? " selected" : "") + '>Strip with the title</option><option value="corner"' + (bs === "corner" ? " selected" : "") + ">Folded corner</option></select></label>";
    }
    row.innerHTML = h; row.hidden = false;
  };
  $("metaRow").addEventListener("input", e => {
    const d = PX.cur(); if (d && e.target.dataset.bm) {                                   // bookmark style of this book
      const rec = PX.D.marks[d.id] = PX.D.marks[d.id] || { style: "strip", doc: "", i: 0 }; rec.style = e.target.value; PX.saveSoon(); return;
    }
    const k = e.target.dataset.m; if (!d || !k) return;
    d.meta[k] = e.target.value; d.modified = Date.now(); PX.saveSoon(); PX.refreshSide();
    if (d.type === "book") paintCoverPreview(d);
  });
  $("metaRow").addEventListener("click", e => {
    const d = PX.cur(); if (!d) return;
    const open = e.target.closest("[data-open]"); if (open) { PX.openDoc(open.dataset.open); return; }
    const sw = e.target.closest(".sw"); if (!sw) return;
    if (sw.dataset.nc) d.meta.color = sw.dataset.nc; else if (sw.dataset.cv) d.meta.cover = sw.dataset.cv; else return;
    d.modified = Date.now(); PX.saveSoon(); K.render();
  });

  /* ---------- the book overview ---------- */
  function paintCoverPreview(d) {
    const c = $("bookHome").querySelector(".bh-cover"); if (!c) return;
    c.style.setProperty("--cover", PX.COVERS[d.meta.cover] ? PX.COVERS[d.meta.cover][0] : PX.COVERS.oxblood[0]);
    c.querySelector(".bh-ct").textContent = d.title || "Untitled book"; c.querySelector(".bh-ca").textContent = d.meta.author || "";
  }
  function renderBook(d) {
    const kids = PX.chapters(d.id), words = kids.reduce((n, k) => n + (k.words || 0), 0);
    $("bookHome").innerHTML =
      '<div class="bh-wrap"><div class="bh-cover"><div class="bh-orn"></div><div class="bh-ct"></div><div class="bh-orn small"></div><div class="bh-ca"></div></div>' +
      '<div class="bh-main"><div class="bh-top"><div><h2>Table of contents</h2><div class="bh-sub">Made automatically from your chapters · ' + kids.length + (kids.length === 1 ? " chapter" : " chapters") + " · " + words.toLocaleString() + " words</div></div>" +
      '<span class="grow"></span><button type="button" id="bhRead">Read this book</button><button type="button" class="primary" id="bhAdd">+ Add chapter</button></div>' +
      '<ol class="bh-list">' + (kids.map((c, i) =>
        '<li data-id="' + c.id + '"><span class="num">' + (i + 1) + '</span><span class="nm' + (c.title ? "" : " empty") + '">' + U.esc(c.title || "Untitled chapter") + '</span><span class="wc">' + (c.words || 0).toLocaleString() + " words</span>" +
        '<span class="acts"><button type="button" data-mv="-1" title="Move up"' + (i === 0 ? " disabled" : "") + '>↑</button><button type="button" data-mv="1" title="Move down"' + (i === kids.length - 1 ? " disabled" : "") + ">↓</button></span></li>").join("") ||
        '<li class="none">No chapters yet. Add the first one.</li>') + "</ol>" +
      '<p class="bh-hint">Click a chapter to write it. The order here is the order in the book. Page size, margins and font for the whole book: “Page &amp; text…” above.</p></div></div>';
    paintCoverPreview(d);
  }
  $("bookHome").addEventListener("click", e => {
    const d = PX.cur(); if (!d || d.type !== "book") return;
    if (e.target.closest("#bhAdd")) { K.addChapter(d.id); return; }
    if (e.target.closest("#bhRead")) { PX.read.open(d.id); return; }
    const li = e.target.closest("li[data-id]"); if (!li) return;
    const mv = e.target.closest("[data-mv]");
    if (mv) {
      const kids = PX.chapters(d.id), i = kids.findIndex(c => c.id === li.dataset.id), j = i + (+mv.dataset.mv);
      if (j < 0 || j >= kids.length) return;
      [kids[i], kids[j]] = [kids[j], kids[i]]; kids.forEach((c, n) => { c.order = n; }); d.modified = Date.now();
      PX.save(); renderBook(d); PX.refreshSide(); return;
    }
    PX.openDoc(li.dataset.id);
  });
})(window.PX);
