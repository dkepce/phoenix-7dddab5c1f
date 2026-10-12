/* Phoenix — World (step 3): cards for characters, locations, races and items, linked to each other.
   A link field ("Birthplace", "Race", ...) takes a name: if no card of that kind has the name yet, a new card is created and linked. */
(function (PX) {
  const U = PX.U, E = PX.ed, $ = id => document.getElementById(id);
  const W = (PX.world = { tmp: { node: null, q: "", stack: [] } });
  const ORDER = ["character", "location", "race", "item"];
  const TYPES = {
    character: {
      label: "Character", plural: "Characters", summary: ["age", "gender", "race", "birthplace"],
      fields: [
        { k: "age", label: "Age", kind: "text", ph: "e.g. 17, or 300 years" },
        { k: "gender", label: "Gender", kind: "text", options: ["Female", "Male", "Non-binary", "Unknown"] },
        { k: "race", label: "Race", kind: "link", to: "race" },
        { k: "birthplace", label: "Birthplace", kind: "link", to: "location" },
        { k: "home", label: "Lives in", kind: "link", to: "location" },
        { k: "role", label: "Role / occupation", kind: "text" },
        { k: "family", label: "Family & relations", kind: "links", to: "character" },
        { k: "owns", label: "Owns / carries", kind: "links", to: "item" },
        { k: "look", label: "Appearance", kind: "long" },
        { k: "personality", label: "Personality", kind: "long" },
        { k: "story", label: "Backstory", kind: "long" }]
    },
    location: {
      label: "Location", plural: "Locations", summary: ["kind", "partof", "ruler"],
      fields: [
        { k: "kind", label: "Kind", kind: "text", options: ["Realm", "Continent", "Region", "City", "Town", "Village", "Building", "Landmark", "Other"] },
        { k: "partof", label: "Part of", kind: "link", to: "location" },
        { k: "ruler", label: "Ruled by", kind: "link", to: "character" },
        { k: "peoples", label: "Peoples living here", kind: "links", to: "race" },
        { k: "desc", label: "Description", kind: "long" },
        { k: "history", label: "History", kind: "long" }]
    },
    race: {
      label: "Race", plural: "Races", summary: ["home", "lifespan"],
      fields: [
        { k: "home", label: "Homeland", kind: "link", to: "location" },
        { k: "lifespan", label: "Lifespan", kind: "text" },
        { k: "language", label: "Language(s)", kind: "text" },
        { k: "looks", label: "Appearance", kind: "long" },
        { k: "culture", label: "Culture & customs", kind: "long" }]
    },
    item: {
      label: "Item", plural: "Items", summary: ["kind", "maker", "owner"],
      fields: [
        { k: "kind", label: "Kind", kind: "text", options: ["Weapon", "Armor", "Tool", "Artifact", "Jewel", "Book", "Other"] },
        { k: "maker", label: "Made by", kind: "link", to: "character" },
        { k: "madeAt", label: "Made at", kind: "link", to: "location" },
        { k: "owner", label: "Owner", kind: "link", to: "character" },
        { k: "desc", label: "Description", kind: "long" },
        { k: "history", label: "History", kind: "long" }]
    }
  };
  W.TYPES = TYPES;
  const cards = () => PX.D.world;
  const byId = id => cards().find(c => c.id === id);
  const nameOf = id => { const c = byId(id); return c ? (c.name || "Unnamed " + TYPES[c.type].label.toLowerCase()) : "(deleted)"; };
  const touch = c => { c.modified = Date.now(); PX.saveSoon(); };
  const norm = s => s.trim().toLocaleLowerCase();
  /* a world belongs to a book: a chapter uses its book's world and never has one of its own.
     Documents that are not books are only listed while they still hold cards from before (move those cards to a book with the selector on the card). */
  const homeOf = id => { const d = PX.D.docs[id]; return d && d.type === "chapter" && PX.D.docs[d.parent] ? d.parent : id; };
  const homes = () => PX.docList().filter(d => d.type === "book" || (d.type !== "chapter" && cards().some(c => c.doc === d.id)));
  W.homeOf = homeOf;
  function newCard(type, name, doc) { const c = { id: U.uid(), type, name: name || "", doc: homeOf(doc || PX.ui.cur), f: {}, extra: [], notes: "", created: Date.now(), modified: Date.now() }; cards().push(c); return c; }
  W.find = (name, type, doc) => { const hd = doc && homeOf(doc); return cards().find(c => (!type || c.type === type) && (!hd || c.doc === hd) && norm(c.name) === norm(name)); };
  const docTitle = id => (PX.D.docs[id] ? PX.D.docs[id].title || "Untitled" : "(deleted document)");
  function linkTo(type, name, doc) {               // an existing card of that kind in the same document, or a new one there
    const ex = W.find(name, type, doc); if (ex) return ex.id;
    const c = newCard(type, name.trim(), doc); PX.toast("New " + TYPES[type].label.toLowerCase() + " card “" + c.name + "” created. Open it to fill it in.");
    return c.id;
  }
  const values = (c, f) => (f.kind === "links" ? c.f[f.k] || [] : c.f[f.k] ? [c.f[f.k]] : []);
  function show(c, f) {                            // a field as readable text
    const v = c.f[f.k]; if (!v || (Array.isArray(v) && !v.length)) return "";
    return f.kind === "link" ? nameOf(v) : f.kind === "links" ? v.map(nameOf).join(", ") : String(v);
  }

  /* ---------- the World tab: tree (document -> card types) + cards ---------- */
  PX.ui.wopen = PX.ui.wopen || {};
  const PHOENIX = "🐦‍🔥";
  function node() {                                 // the selected tree entry: { d: document, t: "all" | type }
    let n = W.tmp.node; const hs = homes();
    if (!n || !hs.some(d => d.id === n.d)) { const mine = homeOf(PX.ui.cur); n = W.tmp.node = { d: hs.some(d => d.id === mine) ? mine : (hs[0] || {}).id || "", t: "all" }; }
    return n;
  }
  function renderTree() {
    const n = node();
    if (!homes().length) { $("wTree").innerHTML = '<div class="none">No books yet.<br><br>A world belongs to a book. Make a Book (New…) and its characters, places, peoples and things live here.</div>'; return; }
    $("wTree").innerHTML = homes().map(d => {
      const mine = cards().filter(c => c.doc === d.id), open = PX.ui.wopen[d.id] !== false, count = t => mine.filter(c => c.type === t).length;
      return '<div class="tdoc' + (n.d === d.id && n.t === "all" ? " on" : "") + '" data-d="' + d.id + '" data-t="all"><span class="chev" data-chev="1">' + (open ? "▾" : "▸") + '</span><span class="ph">' + PHOENIX + '</span><span class="tt">' + U.esc(d.title || "Untitled") + '</span><span class="n">' + mine.length + "</span></div>" +
        (open ? '<div class="tkinds">' + ORDER.map(t => '<div class="tkind' + (n.d === d.id && n.t === t ? " on" : "") + (count(t) ? "" : " zero") + '" data-d="' + d.id + '" data-t="' + t + '"><span class="k wt ' + t + '">' + TYPES[t].plural + '</span><span class="n">' + count(t) + "</span></div>").join("") + "</div>" : "");
    }).join("");
  }
  function renderPane() {
    const n = node(), q = W.tmp.q.trim().toLocaleLowerCase(), head = $("wHead");
    $("wPane").classList.toggle("noworld", !n.d);
    if (!head.dataset.ready) {
      head.dataset.ready = "1";
      head.innerHTML = '<div class="ttl" id="wTtl"></div><div class="sub" id="wSub"></div><span class="grow"></span><input id="wFilter" type="search" placeholder="Filter cards…" autocomplete="off">' +
        ORDER.map(t => '<button class="wnew" data-t="' + t + '">+ ' + TYPES[t].label + "</button>").join("");
      $("wFilter").addEventListener("input", e => { W.tmp.q = e.target.value; renderPane(); });
      head.addEventListener("click", e => { const b = e.target.closest(".wnew"); if (!b) return; const c = newCard(b.dataset.t, "", node().d); PX.save(); W.tmp.node = { d: c.doc, t: c.type }; renderTree(); W.open(c.id); setTimeout(() => $("wcName") && $("wcName").focus(), 30); });
    }
    let list = cards().filter(c => c.doc === n.d && (n.t === "all" || c.type === n.t));
    if (q) list = list.filter(c => (c.name + " " + c.notes + " " + Object.keys(c.f).map(k => show(c, TYPES[c.type].fields.find(f => f.k === k) || { k, kind: "text" })).join(" ")).toLocaleLowerCase().includes(q));
    list = list.slice().sort((a, b) => (a.name || "~").localeCompare(b.name || "~", undefined, { sensitivity: "base" }));
    $("wTtl").innerHTML = PHOENIX + " " + U.esc(docTitle(n.d)) + (n.t === "all" ? "" : ' <span class="k wt ' + n.t + '">' + TYPES[n.t].plural + "</span>"); $("wSub").textContent = list.length + (list.length === 1 ? " card" : " cards");
    $("wCards").innerHTML = list.map(c => {
      const T = TYPES[c.type], bits = T.summary.map(k => show(c, T.fields.find(f => f.k === k))).filter(Boolean);
      const long = T.fields.filter(f => f.kind === "long").map(f => c.f[f.k]).find(Boolean) || c.notes || "";
      return '<div class="wcard ' + c.type + '" data-id="' + c.id + '"><span class="k wt ' + c.type + '">' + T.label + '</span><div class="wname">' + U.esc(c.name || "Unnamed") + "</div>" +
        (bits.length ? '<div class="wsum">' + U.esc(bits.join(" · ")) + "</div>" : "") + (long ? '<div class="wsnip">' + U.esc(long.length > 120 ? long.slice(0, 119).trimEnd() + "…" : long) + "</div>" : "") + "</div>";
    }).join("") || '<div class="none center">' + (cards().some(c => c.doc === n.d) ? "No card matches." : (n.d ? "This book has no world cards yet.<br><br>Use the buttons above to add a character, a location, a race or an item.<br>Fields like <b>Birthplace</b> or <b>Race</b> create and link the other cards for you.<br><br>You can also select a name in a chapter, right-click and choose <b>New world card…</b>." : "Make a Book first, then its world lives here.")) + "</div>";
  }
  W.render = function () { renderTree(); renderPane(); };
  $("wTree").addEventListener("click", e => {
    const r = e.target.closest("[data-d]"); if (!r) return; const id = r.dataset.d;
    if (e.target.closest("[data-chev]")) { PX.ui.wopen[id] = PX.ui.wopen[id] === false; PX.saveUI(); renderTree(); return; }
    if (r.dataset.t === "all") PX.ui.wopen[id] = true;
    W.tmp.node = { d: id, t: r.dataset.t }; PX.saveUI(); W.render(); $("wCards").scrollTop = 0;
  });
  $("wCards").addEventListener("click", e => { const c = e.target.closest(".wcard"); if (c) { W.tmp.stack = []; W.open(c.dataset.id); } });
  $("tabWorld").onclick = () => PX.setView("world");

  /* ---------- one card, as a form ---------- */
  const dlg = $("dlgCard"); let cur = "";
  W.open = function (id, back) {
    if (!byId(id)) return;
    if (!back) W.tmp.stack.push(id);
    cur = id; draw(); if (!dlg.open) dlg.showModal();
  };
  function chip(id, k) {
    return '<span class="lkc"><button type="button" class="lkb" data-a="go" data-id="' + id + '" title="Open this card">' + U.esc(nameOf(id)) + '</button><button type="button" class="lkx" data-a="unlink" data-k="' + k + '" data-id="' + id + '" title="Remove the link">×</button></span>';
  }
  function incoming(id) {                           // which cards point here, and through which field
    const out = [];
    cards().forEach(x => { if (x.id === id) return; TYPES[x.type].fields.forEach(f => { if ((f.kind === "link" || f.kind === "links") && values(x, f).includes(id)) out.push({ card: x, label: f.label }); }); });
    return out;
  }
  function draw() {
    const c = byId(cur), T = TYPES[c.type], inc = incoming(cur);
    let h = '<div class="wc-top">' + (W.tmp.stack.length > 1 ? '<button type="button" data-a="back">‹ Back</button>' : "") + '<span class="k wt ' + c.type + '">' + T.label + '</span><span class="grow"></span><select id="wcDoc" title="The book this card belongs to">' + homes().concat(homes().some(d => d.id === c.doc) || !PX.D.docs[c.doc] ? [] : [PX.D.docs[c.doc]]).map(d => '<option value="' + d.id + '"' + (d.id === c.doc ? " selected" : "") + ">" + PHOENIX + " " + U.esc(d.title || "Untitled") + "</option>").join("") + '</select><button type="button" data-a="close">Close</button></div>' +
      '<input class="wc-name" id="wcName" value="' + U.esc(c.name) + '" placeholder="Name" autocomplete="off" spellcheck="false"><div class="wc-grid">';
    T.fields.forEach(f => {
      const v = c.f[f.k];
      if (f.kind === "long") h += '<label class="wf long"><span>' + f.label + '</span><textarea data-k="' + f.k + '" rows="3">' + U.esc(v || "") + "</textarea></label>";
      else if (f.kind === "text") h += '<label class="wf"><span>' + f.label + '</span><input data-k="' + f.k + '" value="' + U.esc(v || "") + '" placeholder="' + U.esc(f.ph || "") + '" autocomplete="off"' + (f.options ? ' list="wo_' + f.k + '"' : "") + "></label>";
      else {
        const vals = values(c, f), full = f.kind === "link" && vals.length;
        h += '<div class="wf' + (f.kind === "links" ? " wide" : "") + '"><span>' + f.label + '</span><div class="lks">' + vals.map(id => chip(id, f.k)).join("") +
          (full ? "" : '<input class="lkin" data-k="' + f.k + '" data-to="' + f.to + '" list="wl_' + f.to + '" placeholder="' + (f.kind === "links" ? "Add " : "Type a ") + TYPES[f.to].label.toLowerCase() + ' name…" autocomplete="off">') + "</div></div>";
      }
    });
    h += "</div>";
    h += '<div class="wf long"><span>Your own fields</span>' + c.extra.map((x, i) => '<div class="wx"><input class="xl" data-i="' + i + '" value="' + U.esc(x.label) + '" placeholder="Field name"><input class="xv" data-i="' + i + '" value="' + U.esc(x.value) + '" placeholder="Value"><button type="button" data-a="delx" data-i="' + i + '" title="Remove this field">×</button></div>').join("") +
      '<button type="button" data-a="addx" class="addx">+ Add a field</button></div>';
    h += '<label class="wf long"><span>Notes</span><textarea id="wcNotes" rows="4" placeholder="Anything else about this ' + T.label.toLowerCase() + '…">' + U.esc(c.notes) + "</textarea></label>";
    if (inc.length) h += '<div class="wf long"><span>Linked from</span><div class="lks">' + inc.map(x => '<span class="lkc"><button type="button" class="lkb" data-a="go" data-id="' + x.card.id + '">' + U.esc(nameOf(x.card.id)) + '</button><small>' + U.esc(x.label) + "</small></span>").join("") + "</div></div>";
    h += '<div class="wc-foot"><button type="button" class="danger" data-a="del">Delete this card</button></div>';
    ORDER.forEach(t => { h += '<datalist id="wl_' + t + '">' + cards().filter(x => x.type === t && x.id !== cur && x.name && x.doc === c.doc).map(x => '<option value="' + U.esc(x.name) + '">').join("") + "</datalist>"; });
    T.fields.filter(f => f.options).forEach(f => { h += '<datalist id="wo_' + f.k + '">' + f.options.map(o => '<option value="' + o + '">').join("") + "</datalist>"; });
    $("wcBody").innerHTML = h;
  }
  function commitLink(input) {
    const name = input.value.trim(); if (!name) return;
    const c = byId(cur), f = TYPES[c.type].fields.find(x => x.k === input.dataset.k), id = linkTo(f.to, name, c.doc);
    if (id === c.id) { PX.toast("A card cannot link to itself."); input.value = ""; return; }
    if (f.kind === "links") { c.f[f.k] = c.f[f.k] || []; if (!c.f[f.k].includes(id)) c.f[f.k].push(id); } else c.f[f.k] = id;
    touch(c); draw();
    if (f.kind === "links") { const n = $("wcBody").querySelector('.lkin[data-k="' + f.k + '"]'); if (n) n.focus(); }
  }
  const body = $("wcBody");
  body.addEventListener("input", e => {
    const c = byId(cur), t = e.target; if (!c) return;
    if (t.id === "wcName") c.name = t.value;
    else if (t.id === "wcNotes") c.notes = t.value;
    else if (t.classList.contains("xl")) c.extra[+t.dataset.i].label = t.value;
    else if (t.classList.contains("xv")) c.extra[+t.dataset.i].value = t.value;
    else if (t.dataset.k && !t.classList.contains("lkin")) c.f[t.dataset.k] = t.value;
    else return;
    touch(c);
  });
  body.addEventListener("change", e => {
    if (e.target.classList.contains("lkin")) commitLink(e.target);
    else if (e.target.id === "wcDoc") { const c = byId(cur); c.doc = e.target.value; W.tmp.node = { d: c.doc, t: "all" }; touch(c); draw(); }
  });
  body.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList.contains("lkin")) { e.preventDefault(); commitLink(e.target); } });
  body.addEventListener("click", e => {
    const b = e.target.closest("[data-a]"); if (!b) return; const c = byId(cur), a = b.dataset.a;
    if (a === "go") W.open(b.dataset.id);
    else if (a === "back") { W.tmp.stack.pop(); W.open(W.tmp.stack[W.tmp.stack.length - 1], true); }
    else if (a === "close") closeCard();
    else if (a === "unlink") { const f = TYPES[c.type].fields.find(x => x.k === b.dataset.k); if (f.kind === "links") c.f[f.k] = (c.f[f.k] || []).filter(x => x !== b.dataset.id); else delete c.f[f.k]; touch(c); draw(); }
    else if (a === "addx") { c.extra.push({ label: "", value: "" }); touch(c); draw(); const n = body.querySelectorAll(".xl"); if (n.length) n[n.length - 1].focus(); }
    else if (a === "delx") { c.extra.splice(+b.dataset.i, 1); touch(c); draw(); }
    else if (a === "del") {
      if (!confirm("Delete “" + nameOf(c.id) + "”?\n\nLinks to it from other cards are removed too.")) return;
      removeCard(c.id); closeCard();
    }
  });
  function removeCard(id) {
    PX.D.world = cards().filter(x => x.id !== id);
    cards().forEach(x => TYPES[x.type].fields.forEach(f => { if (f.kind === "link" && x.f[f.k] === id) delete x.f[f.k]; else if (f.kind === "links" && x.f[f.k]) x.f[f.k] = x.f[f.k].filter(y => y !== id); }));
    PX.save();
  }
  function finishCard() {                           // runs when the card closes (button, Esc): an empty stub is not kept
    const c = byId(cur);
    if (c && !c.name.trim() && !Object.values(c.f).some(v => (Array.isArray(v) ? v.length : String(v).trim())) && !c.notes.trim() && !c.extra.some(x => x.label.trim() || x.value.trim())) removeCard(c.id);
    W.tmp.stack = []; PX.save(); if (!$("world").hidden) W.render();
  }
  function closeCard() { if (dlg.open) dlg.close(); finishCard(); }
  dlg.addEventListener("close", finishCard);

  /* ---------- from the text: select a name, right-click ---------- */
  let pickName = ""; const pick = $("dlgPick");
  W.fromText = function (raw) {
    const nm = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim(); if (!nm) return;
    const ex = W.find(nm, null, PX.ui.cur);
    if (ex) { PX.setView("world"); W.tmp.node = { d: ex.doc, t: "all" }; W.tmp.stack = []; W.render(); W.open(ex.id); return; }
    pickName = nm; $("pkName").textContent = "“" + nm + "” is not in your world yet. What is it?";
    $("pkTypes").innerHTML = ORDER.map(t => '<button type="button" class="primary" data-t="' + t + '">' + TYPES[t].label + "</button>").join("");
    pick.showModal();
  };
  $("pkTypes").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; pick.close();
    const c = newCard(b.dataset.t, pickName, homeOf(PX.ui.cur)); PX.save(); PX.setView("world"); W.tmp.node = { d: c.doc, t: c.type }; W.tmp.stack = []; W.render(); W.open(c.id);
  });

  /* the whole data replaced (backup restored, another device): redraw */
  const render1 = PX.render;
  PX.render = function () { render1(); if (!$("world").hidden) W.render(); };
})(window.PX);
