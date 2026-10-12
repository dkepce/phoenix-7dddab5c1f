const CACHE = "phoenix-v1";
const SHELL = ["./", "./index.html", "./style.css", "./manifest.webmanifest",
  "./js/util.js", "./js/store.js", "./js/turkish.js", "./data/tr-words.txt", "./js/editor.js", "./js/app.js", "./js/study.js", "./js/vocab.js", "./js/world.js", "./js/grammar.js", "./js/init.js",
  "./icons/logo-bar.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then(res => {   // always re-check with the server so updates show right away
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});
