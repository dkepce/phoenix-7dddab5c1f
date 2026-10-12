/* Phoenix — start-up. */
(function (PX) {
  PX.start();
  PX.syncHL();
  PX.setView(/^(study|world|read)$/.test(PX.ui.view) ? PX.ui.view : "write");
  PX.initFile();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
})(window.PX);
