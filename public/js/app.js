import * as S from "./shared.js";
import { t, getLang, setLang, countryOf, applyStatic } from "./i18n.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => new Intl.NumberFormat(getLang() === "fr" ? "fr-FR" : "en-US").format(Math.round(n));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};
const MODES = ["map", "hilo", "daily"];
const PIN_GUESS = "#ee813c", PIN_TRUTH = "#76b861";

let dams = [], map = null;
let countries = [];                                  // liste des pays jouables (countries.json)
const poolCache = new Map();                         // ISO -> barrages du pays (chargés à la demande)
let ctx = { scope: "world", pool: [], info: S.WORLD, name: "", bounds: null };   // zone de jeu courante
const bboxOf = (pool) => L.latLngBounds(pool.map((d) => [d.la, d.lo]));
const inWorld = () => ctx.scope === "world";
const placeOf = (d) => (inWorld() ? countryOf(d) : d.s || d.ci || countryOf(d));
const norm = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cname = (c) => (getLang() === "fr" ? c.fr : c.en);
function setWorld() { ctx = { scope: "world", pool: dams, info: S.WORLD, name: t("scope.world"), bounds: null }; }
async function setCountry(iso) {
  const c = countries.find((x) => x.iso === iso); if (!c) throw new Error("scope");
  if (!poolCache.has(iso)) {
    const r = await fetch(`/data/country/${iso}.json`); if (!r.ok) throw new Error("scope");
    poolCache.set(iso, await r.json());
  }
  const pool = poolCache.get(iso);
  ctx = { scope: iso, pool, info: S.poolInfo(pool, iso), name: cname(c), bounds: bboxOf(pool), iso };
}
function resetView() { if (ctx.bounds) map.fitBounds(ctx.bounds.pad(0.1), { maxZoom: 9 }); else map.setView([25, 10], 2); }

async function api(path, body) {
  let r;
  try { r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); }
  catch { throw new Error(t("err.net")); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const k = "err." + j.error; throw new Error(t(k) !== k ? t(k) : t("err.server")); }
  return j;
}

function destroyMap() { if (map) { map.remove(); map = null; } }
function makeMap(onClick) {
  destroyMap();
  map = L.map("map", { worldCopyJump: true, minZoom: 2, maxBounds: [[-85, -540], [85, 540]] });
  resetView();
  const muet = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 12, maxNativeZoom: 8, attribution: "© Esri" }).addTo(map);
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 14, attribution: "© Esri" });
  L.control.layers({ [t("layer.mute")]: muet, [t("layer.sat")]: sat }, null, { position: "topright" }).addTo(map);
  map.on("click", (e) => onClick(e.latlng.lat, S.wrapLng(e.latlng.lng)));
  return map;
}
const pin = (lat, lng, color) =>
  L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<div class="dam-pin" style="background:${color}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }) });

const uses = (d) => (d.p || []).map((c) => t("use." + c));
const typeLabel = (d) => (d.t ? t("ty." + d.t) : null);
const contLabel = (d) => t("ct." + d.ct) !== "ct." + d.ct ? t("ct." + d.ct) : d.ct;

function clueCard(d) {
  const rows = [
    inWorld() ? [t("clue.continent"), contLabel(d)] : [t("clue.province"), d.s], [t("clue.river"), d.r], [t("clue.height"), d.h != null && `${d.h} m`], [t("clue.year"), d.y],
    [t("clue.type"), typeLabel(d)], [t("clue.use"), uses(d).join(", ")], [t("clue.volume"), d.v != null && `${fmt(d.v)} hm³`], [t("clue.power"), d.mw > 0 && `${fmt(d.mw)} MW`],
  ].filter((r) => r[1]);
  return `<div class="panel clue"><h2>${esc(d.n)}</h2><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
}

// ---------------- en-tête : langue, installation, retour ----------------
function setNav({ home = false, lang = false }) {
  $("#btn-home").hidden = !home;
  $("#lang").hidden = !lang;
  $("#lang").querySelectorAll("[data-l]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === getLang()));
  updateInstallBtn();
}
let installEvt = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function updateInstallBtn() { $("#btn-install").hidden = standalone() || !(installEvt || isIOS) || !$("#btn-home").hidden; }
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; updateInstallBtn(); });
window.addEventListener("appinstalled", () => { installEvt = null; updateInstallBtn(); });
$("#btn-install").addEventListener("click", async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; updateInstallBtn(); }
  else if (isIOS) alert(t("install.ios"));
});
$("#lang").addEventListener("click", (e) => {
  const l = e.target.dataset?.l; if (!l || l === getLang()) return;
  setLang(l); applyStatic(); setLogo(); home();
});
const setLogo = () => { $("#logo").innerHTML = getLang() === "fr" ? "Géo<b>Dam</b>" : "Geo<b>Dam</b>"; };

// ---------------- accueil + classement ----------------
function home() {
  destroyMap(); setNav({ lang: true });
  if (inWorld()) setWorld(); else ctx.name = cname(countries.find((c) => c.iso === ctx.iso));
  const icons = { map: "🗺️", hilo: "⚖️", daily: "📅" };
  const list = [...countries].sort((a, b) => cname(a).localeCompare(cname(b), getLang()));
  app.innerHTML = `
    <h1>${inWorld() ? t("home.h1") : t("scope.h1", { c: esc(ctx.name) })}</h1>
    <p class="lead">${inWorld() ? t("home.lead") : t("scope.lead", { c: esc(ctx.name) })}</p>
    <div class="panel scope">
      <label for="cinput"><b>${t("scope.title")}</b> : ${inWorld() ? t("scope.world") : esc(ctx.name)} <span class="muted">(${t("scope.count", { n: fmt(ctx.pool.length) })})</span></label>
      <form class="row" id="cform" autocomplete="off">
        <input type="text" id="cinput" list="clist" placeholder="${esc(t("scope.search"))}" aria-label="${esc(t("scope.search"))}" autocapitalize="none" spellcheck="false">
        <datalist id="clist">${list.map((c) => `<option value="${esc(cname(c))}">${fmt(c.n)}</option>`).join("")}</datalist>
        <button>${t("scope.ok")}</button>${inWorld() ? "" : `<button type="button" class="ghost" id="cworld">${t("scope.back")}</button>`}
      </form>
      <p class="muted" id="chint" style="margin:6px 0 0;font-size:.85rem">${t("scope.hint")}</p>
    </div>
    <div class="cards">${MODES.map((m) => `<div class="card"><h3>${icons[m]} ${t("mode." + m)}</h3><p>${t("mode." + m + ".d")}</p><button data-mode="${m}">${t("play")}</button></div>`).join("")}</div>
    <h2>${inWorld() ? t("lb.title") : t("lb.for", { c: esc(ctx.name) })}</h2>
    <div class="tabs" role="tablist">${MODES.map((m, i) => `<button class="tab" role="tab" data-lb="${m}" aria-selected="${i === 0}">${t("mode." + m)}</button>`).join("")}</div>
    <div class="panel" id="lb">${t("lb.loading")}</div>`;
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => start(b.dataset.mode)));
  app.querySelectorAll("[data-lb]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-lb]").forEach((x) => x.setAttribute("aria-selected", x === b));
    showLeaderboard(b.dataset.lb, $("#lb"));
  }));
  // choix du pays : liste déroulante native + recherche au clavier (accents et casse ignorés, FR ou EN)
  const pick = async () => {
    const q = norm($("#cinput").value); if (!q) return;
    const hit = countries.find((c) => norm(c.fr) === q || norm(c.en) === q || norm(c.iso) === q)
      || (() => { const m = countries.filter((c) => norm(c.fr).startsWith(q) || norm(c.en).startsWith(q)); return m.length === 1 ? m[0] : null; })();
    if (!hit) { $("#chint").className = "err"; $("#chint").textContent = t("scope.err"); return; }
    $("#chint").textContent = t("scope.loading");
    try { await setCountry(hit.iso); home(); } catch { $("#chint").className = "err"; $("#chint").textContent = t("scope.err"); }
  };
  $("#cform").addEventListener("submit", (e) => { e.preventDefault(); pick(); });
  $("#cinput").addEventListener("input", (e) => { if (!e.inputType || e.inputType === "insertReplacementText") pick(); }); // sélection dans la liste
  $("#cworld")?.addEventListener("click", () => { setWorld(); home(); });
  showLeaderboard("map", $("#lb"));
}

async function showLeaderboard(mode, el, highlight) {
  el.textContent = t("lb.loading");
  try {
    const { entries, period } = await api(`/api/leaderboard?mode=${mode}&scope=${ctx.scope}`);
    el.innerHTML = (mode === "daily" ? `<p class="muted">${t("lb.day", { d: esc(period) })}</p>` : "") +
      (entries.length ? `<div class="table-wrap"><table class="lb"><thead><tr><th>#</th><th>${t("lb.player")}</th><th class="num">${t("lb.score")}</th></tr></thead><tbody>${entries.map((e, i) =>
        `<tr${highlight === e.name ? ' class="me"' : ""}><td>${i + 1}</td><td>${esc(e.name)}</td><td class="num">${fmt(e.score)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">${t("lb.empty")}</p>`);
  } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------------- fin de partie : score + pseudo ----------------
async function finishGame(mode, token, payload, summaryHtml, shareText) {
  const box = document.createElement("div");
  box.className = "panel result"; box.style.marginTop = "12px"; box.textContent = t("end.calc");
  $("#end").replaceChildren(box);
  let res;
  try { res = await api("/api/finish", { token, ...payload }); }
  catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  box.innerHTML = `${summaryHtml}<p>${t("end.valid", { s: fmt(res.score), r: res.rank })}</p>`;
  if (shareText) box.insertAdjacentHTML("beforeend", `<div class="row"><button class="ghost" id="share">${t("end.copy")}</button></div>`);
  $("#share")?.addEventListener("click", async (ev) => { try { await navigator.clipboard.writeText(shareText(res)); ev.target.textContent = t("end.copied"); } catch { ev.target.textContent = shareText(res); } });
  if (res.qualifies) {
    box.insertAdjacentHTML("beforeend", `<h3 style="margin-top:14px">${t("end.in")}</h3>
      <div class="notice">${t("end.ipnotice")}</div>
      <form class="row" id="nameform"><input type="text" id="pseudo" maxlength="16" minlength="2" placeholder="${esc(t("end.pseudo"))}" aria-label="${esc(t("end.pseudo"))}" autocomplete="nickname" required value="${esc(store.get("geodam-name") || "")}"><button class="accent">${t("end.save")}</button></form>
      <p class="err" id="nerr"></p>`);
    $("#nameform").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = $("#pseudo").value.trim();
      try {
        await api("/api/submit", { claim: res.claim, name });
        store.set("geodam-name", name);
        $("#nameform").remove(); $("#nerr").remove(); box.querySelector(".notice")?.remove();
        const lb = document.createElement("div"); lb.style.marginTop = "12px";
        box.append(lb); showLeaderboard(mode, lb, name);
      } catch (e) { $("#nerr").textContent = e.message; }
    });
  } else {
    box.insertAdjacentHTML("beforeend", `<p class="muted">${res.score > 0 ? t("end.out") : t("end.zero")}</p>`);
  }
  box.insertAdjacentHTML("beforeend", `<div class="row"><button id="again">${t("end.again")}</button><button class="ghost" id="tohome">${t("end.home")}</button></div>`);
  $("#again").addEventListener("click", () => start(mode)); $("#tohome").addEventListener("click", home);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function start(mode) {
  setNav({ home: true });
  app.innerHTML = `<p class="muted">${t("prep")}</p>`;
  try {
    const sess = await api("/api/session", { mode, scope: ctx.scope });
    ({ map: playMap, hilo: playHilo, daily: playDaily })[mode](sess);
  } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------------- Mode 1 : carte muette ----------------
function playMap({ token, seed }) {
  const { pool, info } = ctx, idx = S.pickMapRounds(pool, seed, info.distinct), guesses = [];
  let round = 0, total = 0, guess = null, layers = [], locked = false;
  app.innerHTML = `<div class="hud"><span id="rd"></span><span id="sc"></span></div>
    <div class="game"><div id="side"></div><div><div id="map"></div><div class="row actions"><button id="ok" disabled>${t("map.validate")}</button><button id="next" class="accent" hidden></button></div></div></div><div id="end"></div>`;
  makeMap((lat, lng) => {
    if (locked) return;
    guess = [lat, lng]; layers.forEach((l) => l.remove()); layers = [pin(lat, lng, PIN_GUESS).addTo(map)]; $("#ok").disabled = false;
  });
  const render = () => {
    const d = pool[idx[round]]; guess = null; locked = false;
    layers.forEach((l) => l.remove()); layers = []; resetView();
    $("#rd").textContent = t("map.round", { n: round + 1, t: S.MAP_ROUNDS }); $("#sc").textContent = t("map.score", { s: fmt(total) });
    $("#side").innerHTML = clueCard(d) + `<p class="muted" style="margin:8px 0 0">${t("map.hint")}</p>`;
    $("#ok").hidden = false; $("#ok").disabled = true; $("#next").hidden = true;
  };
  $("#ok").addEventListener("click", () => {
    const d = pool[idx[round]], km = S.distanceKm(guess[0], guess[1], d.la, d.lo), pts = S.mapPoints(km, info.scale);
    guesses.push(guess); total += pts; locked = true; $("#ok").hidden = true;
    layers.push(pin(d.la, d.lo, PIN_TRUTH).addTo(map), L.polyline([guess, [d.la, d.lo]], { color: "#111a4c", dashArray: "6 6", weight: 2 }).addTo(map));
    map.fitBounds(L.latLngBounds([guess, [d.la, d.lo]]).pad(0.5), { maxZoom: 7 });
    $("#side").insertAdjacentHTML("beforeend", `<div class="panel result" style="margin-top:12px"><b>${esc(placeOf(d))}</b><br>${t("map.dist", { km: fmt(km) })} → <span class="pts">+${fmt(pts)}</span></div>`);
    $("#sc").textContent = t("map.score", { s: fmt(total) });
    $("#next").hidden = false; $("#next").textContent = round === S.MAP_ROUNDS - 1 ? t("map.last") : t("map.next");
  });
  $("#next").addEventListener("click", () => {
    round++;
    if (round < S.MAP_ROUNDS) return render();
    $("#next").hidden = true;
    finishGame("map", token, { guesses }, `<h2>${t("map.over")}</h2><p>${t("map.total", { s: fmt(total) })}</p>`);
  });
  render();
}

// ---------------- Mode 2 : plus haut / plus bas ----------------
function playHilo({ token, seed }) {
  const pool = ctx.pool, steps = S.hiloSequence(pool, seed, S.HILO_CAP + 1), answers = [];
  let i = 0, locked = false;
  const val = (d, k) => (k === "y" ? d[k] : fmt(d[k]));
  app.innerHTML = `<div class="hud"><span id="streak"></span><span class="muted">${t("hilo.rule")}</span></div><div id="stage"></div><div id="end"></div>`;
  const render = () => {
    const { k, a, b } = steps[i], A = pool[a], B = pool[b]; locked = false;
    $("#streak").textContent = t("hilo.streak", { n: i });
    $("#stage").innerHTML = `<p class="stat-q">${t("hilo.q", { stat: t("stat." + k) })}</p>
      <div class="versus"><div class="panel vs-card"><h3>${esc(A.n)}</h3><p class="muted">${esc(placeOf(A))}</p><div class="big">${esc(val(A, k))}</div></div>
      <div class="panel vs-card"><h3>${esc(B.n)}</h3><p class="muted">${esc(placeOf(B))}</p><div class="big" id="bval">?</div></div></div>
      <div class="row actions" style="justify-content:center"><button data-g="h">${t("hilo.hi")}</button><button data-g="l">${t("hilo.lo")}</button></div>`;
    $("#stage").querySelectorAll("[data-g]").forEach((btn) => btn.addEventListener("click", () => answer(btn.dataset.g)));
  };
  const answer = (g) => {
    if (locked) return; locked = true; answers.push(g);
    const { k, a, b } = steps[i], ok = S.hiloCorrect(pool[a][k], pool[b][k], g);
    $("#bval").textContent = val(pool[b], k); $("#bval").style.color = ok ? "var(--green-ink)" : "var(--accent)";
    $("#stage").querySelectorAll("button").forEach((x) => (x.disabled = true));
    setTimeout(() => {
      if (ok && ++i < S.HILO_CAP) return render();
      $("#stage").querySelector(".actions").remove();
      finishGame("hilo", token, { answers }, `<h2>${ok ? t("hilo.perfect") : t("hilo.fail")}</h2><p>${t("hilo.count", { n: i })}</p>`);
    }, 1100);
  };
  render();
}

// ---------------- Mode 3 : barrage du jour ----------------
function playDaily({ token, seed }) {
  const { pool, info, scope } = ctx, key = `geodam-daily-${scope}-${seed}`, target = pool[S.dailyIndex(pool, seed)];
  if (store.get(key)) {
    const past = JSON.parse(store.get(key));
    app.innerHTML = `<div class="panel"><h2>${t("daily.played")}</h2><p>${t("daily.playedtxt", { d: esc(seed), n: esc(target.n), c: esc(countryOf(target)) })} ${past.found ? t("daily.res", { n: past.tries, s: fmt(past.score) }) : t("daily.nores")}</p><p class="muted">${t("daily.again")}</p><div id="lb"></div></div>`;
    showLeaderboard("daily", $("#lb")); return;
  }
  const guesses = [], ch = [];
  let cur = null;
  const clues = [
    (d) => [inWorld() ? contLabel(d) : d.s, d.h != null && t("clue.hhigh", { h: d.h })].filter(Boolean).join(" · "),
    (d) => [d.y && t("clue.d1", { y: d.y }), d.t && t("clue.d2", { t: typeLabel(d) })].filter(Boolean).join(" · "),
    (d) => [uses(d).join(", "), d.v != null && `${fmt(d.v)} hm³`, d.mw > 0 && `${fmt(d.mw)} MW`].filter(Boolean).join(" · "),
    (d) => d.r && t("clue.d3", { r: d.r }),
    (d) => (inWorld() ? t("clue.d4", { c: countryOf(d) }) : d.s ? t("clue.d4p", { s: d.s }) : d.ci && t("clue.d4c", { c: d.ci })),
    (d) => t("clue.d5", { i: `${d.n[0]}${"·".repeat(Math.max(0, d.n.length - 1))}` }) + (d.ci ? t("clue.d6", { c: d.ci }) : ""),
  ];
  app.innerHTML = `<div class="hud"><span>${t("daily.title", { d: esc(seed) })}${inWorld() ? "" : " — " + esc(ctx.name)}</span><span id="tries"></span></div>
    <div class="game"><div><div class="panel"><h3>${t("daily.clues")}</h3><ol id="clues" style="padding-left:20px;margin:0"></ol></div>
    <div class="panel" style="margin-top:12px"><h3>${t("daily.attempts")}</h3><ul class="attempts" id="att"></ul></div></div>
    <div><div id="map"></div><div class="row actions"><button id="ok" disabled>${t("daily.ok")}</button></div></div></div><div id="end"></div>`;
  let guess = null, over = false;
  const showClues = () => {
    $("#clues").innerHTML = clues.slice(0, guesses.length + 1).map((f) => `<li>${esc(f(target) || "—")}</li>`).join("");
    $("#tries").textContent = t("daily.try", { n: Math.min(guesses.length + 1, S.DAILY_TRIES), t: S.DAILY_TRIES });
  };
  makeMap((lat, lng) => {
    if (over) return; guess = [lat, lng];
    if (cur) cur.remove(); cur = pin(lat, lng, PIN_GUESS).addTo(map); $("#ok").disabled = false;
  });
  $("#ok").addEventListener("click", () => {
    const km = S.distanceKm(guess[0], guess[1], target.la, target.lo), found = km <= info.foundKm;
    guesses.push(guess); ch.push(found ? "🟩" : km < 500 ? "🟧" : "🟥");
    const arrow = found ? "🎯" : S.arrowFor(S.bearingDeg(guess[0], guess[1], target.la, target.lo));
    $("#att").insertAdjacentHTML("beforeend", `<li>${guesses.length}. ${arrow} ${found ? t("daily.found") : `${fmt(km)} km`}</li>`);
    cur = null; $("#ok").disabled = true; guess = null;
    if (found || guesses.length === S.DAILY_TRIES) {
      over = true; $("#ok").hidden = true; showClues();
      pin(target.la, target.lo, PIN_TRUTH).addTo(map); map.setView([target.la, target.lo], inWorld() ? 5 : 8);
      store.set(key, JSON.stringify(S.dailyScore(pool, seed, guesses, info)));
      finishGame("daily", token, { guesses },
        `<h2>${found ? t("daily.win") : t("daily.lose")}</h2><p>${t("daily.was", { n: esc(target.n), c: esc(countryOf(target)) })}</p>`,
        () => `GéoDam ${seed} ${found ? guesses.length : "X"}/${S.DAILY_TRIES}\n${ch.join("")}`);
    } else showClues();
  });
  showClues();
}

// ---------------- démarrage ----------------
$("#btn-home").addEventListener("click", home);
$("#logo").addEventListener("click", (e) => { e.preventDefault(); home(); });
applyStatic(); setLogo();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
Promise.all([fetch("/data/dams.json").then((r) => r.json()), fetch("/data/countries.json").then((r) => r.json())])
  .then(([d, c]) => { dams = d; countries = c; setWorld(); home(); })
  .catch(() => { app.innerHTML = `<p class="err">${t("data.err")}</p>`; });
