/* Phoenix — start-up. */
(function (PX) {
  PX.start();
  PX.syncHL();
  PX.setView(PX.ui.view === "study" || PX.ui.view === "world" ? PX.ui.view : "write");
  PX.initFile();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
})(window.PX);
