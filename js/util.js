/* Phoenix — small helpers. Plain JS, no build step. */
window.PX = window.PX || {};
(function (PX) {
  const U = (PX.U = {});
  U.uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  U.today = () => new Date().toISOString().slice(0, 10);
  U.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.mm2px = mm => mm * 96 / 25.4;
  U.pt2px = pt => pt * 96 / 72;
  U.px2pt = px => px * 72 / 96;
  U.safeName = s => String(s || "document").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 60) || "document";
  U.words = text => (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  U.ago = ts => {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    const h = Math.round(m / 60); if (h < 24) return h + " h ago";
    const d = Math.round(h / 24); if (d < 14) return d + " d ago";
    return new Date(ts).toLocaleDateString();
  };
})(window.PX);
