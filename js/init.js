/* Phoenix — start-up. */
(function (PX) {
  PX.start();
  PX.initFile();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
})(window.PX);
