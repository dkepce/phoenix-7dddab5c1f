/* Phoenix — Turkish letters for people without them on the keyboard.
   Typed "yarin cocuk kilic" -> "yarın çocuk kılıç". Needs data/tr-words.txt (see data/NOTICE.txt, CC-BY-SA-4.0).
   1. Words in the list: pick the form with the most uses (but keep the typed form when it is clearly the more common one).
   2. Words not in the list: a character 4-gram model trained on the list chooses the most Turkish-looking spelling, only when clearly better.
   Measured on held-out words: about 99 % right for known words, about 80 % of unknown words fixed while about 96 % of plain unknown words stay untouched. */
(function (PX) {
  const T = (PX.tr = { ready: false, lmReady: false, loading: null });
  const FOLD = { "ç": "c", "ğ": "g", "ı": "i", "ş": "s" }, AMB = { c: "cç", g: "gğ", i: "iı", s: "sş" };
  const ORDER = 4, LAMBDA = [0.05, 0.15, 0.3, 0.5], SMOOTH = 0.01, V = 40;
  const R = 2.0, M = 1.5;                         // known words: candidate must be R times more common than the typed form; unknown words: model must prefer it by M (log units)
  let index = new Map(), cnt = [], ctx = [];
  const fold = w => w.replace(/[çğış]/g, ch => FOLD[ch]);

  T.ensure = function () {
    if (T.ready) return Promise.resolve(true);
    if (T.loading) return T.loading;
    T.loading = fetch("data/tr-words.txt").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then(txt => {
      const words = [];
      txt.split("\n").forEach(line => { const i = line.indexOf("\t"); if (i > 0) words.push([line.slice(0, i), +line.slice(i + 1)]); });
      words.forEach(([w, c]) => { const k = fold(w); let a = index.get(k); if (!a) index.set(k, (a = [])); a.push([c, w]); });
      index.forEach(a => a.sort((x, y) => y[0] - x[0]));
      T.ready = true;                              // the dictionary part works now; the model is built in small steps in the background
      for (let k = 0; k < ORDER; k++) { cnt.push(new Map()); ctx.push(new Map()); }
      let pos = 0;
      (function step() {
        const end = Math.min(words.length, pos + 4000);
        for (; pos < end; pos++) {
          const wt = Math.sqrt(words[pos][1]), s = "^^^" + words[pos][0] + "$";
          for (let i = ORDER - 1; i < s.length; i++) for (let k = 0; k < ORDER; k++) {
            const c = s.slice(i - k, i), key = c + s[i];
            cnt[k].set(key, (cnt[k].get(key) || 0) + wt); ctx[k].set(c, (ctx[k].get(c) || 0) + wt);
          }
        }
        if (pos < words.length) setTimeout(step, 0); else T.lmReady = true;
      })();
      return true;
    }).catch(e => { T.loading = null; return false; });
    return T.loading;
  };

  function logp(w) {
    const s = "^^^" + w + "$"; let lp = 0;
    for (let i = ORDER - 1; i < s.length; i++) {
      let p = 0;
      for (let k = 0; k < ORDER; k++) {
        const c = s.slice(i - k, i), d = ctx[k].get(c) || 0;
        p += LAMBDA[k] * (((cnt[k].get(c + s[i]) || 0) + SMOOTH) / (d + SMOOTH * V));
      }
      lp += Math.log(p);
    }
    return lp;
  }
  function fixLower(t) {                          // t: lower-case, c/g/i/s as typed
    const cands = index.get(t);
    if (cands) {
      const [bc, best] = cands[0];
      if (best === t) return t;
      const exact = (cands.find(x => x[1] === t) || [0])[0];
      return bc >= R * Math.max(exact, 1) ? best : t;
    }
    if (!T.lmReady || t.length < 3) return t;
    let n = 0; for (const ch of t) if (AMB[ch]) n++;
    if (!n || n > 10) return t;
    let vs = [""]; for (const ch of t) { const o = AMB[ch] || ch, next = []; for (const v of vs) for (const x of o) next.push(v + x); vs = next; }
    let best = t, bs = logp(t); const ts = bs;
    for (const v of vs) { if (v === t) continue; const sc = logp(v); if (sc > bs) { bs = sc; best = v; } }
    return best !== t && bs - ts > M ? best : t;
  }
  const upper = ch => (ch === "i" ? "İ" : ch === "ı" ? "I" : ch.toUpperCase());
  T.fixWord = function (word) {                   // keeps capital letters; apostrophes (Ankara'nın) are looked at together with the stem
    if (!T.ready || !word || /[çğışÇĞİŞ0-9]/.test(word)) return word;
    if (PX.S.trKeep && PX.S.trKeep[word.toLowerCase()]) return word;
    const apos = [], plain = word.replace(/['’]/g, (m, i) => { apos.push([i, m]); return ""; });     // i = position in the original word
    if (plain.length < 2 || !/^[A-Za-zöüÖÜâîûÂÎÛ]+$/.test(plain)) return word;
    const typed = plain.replace(/[A-ZÖÜÂÎÛ]/g, ch => ch.toLowerCase()), f = fixLower(typed);
    if (f === typed && !/^I[a-zöüâîû]/.test(plain)) return word;       // a capitalised word starting with I is "İ..." in Turkish (İzmir, İlk), unless the model says ı (Isık)
    let out = ""; for (let i = 0; i < plain.length; i++) out += plain[i] !== plain[i].toLowerCase() ? upper(f[i]) : f[i];
    apos.forEach(([i, m]) => { out = out.slice(0, i) + m + out.slice(i); });
    return out;
  };
})(window.PX);
