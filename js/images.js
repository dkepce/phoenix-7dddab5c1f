/* Phoenix — pictures in documents: the toolbar button, paste / drag & drop, shrinking on import, and the small bar that
   appears when a picture is clicked (Full page / Wide / Small, caption, remove). Files live in the PhoenixFiles folder (see PX.img in store.js). */
(function (PX) {
  const E = PX.ed, $ = id => document.getElementById(id), I = (PX.images = {});
  const MAX = 2000;                                  // longest side in pixels; bigger pictures are shrunk (and saved as webp)

  async function prepare(file) {
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { return null; }
    const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, MAX / Math.max(w0, h0));
    let blob = file, w = w0, h = h0, name = file.name || "picture-" + Date.now() + ".png";
    const keep = /gif$/.test(file.type) || (k === 1 && file.size < 1500000 && /^image\/(png|jpe?g|webp)$/.test(file.type));
    if (!keep) {
      w = Math.round(w0 * k); h = Math.round(h0 * k);
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      const b = await new Promise(res => c.toBlob(res, "image/webp", 0.9));
      if (b && b.type === "image/webp") { blob = b; name = name.replace(/\.[^.]*$/, "") + ".webp"; }
    }
    if (bmp.close) bmp.close();
    return { blob, name, w, h };
  }

  I.addFiles = async function (files) {
    const d = PX.cur();
    if (PX.ui.view !== "write" || !d || d.type === "book") { PX.toast("Open a chapter or a document in Write, then add the picture."); return; }
    let last = null;
    for (const f of Array.from(files)) {
      const p = await prepare(f); if (!p) { PX.toast("“" + (f.name || "That file") + "” could not be read as a picture."); continue; }
      const rec = await PX.img.add(p.blob, p.name, p.w, p.h); if (!rec) continue;
      last = E.insertFigure(rec, p.h / p.w > 1.15 ? "plate" : "wide");               // tall pictures start as a full page, others as wide
    }
    if (last) { setTimeout(() => select(last), 120); if (!PX.file.dir) PX.toast("Picture added. It is kept in this browser until you choose a save folder; then it moves into the PhoenixFiles folder."); }
  };
  const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.hidden = true; document.body.appendChild(input);
  input.addEventListener("change", () => { const f = Array.from(input.files); input.value = ""; if (f.length) I.addFiles(f); });
  I.pick = () => input.click();

  /* ----- the bar for the selected picture ----- */
  const bar = document.createElement("div"); bar.id = "imgBar"; bar.hidden = true;
  bar.innerHTML = '<div class="ib-row"><button type="button" data-s="plate" title="The picture gets a page of its own">Full page</button><button type="button" data-s="wide" title="As wide as the text">Wide</button><button type="button" data-s="small" title="Small, centred">Small</button></div>' +
    '<input id="ibCap" placeholder="Caption (optional)" autocomplete="off"><button type="button" data-a="del" class="danger" title="Remove this picture from the text (Delete key)">Remove</button>';
  const sel = document.createElement("div"); sel.id = "imgSel"; sel.hidden = true;
  document.body.appendChild(bar); document.body.appendChild(sel);
  let cur = null;
  const sizeOf = f => /plate/.test(f.className) ? "plate" : /small/.test(f.className) ? "small" : "wide";
  function hide() { cur = null; bar.hidden = true; sel.hidden = true; }
  function place() {
    if (!cur || !cur.isConnected || $("work").hidden) { hide(); return; }
    const r = cur.getBoundingClientRect(), st = $("stage").getBoundingClientRect();
    if (r.bottom < st.top + 10 || r.top > st.bottom - 10) { bar.hidden = true; sel.hidden = true; return; }
    bar.hidden = false; sel.hidden = false;
    sel.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
    const w = bar.offsetWidth, h = bar.offsetHeight;
    bar.style.left = Math.max(st.left + 6, Math.min(r.left + r.width / 2 - w / 2, st.right - w - 6)) + "px";
    bar.style.top = Math.max(st.top + 6, Math.min(r.top + 10, st.bottom - h - 6)) + "px";
  }
  function select(f) {
    if (!f || !f.isConnected) return; cur = f;
    [...bar.querySelectorAll("[data-s]")].forEach(b => b.classList.toggle("on", b.dataset.s === sizeOf(f)));
    $("ibCap").value = (f.querySelector("figcaption") || {}).textContent || ""; place();
  }
  $("editor").addEventListener("click", e => { const f = e.target.closest && e.target.closest("figure.fig"); if (f) select(f); else hide(); });
  $("editor").addEventListener("keydown", e => {
    if (cur && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); remove(); }
    else if (cur && !e.ctrlKey && !e.metaKey && e.key.length === 1) hide();
  });
  function remove() {
    if (!cur) return; const ed = $("editor"); cur.remove(); hide();
    if (!ed.querySelector(":scope > :not(.pgap)")) ed.innerHTML = "<p><br></p>";
    E.touch();
  }
  bar.addEventListener("mousedown", e => { if (e.target.tagName !== "INPUT") e.preventDefault(); });
  bar.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !cur) return;
    if (b.dataset.a === "del") { remove(); return; }
    cur.className = "fig " + b.dataset.s; [...bar.querySelectorAll("[data-s]")].forEach(x => x.classList.toggle("on", x === b));
    E.touch(); setTimeout(place, 120);
  });
  let capT = 0;
  $("ibCap").addEventListener("input", () => {
    if (!cur) return; const v = $("ibCap").value; let c = cur.querySelector("figcaption");
    if (v && !c) { c = document.createElement("figcaption"); cur.appendChild(c); } if (c) { if (v) c.textContent = v; else c.remove(); }
    const im = cur.querySelector("img"); if (im) im.alt = v;
    clearTimeout(capT); capT = setTimeout(() => { E.touch(); setTimeout(place, 120); }, 250);
  });
  $("ibCap").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); E.focus(); } e.stopPropagation(); });
  $("stage").addEventListener("scroll", place); window.addEventListener("resize", place);
  $("tabs").addEventListener("click", hide);                                   // the bar belongs to the Write tab
  const prevChange = E.onChange; E.onChange = function () { if (prevChange) prevChange(); if (cur) place(); };
  E.onLoad = hide;
  document.addEventListener("mousedown", e => { if (cur && !e.target.closest("#imgBar") && !e.target.closest("figure.fig")) hide(); }, true);

  /* when pictures become available (folder connected, file read) the open page and the Read tab pick them up */
  PX.img.onWarm = function () { E.hydrate(); if (PX.ui.view === "read" && PX.read) PX.read.render(); };
})(window.PX);
