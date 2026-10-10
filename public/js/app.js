import {tr,savedGame,saveGame,clearGame,announce,coordinateControl,decorateGame,homeExtras,installHelp,setupConnectivity,setupUpdates} from "./experience.js";
import * as S from "./shared.js";
import { t, getLang, setLang, countryOf, applyStatic } from "./i18n.js";
import { api, DEMO, setResolver } from "./api.js";
import * as P from "./profile.js";
import { confetti, countUp, toast, esc, fmt, flag } from "./ui.js";
import { uses, typeLabel, contLabel, factsHtml, openSheet, renderRegister, renderGlossary, renderAbout, missionProgress } from "./pages.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};
const MODES = ["map", "daily", "mission"];
const ICON = { map: "🗺️", daily: "📅", mission: "🛰️" };
const DIFF_ICON = { easy: "🟢", medium: "🟡", hard: "🔴" };
const XPMUL = { easy: 1, medium: 1.5, hard: 2 };       // les niveaux difficiles rapportent plus d'XP
const CONT_LABEL = { EUROPE: ["Europe", "Europe"], ASIA: ["Asie", "Asia"], AFRICA: ["Afrique", "Africa"], NAMERICA: ["Amérique du Nord", "North America"], SAMERICA: ["Amérique du Sud", "South America"], OCEANIA: ["Océanie", "Oceania"] };
const PIN_GUESS = "#ee813c", PIN_TRUTH = "#76b861";

let dams = [], map = null, stats = null;
let countries = [], bounds = {}, missingPool = null;
const poolCache = new Map();                         // ISO -> barrages du pays (chargés à la demande)
let ctx = { scope: "world", pool: [], info: S.WORLD, name: "", bounds: null };   // zone de jeu courante
let inGame=false, activeGame=null, training=null, restoring=false;
function persist(extra={}){
  if(!activeGame||restoring)return;
  Object.assign(activeGame,extra);
  if(!saveGame(activeGame))announce(tr("La sauvegarde locale est indisponible.","Local saving is unavailable."));
}
async function resumeGame(){
  const g=savedGame();if(!g)return;
  await start(g.mode,g.training||{},g);
}
function restoreAnswers(g){
  if(!g||!map)return;
  const answers=g.guesses.slice();restoring=true;
  try{
    for(let i=0;i<answers.length;i++){
      const guess=answers[i];
      if(g.mode==="map")for(let h=0;h<(guess[2]||0);h++)document.getElementById("hint")?.click();
      if(g.mode==="mission"){
        const evidence=g.evidence?.[i];
        if(evidence){document.getElementById("source").value=evidence.source||"";document.getElementById("accuracy").value=evidence.accuracy_km||5;document.getElementById("comment").value=evidence.comment||"";}
      }
      map.fire("click",{latlng:{lat:guess[0],lng:guess[1]}});
      document.getElementById("ok")?.click();
      if(g.mode!=="daily"&&(i<answers.length-1||g.phase==="next"))document.getElementById("next")?.click();
    }
    if(g.phase==="finished"&&g.mode!=="daily")document.getElementById("next")?.click();
    if(g.pending&&g.phase!=="locked"&&g.phase!=="finished")map.fire("click",{latlng:{lat:g.pending[0],lng:g.pending[1]}});
    if(g.hints && g.phase!=="locked")for(let h=0;h<g.hints;h++)document.getElementById("hint")?.click();
  }finally{restoring=false;}
}


const inWorld = () => ctx.scope === "world";
const norm = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cname = (c) => (getLang() === "fr" ? c.fr : c.en);
const multi = () => ctx.scope === "world" || ctx.scope.startsWith("ct:");   // monde ou continent : plusieurs pays en jeu
const contName = (k) => CONT_LABEL[k][getLang() === "fr" ? 0 : 1];
const placeOf = (d) => (multi() ? countryOf(d) : d.s || d.ci || countryOf(d));
const bboxOf = (pool) => { const [s, w, n, e] = S.robustBox(pool); return L.latLngBounds([[s, w], [n, e]]).pad(0.03); };
function setWorld() { ctx = { scope: "world", pool: dams, info: S.WORLD, name: t("scope.world"), bounds: null }; }
async function loadCountry(iso) {
  if (!poolCache.has(iso)) {
    const r = await fetch(`data/country/${iso}.json`); if (!r.ok) throw new Error("scope");
    poolCache.set(iso, await r.json());
  }
  return poolCache.get(iso);
}
async function setCountry(iso) {
  const c = countries.find((x) => x.iso === iso); if (!c) throw new Error("scope");
  const pool = await loadCountry(iso);
  ctx = { scope: iso, pool, info: S.poolInfo(pool, iso), name: cname(c), bounds: bboxOf(pool), iso };
}
async function selectScope(v) {
  if (v === "world") return setWorld();
  if (v.startsWith("ct:")) {
    const k = v.slice(3), pool = S.continentPool(dams, k);
    ctx = { scope: v, pool, info: S.poolInfo(pool, v), name: contName(k), bounds: bboxOf(pool) }; return;
  }
  await setCountry(v);
}
const allScopes = () => [
  ...Object.keys(S.CONTINENTS).map((k) => ({ id: "ct:" + k, fr: CONT_LABEL[k][0], en: CONT_LABEL[k][1], n: S.continentPool(dams, k).length })),
  ...countries.map((c) => ({ id: c.iso, fr: c.fr, en: c.en, n: c.n })),
];
// Liste déroulante « zone de jeu » affichée pendant une partie : permet de basculer vers un continent ou un pays.
function zoneSelect() {
  const sel = (v) => (ctx.scope === v ? " selected" : "");
  const cs = [...countries].sort((a, b) => cname(a).localeCompare(cname(b), getLang()));
  return `<label class="zone"><span class="sr">${t("zone.label")}</span><select id="zone" aria-label="${esc(t("zone.label"))}">
    <option value="world"${sel("world")}>${t("scope.world")}</option>
    <optgroup label="${esc(t("zone.continents"))}">${Object.keys(S.CONTINENTS).map((k) => `<option value="ct:${k}"${sel("ct:" + k)}>${esc(contName(k))}</option>`).join("")}</optgroup>
    <optgroup label="${esc(t("zone.countries"))}">${cs.map((c) => `<option value="${c.iso}"${sel(c.iso)}>${esc(cname(c))}</option>`).join("")}</optgroup></select></label>`;
}
function bindZone(mode) {
  $("#zone")?.addEventListener("change", async (e) => {
    try { await selectScope(e.target.value); start(mode); } catch { e.target.value = ctx.scope; }
  });
}
let photosPool = null;
const photoByReg = new Map();   // id du registre -> photo : permet d'illustrer les autres modes quand une photo existe
const loadPhotos = async () => {
  if (!photosPool) { photosPool = await (await fetch("data/photos.json")).json(); photosPool.forEach((x) => x.reg?.id && photoByReg.set(x.reg.id, x)); }
  return photosPool;
};
// Niveau de difficulté (mémorisé) : facile = photo + indices ; moyen = photo seule ; difficile = indices seuls.
const curLevel = () => { const v = store.get("geodam-level"); return S.LEVELS.includes(v) ? v : "easy"; };
const levelOk = (l) => (photosPool ? S.poolUsable(S.levelPool(l, ctx.scope, ctx.pool, photosPool), ctx.info.distinct) : l === "hard");
const usableLevel = (l) => (levelOk(l) ? l : levelOk("easy") ? "easy" : "hard");
let lbLevel = null;
const photoFor = (d) => (d?.img ? d : photoByReg.get(d?.id));
async function loadMissing() { if (!missingPool) missingPool = await (await fetch("data/missing.json")).json(); return missingPool; }

// Le mode démo (GitHub Pages) simule le serveur dans le navigateur : il a besoin des mêmes pools que le Worker.
setResolver(async (scope) => {
  if (scope.startsWith("ct:")) { const pool = S.continentPool(dams, scope.slice(3)); return { pool, info: S.poolInfo(pool, scope), photos: await loadPhotos() }; }
  if (scope === "world") return { pool: dams, info: S.WORLD, known: dams, missing: await loadMissing(), photos: await loadPhotos() };
  const pool = await loadCountry(scope).catch(() => null);
  return pool && { pool, info: S.poolInfo(pool, scope), photos: await loadPhotos() };
});

// ---------------------------------------------------------------- carte
function destroyMap() { if (map) { map.remove(); map = null; } }
function frame(b) { if (b) map.fitBounds(b, { maxZoom: 9, padding: [8, 8] }); else map.setView([25, 10], 2); }
function makeMap(onClick, view = ctx.bounds) {
  destroyMap();
  map = L.map("map", { worldCopyJump: true, minZoom: 2, maxBounds: [[-85, -540], [85, 540]], keyboard: true, zoomSnap: 0.25, zoomDelta: 0.5 });
  frame(view);
  const relief = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 12, maxNativeZoom: 8, attribution: "© Esri" }).addTo(map);
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 14, attribution: "© Esri" });
  L.control.layers({ [t("layer.mute")]: relief, [t("layer.sat")]: sat }, null, { position: "topright" }).addTo(map);
  map.on("click", (e) => onClick(e.latlng.lat, S.wrapLng(e.latlng.lng)));
  coordinateControl(map,onClick);
  return map;
}
const pin = (lat, lng, color, cls = "") =>
  L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<div class="dam-pin ${cls}" style="background:${color}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }) });
const boundsOfIso = (iso) => { const b = bounds[iso]; return b ? L.latLngBounds([[b[0], b[1]], [b[2], b[3]]]).pad(0.05) : null; };
// Par défaut, un clic sur la carte valide la réponse. Le « mode sécurisé » rétablit le bouton Valider (stocké dans le navigateur).
const safeMode = () => store.get("geodam-safe") !== "0" || !!training?.practice || matchMedia("(pointer:coarse)").matches || restoring;
const switchHtml = () => `<label class="switch" title="${esc(t("safe.hint"))}"><input type="checkbox" id="safe" ${safeMode() ? "checked" : ""}><span class="slider" aria-hidden="true"></span><span>${t("safe.label")}</span></label>`;
const bindSafe = (onChange) => $("#safe").addEventListener("change", (e) => { store.set("geodam-safe", e.target.checked ? "1" : "0"); onChange(); });
const hintTxt = () => (safeMode() ? t("map.hint") : t("map.hint1"));
const reactFor = (pts) => t("react." + (pts >= 4800 ? 5 : pts >= 4000 ? 4 : pts >= 2500 ? 3 : pts >= 1200 ? 2 : pts >= 400 ? 1 : 0));

// ---------------------------------------------------------------- indices (3 niveaux payants en carte muette)
function clueRows(d, level, full = false) {
  const km = (v, u) => (v != null && v !== "" && v !== 0 ? `${fmt(v)} ${u}` : null);
  const L = [
    [[t("clue.height"), km(d.h, "m")], [t("clue.year"), d.y], [t("clue.type"), typeLabel(d)], [t("clue.volume"), km(d.v, "hm³")], [t("clue.use"), uses(d).join(", ")]],
    [inWorld() || full ? [t("clue.continent"), contLabel(d)] : null, [t("clue.river"), d.r], [t("clue.elev"), d.el != null ? km(d.el, "m") : null]],
    [[t("clue.owner"), d.ow], [t("clue.reservoir"), d.rn && d.rn !== d.n ? d.rn : null], [t("clue.length"), km(d.len, "m")], [t("clue.catch"), km(d.ca, "km²")], [t("clue.power"), d.mw > 0 ? km(d.mw, "MW") : null]],
    [multi() || full ? [t("clue.country"), countryOf(d)] : null, [t("clue.province"), d.s], [t("clue.city"), d.ci]],
  ];
  return L.slice(0, full ? 4 : level + 1).flatMap((rows, lv) => rows.filter((r) => r && r[1]).map((r) => [...r, lv]));
}
function clueCard(d, level, shownLevel = -1, full = false) {
  const rows = clueRows(d, level, full);
  return `<div class="panel clue"><h2>${esc(d.n)}</h2><dl>${rows.map(([k, v, lv]) => `<dt>${k}</dt><dd${shownLevel >= 0 && lv > shownLevel ? ' class="new"' : ""}>${esc(v)}</dd>`).join("")}</dl></div>`;
}

// ---------------------------------------------------------------- navigation / routage
function setNav(r) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + r));
  $("#lang").hidden = inGame;
  $("#lang").querySelectorAll("[data-l]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === getLang()));
  updateInstallBtn();
}
const routeName = () => location.hash.replace(/^#\/?/, "");
function route() {
  destroyMap(); inGame = false; document.body.classList.remove("playing");
  const r = routeName();
  setNav(r);
  const pages = {
    "": home,
    register: () => renderRegister(app, { api, startMission: () => start("mission"), dams, pools: poolCache }),
    glossary: () => renderGlossary(app), about: () => renderAbout(app, { demo: DEMO }),
  };
  (pages[r === "explore" ? "register" : r] || home)();
  document.title = (r ? ({register:t("reg.title"),glossary:t("gl.title"),about:t("about.title")}[r]||t("title"))+" · GéoDam" : t("title"));
  app.focus({preventScroll:true});
}
document.querySelectorAll("#nav a, #logo").forEach((a) => a.addEventListener("click", (e) => {
  if (a.hash === location.hash || (a.getAttribute("href") === "#/" && !location.hash)) { e.preventDefault(); route(); }
}));
window.addEventListener("hashchange", route);

let installEvt = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function updateInstallBtn() { $("#btn-install").hidden = standalone() || !(installEvt || isIOS) || inGame; }
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; updateInstallBtn(); });
window.addEventListener("appinstalled", () => { installEvt = null; updateInstallBtn(); });
$("#btn-install").addEventListener("click", async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; updateInstallBtn(); }
  else if (isIOS) installHelp();
});
const setLogo = () => { $("#logo").innerHTML = getLang() === "fr" ? "Géo<b>Dam</b>" : "Geo<b>Dam</b>"; };
$("#lang").addEventListener("click", (e) => {
  const l = e.target.dataset?.l; if (!l || l === getLang()) return;
  setLang(l); applyStatic(); setLogo(); route();
});

// ---------------------------------------------------------------- accueil
const heroSvg = () => `<svg class="hero-art" viewBox="0 0 420 260" aria-hidden="true" focusable="false">
  <defs><linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d9bea"/><stop offset="1" stop-color="#5e70d0"/></linearGradient></defs>
  <circle cx="338" cy="56" r="46" fill="#ee813c" opacity=".2"/><circle cx="338" cy="56" r="30" fill="#ee813c"/>
  <path d="M0 140 L60 92 L120 128 L200 62 L280 126 L350 96 L420 140 V260 H0Z" fill="#2a3a8c" opacity=".6"/>
  <path d="M0 160 L80 118 L150 150 L240 104 L330 146 L420 118 V260 H0Z" fill="#1c2a78" opacity=".7"/>
  <rect x="0" y="136" width="118" height="124" fill="url(#gw)"/>
  <path class="wave w1" d="M-100 150 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V260 H-100Z" fill="#b6c1f5" opacity=".5"/>
  <path d="M112 124 H322 L352 260 H82 Z" fill="#eef0f8"/>
  <path d="M112 124 H322 L326 150 H108Z" fill="#d6dbf3"/>
  <g stroke="#c2c8e6" stroke-width="2"><path d="M100 176 H334"/><path d="M92 214 H342"/></g>
  <rect x="104" y="114" width="226" height="12" rx="4" fill="#ee813c"/>
  <g fill="#7f8fe3"><rect x="150" y="134" width="30" height="40" rx="4"/><rect x="202" y="134" width="30" height="40" rx="4"/><rect x="254" y="134" width="30" height="40" rx="4"/></g>
  <g fill="#cfd7fb"><path class="fall" d="M153 176 h24 l8 84 h-40z"/><path class="fall f2" d="M205 176 h24 l8 84 h-40z"/><path class="fall" d="M257 176 h24 l8 84 h-40z"/></g>
  <rect x="352" y="226" width="68" height="34" fill="#76b861"/><path d="M0 250 q120 -14 240 0 t180 -10 V260 H0Z" fill="#5fa24a" opacity=".9"/>
</svg>`;

function profileCard() {
  const lv = P.level(), p = P.get();
  return `<section class="panel profile strip" aria-label="${t("prof.title")}">
    <div class="lvl"><span class="lvl-n">${t("prof.level", { n: lv.n + 1 })}</span><b>${esc(t("lvl." + lv.n))}</b></div>
    <div class="xpbar" role="progressbar" aria-valuenow="${lv.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${lv.pct}%"></i></div>
    <small class="muted">${t("prof.next", { x: fmt(lv.xp), y: fmt(lv.hi) })}${p.streak ? " · " + t("prof.streak", { n: p.streak }) : ""}</small>
    <div class="badges" role="list">${Object.entries(P.BADGES).map(([k, icon]) => `<span role="listitem" class="badge ${p.badges.includes(k) ? "on" : ""}" title="${esc(t("bd." + k))} — ${esc(t("bd." + k + ".d"))}"><i aria-hidden="true">${icon}</i><span class="sr">${esc(t("bd." + k))}</span></span>`).join("")}</div></section>`;
}

function home() {
  inGame = false; setNav(""); document.body.classList.remove("playing");
  if (inWorld()) setWorld(); else if (ctx.scope.startsWith("ct:")) ctx.name = contName(ctx.scope.slice(3)); else ctx.name = cname(countries.find((c) => c.iso === ctx.iso));
  const modes = inWorld() ? MODES : MODES.filter((m) => m !== "mission");
  const list = allScopes().sort((a, b) => cname(a).localeCompare(cname(b), getLang()));
  const total = stats?.total ?? 62362, geo = stats?.geo ?? 42095, isW = inWorld(), isCt = ctx.scope.startsWith("ct:"), cur = usableLevel(curLevel());
  lbLevel = cur;
  const art = isW ? heroSvg() : `<div class="hero-art flagart" aria-hidden="true">${isCt ? '<span class="globe">🧭</span>' : flag({ iso: ctx.iso }, "xl")}</div>`;
  app.innerHTML = `
    <section class="hero"><div class="hero-in"><div class="hero-txt">
      <p class="kicker">${isW ? t("hero.kicker") : t("hero.kicker.scope")}</p>
      <h1>${isW ? t("hero.title") : t("hero.title.scope", { c: esc(ctx.name) })}</h1>
      <p class="hero-sub">${isW ? t("hero.sub", { n: fmt(total) }) : t("hero.sub.scope", { n: fmt(ctx.pool.length) })}</p>
      <div class="row"><button class="cta-main" data-mode="map">▶ ${t("hero.cta")}</button></div>
      <div class="levels" role="radiogroup" aria-label="${esc(t("diff.title"))}">${S.LEVELS.map((l) => `<button type="button" class="lvlpill${cur === l ? " on" : ""}" role="radio" aria-checked="${cur === l}" data-level="${l}"${levelOk(l) ? "" : " disabled"}><b>${DIFF_ICON[l]} ${t("diff." + l)}</b><small>${t("diff." + l + ".d")}</small></button>`).join("")}</div>
      <div class="tiles">${modes.filter((m) => m !== "map").map((m) => `<button class="tile" data-mode="${m}"><span class="ti" aria-hidden="true">${ICON[m]}</span><span><b>${t("mode." + m)}</b><small>${t("tile." + m)}</small></span></button>`).join("")}</div>
      <form class="zonepill" id="cform" autocomplete="off"><span aria-hidden="true">📍</span><label class="sr" for="cinput">${t("scope.title")}</label>
        <input type="text" id="cinput" list="clist" placeholder="${esc(t("zone.ph"))}" autocapitalize="none" spellcheck="false">
        <datalist id="clist">${list.map((c) => `<option value="${esc(cname(c))}">${fmt(c.n)}</option>`).join("")}</datalist>
        ${isW ? "" : `<button type="button" class="ghost" id="cworld">${t("scope.back")}</button>`}</form>
      <p class="small hint" id="chint" role="status"></p>
      ${isW ? `<ul class="chips"><li><b>${fmt(dams.length)}</b> ${t("hero.s1")}</li><li><b>${countries.length}</b> ${t("hero.s2")}</li><li><b>${fmt(total - geo)}</b> ${t("hero.s3")}</li></ul>` : ""}
    </div>${art}</div></section>
    ${profileCard()}
    ${isW ? '<div id="mprog" class="panel"></div>' : ""}
    <h2 class="sec">${isW ? t("lb.title") : t("lb.for", { c: esc(ctx.name) })}</h2>
    <div class="tabs" role="tablist">${modes.map((m, i) => `<button class="tab" role="tab" data-lb="${m}" aria-selected="${i === 0}">${ICON[m]} ${t("mode." + m)}</button>`).join("")}</div>
    <div class="tabs lvltabs" id="lvltabs" role="tablist">${S.LEVELS.map((l) => `<button class="tab" role="tab" data-lvtab="${l}" aria-selected="${cur === l}">${DIFF_ICON[l]} ${t("diff." + l)}</button>`).join("")}</div>
    <div class="panel" id="lb">${t("lb.loading")}</div>`;
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => start(b.dataset.mode)));
  app.querySelectorAll("[data-lb]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-lb]").forEach((x) => x.setAttribute("aria-selected", x === b));
    $("#lvltabs").hidden = b.dataset.lb !== "map";
    showLeaderboard(b.dataset.lb, $("#lb"));
  }));
  app.querySelectorAll("[data-lvtab]").forEach((b) => b.addEventListener("click", () => {
    lbLevel = b.dataset.lvtab; app.querySelectorAll("[data-lvtab]").forEach((x) => x.setAttribute("aria-selected", x === b));
    showLeaderboard("map", $("#lb"));
  }));
  app.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => {
    store.set("geodam-level", b.dataset.level);
    app.querySelectorAll("[data-level]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
    lbLevel = b.dataset.level; app.querySelectorAll("[data-lvtab]").forEach((x) => x.setAttribute("aria-selected", x.dataset.lvtab === lbLevel));
    if ($('[data-lb][aria-selected="true"]')?.dataset.lb === "map") showLeaderboard("map", $("#lb"));
  }));
  const pick = async () => {
    const q = norm($("#cinput").value); if (!q) return;
    const sc = allScopes();
    const hit = sc.find((c) => norm(c.fr) === q || norm(c.en) === q || norm(c.id) === q)
      || (() => { const m = sc.filter((c) => norm(c.fr).startsWith(q) || norm(c.en).startsWith(q)); return m.length === 1 ? m[0] : null; })();
    if (!hit) { $("#chint").className = "err small hint"; $("#chint").textContent = t("scope.err"); return; }
    $("#chint").textContent = t("scope.loading");
    try { await selectScope(hit.id); start("map"); } catch { $("#chint").className = "err small"; $("#chint").textContent = t("scope.err"); }
  };
  $("#cform").addEventListener("submit", (e) => { e.preventDefault(); pick(); });
  $("#cinput").addEventListener("input", (e) => { if (!e.inputType || e.inputType === "insertReplacementText") pick(); });
  $("#cworld")?.addEventListener("click", () => { setWorld(); home(); });
  if (inWorld()) missionProgress($("#mprog"), api);
  showLeaderboard("map", $("#lb"));
  homeExtras(app,{start,resume:resumeGame,selectScope,dams,api});
}

async function showLeaderboard(mode, el, highlight) {
  el.textContent = t("lb.loading");
  try {
    const { entries, period } = await api(`leaderboard?mode=${mode}&scope=${ctx.scope}&level=${lbLevel || "hard"}`);
    const medal = (i) => ["🥇", "🥈", "🥉"][i] || i + 1;
    el.innerHTML = (mode === "daily" ? `<p class="muted">${t("lb.day", { d: esc(period) })}</p>` : "") +
      (entries.length ? `<div class="table-wrap"><table class="lb"><thead><tr><th>#</th><th>${t("lb.player")}</th><th class="num">${t("lb.score")}</th></tr></thead><tbody>${entries.map((e, i) =>
        `<tr${highlight === e.name ? ' class="me"' : ""}><td>${medal(i)}</td><td>${esc(e.name)}</td><td class="num">${fmt(e.score)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">${t("lb.empty")}</p>`);
  } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------------------------------------------------------------- fin de partie : score, XP, communauté, pseudo
function gain(ev) {
  const r = P.award(ev);
  if (r.levelUp) { toast(t("toast.level", { n: P.level().n + 1, name: t("lvl." + P.level().n) }), "good"); confetti(); }
  r.badges.forEach((b) => toast(t("toast.badge", { name: t("bd." + b) }), "good"));
  return r.xp;
}
async function finishGame(mode, token, payload, o) {
  const box = document.createElement("div");
  box.className = "panel result end"; box.textContent = t("end.calc");
  $("#end").replaceChildren(box);
  persist({phase:"finished"});
  let res;
  try{
    if(training?.practice)res={...(o.localScore?o.localScore():S.dailyScore(ctx.pool,activeGame.session.seed,payload.guesses,ctx.info)),qualifies:false,rank:null,practice:true};
    else res=await api("finish",{token,...payload});
  }
  catch(e){
    box.innerHTML='<p class="err" role="alert">'+esc(e.message)+'</p><button id="retryfinish">'+tr("Réessayer l’envoi","Retry submission")+'</button><button id="retryhome" class="ghost">'+t("end.home")+'</button>';
    $("#retryfinish",box).onclick=()=>finishGame(mode,token,payload,o);
    $("#retryhome",box).onclick=()=>route();
    persist({phase:"finished"});return;
  }
  box.innerHTML = `${o.summary(res)}<div class="bigscore"><span id="bs">0</span><small>pts</small></div>
    <p class="rankline">${t("end.valid", { s: fmt(res.score), r: res.rank })}</p><div id="comm"></div><div id="xpline"></div>`;
  if(res.practice)box.querySelector(".rankline").textContent=tr("Résultat d’entraînement · aucun classement partagé","Practice result · no shared leaderboard");
  clearGame();
  if(mode==="mission"&&!training?.practice)P.trackMission(token);
  announce(tr("Partie terminée. Score : ","Game complete. Score: ")+res.score);
  countUp($("#bs", box), res.score, 1100, fmt);
  if (res.rank <= 3 || (o.celebrate && o.celebrate(res))) confetti(res.rank === 1 ? 220 : 120);
  const xp = gain({ id:token, game: 1, scope: ctx.scope, xp: o.xp(res), ...(o.award ? o.award(res) : {}) });
  $("#xpline", box).innerHTML = `<p class="xp">⭐ ${t("toast.xp", { n: xp })}</p>`;
  if (o.community) o.community(res, $("#comm", box));
  if (o.share) box.insertAdjacentHTML("beforeend", `<div class="row"><button class="ghost" id="share">${t("end.copy")}</button></div>`);
  $("#share")?.addEventListener("click", async (ev) => { const txt = o.share(res); try { await navigator.clipboard.writeText(txt); ev.target.textContent = t("end.copied"); } catch { ev.target.textContent = txt; } });
  if (res.qualifies) {
    box.insertAdjacentHTML("beforeend", `<h3 class="inline-h">${t("end.in")}</h3>
      <div class="notice">${DEMO ? t("demo.banner") : t("end.ipnotice")}</div>
      <form class="row" id="nameform"><input type="text" id="pseudo" maxlength="16" minlength="2" placeholder="${esc(t("end.pseudo"))}" aria-label="${esc(t("end.pseudo"))}" autocomplete="nickname" required value="${esc(store.get("geodam-name") || "")}"><button class="accent">${t("end.save")}</button></form>
      <p class="err" id="nerr"></p>`);
    $("#nameform").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = $("#pseudo").value.trim();
      try {
        await api("submit", { claim: res.claim, name });
        store.set("geodam-name", name);
        $("#nameform").remove(); $("#nerr").remove(); box.querySelector(".notice")?.remove(); box.querySelector(".inline-h")?.remove();
        const lb = document.createElement("div"); lb.style.marginTop = "12px";
        box.append(lb); showLeaderboard(mode, lb, name);
      } catch (e) { $("#nerr").textContent = e.message; }
    });
  } else box.insertAdjacentHTML("beforeend", `<p class="muted">${res.score > 0 ? t("end.out") : t("end.zero")}</p>`);
  box.insertAdjacentHTML("beforeend", `<div class="row"><button id="again">${t("end.again")}</button><button class="ghost" id="tohome">${t("end.home")}</button></div>`);
  $("#again").addEventListener("click", () => start(mode));
  $("#tohome").addEventListener("click", () => { if (routeName()) location.hash = "#/"; else route(); });
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return res;
}

async function start(mode,options={},resume=null) {
  training=options;
  if(training.revision)setWorld();
  if(!navigator.onLine&&mode==="map")training={...options,practice:true};
  if (mode === "mission" && !inWorld()) setWorld();
  if (routeName()) history.replaceState(null, "", "#/");
  inGame = true; setNav(""); document.body.classList.add("playing");
  app.innerHTML = `<p class="muted">${t("prep")}</p>`;
  try {
    if (mode === "map" || mode === "daily") await loadPhotos().catch(() => {});   // photos : niveaux facile/moyen, solution, dernier indice du jour
    const level = mode === "map" ? (resume?.level || (training.revision ? "hard" : usableLevel(curLevel()))) : undefined;
    if (mode === "mission") await Promise.all([loadMissing(), fetch("data/bounds.json").then((r) => r.json()).then((b) => { bounds = b; })]);
    if(resume)await selectScope(resume.scope);
    if(mode==="map"&&training.revision&&!ctx.pool.some(d=>P.mistakes().includes(d.id)))throw new Error(tr("Aucun barrage à réviser dans cette zone.","No dams to review in this area."));
    const sess=resume?.session || (training.practice?{token:"practice:"+crypto.randomUUID(),seed:crypto.randomUUID(),scope:ctx.scope,mode}:await api("session",{mode,scope:ctx.scope,level}));
    activeGame=resume?{...resume}:{mode,scope:ctx.scope,level,training,session:sess,guesses:[],evidence:[],revisionIds:training.revision?P.mistakes():[],phase:"next",date:Date.now()};
    persist();
    ({ map: (x) => playMap(x, level), daily: playDaily, mission: playMission })[mode](sess);
    bindZone(mode);
    decorateGame();
    if(training.tutorial){const p=document.createElement("p");p.className="notice";p.textContent=tr("Déplacez la carte ou saisissez des coordonnées, placez le repère puis validez. Le point vert montre la réponse.","Move the map or enter coordinates, place your marker, then confirm. The green point shows the answer.");app.prepend(p);}
    if(resume)restoreAnswers(resume);
    $("#level")?.addEventListener("change", (e) => { store.set("geodam-level", e.target.value); start("map"); });
  } catch (e) { inGame = false; app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- Mode « photo » : même mécanique que la carte muette, avec une vraie photo
// Repli si la miniature Wikimedia ne charge pas : on retente via Special:FilePath, puis on affiche un cadre « photo indisponible ».
const fbSrc = (x) => `https://commons.wikimedia.org/wiki/Special:FilePath/${(x.page || "").split("File:")[1] || ""}?width=900`;
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img?.tagName !== "IMG" || !img.dataset.fb) return;
  if (!img.dataset.tried) { img.dataset.tried = "1"; img.src = img.dataset.fb; } else (img.closest(".photo-frame") || img.closest("figure"))?.classList.add("broken");
}, true);
const revealPhoto = (x) => (x ? `<figure class="reveal-photo"><img src="${esc(x.img)}" data-fb="${esc(fbSrc(x))}" alt="${esc(t("photo.alt"))}" referrerpolicy="no-referrer" loading="lazy"><span class="broken-msg">${t("photo.broken")}</span><figcaption>📷 ${esc(x.a || "?")} · <a href="${esc(x.page)}" target="_blank" rel="noopener">${esc(x.lic)}</a> · Wikimedia Commons</figcaption></figure>` : "");
const asDam = (d) => ({ ...d.reg, id: d.reg?.id || d.id, n: d.n, la: d.la, lo: d.lo, iso: d.iso, c: d.c, ce: d.ce, ct: d.ct });
const creditHtml = (d) => `<p class="credit">📷 ${esc(d.a || "?")} · <a href="${esc(d.page)}" target="_blank" rel="noopener">${esc(d.lic)}</a> · Wikimedia Commons</p>`;
const photoFrame = (d) => `<div class="photo-frame"><img src="${esc(d.img)}" alt="${esc(t("photo.alt"))}" referrerpolicy="no-referrer" data-fb="${esc(fbSrc(d))}"><span class="broken-msg">${t("photo.broken")}</span></div><p class="credit">📷 ${esc(d.a || "?")} · ${esc(d.lic)}</p>`;
function photoCard(d, level, shownLevel = -1) {   // niveau moyen : photo seule, les indices sont payants
  const r = d.reg || {}, km = (v, u) => (v ? `${fmt(v)} ${u}` : null);
  const rows = [
    level >= 1 && [t("clue.continent"), d.ct && contLabel(d), 1], level >= 2 && [t("clue.country"), countryOf(d), 2],
    level >= 3 && [t("photo.name"), d.n, 3], level >= 3 && [t("clue.height"), km(r.h, "m"), 3], level >= 3 && [t("clue.year"), r.y, 3], level >= 3 && [t("clue.river"), r.r, 3],
  ].filter((x) => x && x[1]);
  return `<div class="panel clue photo">${photoFrame(d)}
    ${rows.length ? `<dl>${rows.map(([k, v, lv]) => `<dt>${k}</dt><dd${shownLevel >= 0 && lv > shownLevel ? ' class="new"' : ""}>${esc(v)}</dd>`).join("")}</dl>` : `<p class="muted small">${t("photo.who")}</p>`}</div>`;
}
const levelSelect = (level) => `<label class="zone"><span class="sr">${t("diff.title")}</span><select id="level" aria-label="${esc(t("diff.title"))}">${S.LEVELS.map((l) => `<option value="${l}"${l === level ? " selected" : ""}${levelOk(l) ? "" : " disabled"}>${DIFF_ICON[l]} ${t("diff." + l)}</option>`).join("")}</select></label>`;

// ---------------------------------------------------------------- Mode 1 : carte muette (avec indices payants)
function playMap({ token, seed }, level = "hard") {
  const photo = level !== "hard", { info } = ctx, pool = training?.revision ? ctx.pool.filter(d=>activeGame.revisionIds.includes(d.id)) : S.levelPool(level, ctx.scope, ctx.pool, photosPool || []), idx = training?.revision ? pool.map((_,i)=>i).slice(0,5) : S.pickMapRounds(pool, seed, info.distinct), guesses = [], recap = [];
  let round = 0, total = 0, guess = null, layers = [], locked = false, lockedAt = 0, hints = 0, shown = 0;
  app.innerHTML = `<div class="hud"><span id="rd"></span><span class="hud-tools">${levelSelect(level)}${zoneSelect()}${switchHtml()}</span><span id="sc"></span></div>
    <div class="game${photo ? " photo" : ""}"><div id="side"></div><div><div id="map"></div><p class="muted small" id="kbd">${t("map.centerhint")}</p>
    <div class="row actions"><button id="ctr" class="ghost">${t("map.center")}</button><button id="ok" disabled>${t("map.validate")}</button><button id="next" class="accent" hidden></button></div></div></div><div id="end"></div>`;
  const roundCount=training?.tutorial?1:Math.min(S.MAP_ROUNDS,idx.length);
  lbLevel = level;
  const place = (lat, lng) => {
    if (locked) return;   // 2e clic, 2 s après : manche suivante
    guess=[lat,lng];persist({pending:guess}); layers.forEach((l) => l.remove()); layers = [pin(lat, lng, PIN_GUESS, "drop").addTo(map)]; $("#ok").disabled = false; if (!safeMode() && !restoring) $("#ok").click();
  };
  makeMap(place);
  bindSafe(() => { $("#ok").hidden = locked || !safeMode(); side(); });
  const sideCard = (d) => (level === "hard" ? clueCard(d, hints, shown) : level === "easy" ? `<div class="panel clue photo">${photoFrame(d)}</div>` + clueCard(asDam(d), hints, shown) : photoCard(d, hints, shown));
  $("#ctr").addEventListener("click", () => { const c = map.getCenter(); place(c.lat, S.wrapLng(c.lng)); });
  const side = () => {
    const d = pool[idx[round]];
    $("#side").innerHTML = sideCard(d) +
      `<div class="hintbar"><button class="ghost" id="hint" ${hints >= S.MAX_HINTS || locked ? "disabled" : ""}>${hints >= S.MAX_HINTS ? t("hint.none") : t("hint.btn")}</button>
       <small class="muted">${hints ? t("hint.used", { n: hints, p: (training?.practice?0:hints * 10) }) : t("hint.left", { n: S.MAX_HINTS })}</small></div><p class="muted small">${hintTxt()}</p>`;
    if(training?.practice)$("#side .hintbar small").textContent=tr("Indices gratuits en entraînement","Free hints in practice");
    shown = hints;
    $("#hint").addEventListener("click", () => { hints++; persist({hints}); side(); });
  };
  const render = () => {
    guess = null; locked = false; hints = 0; shown = -1;
    layers.forEach((l) => l.remove()); layers = []; frame(ctx.bounds);
    $("#rd").textContent = t("map.round", { n: round + 1, t: roundCount }); $("#sc").textContent = t("map.score", { s: fmt(total) });
    side(); $("#ok").hidden = !safeMode(); $("#ok").disabled = true; $("#ctr").hidden = false; $("#next").hidden = true;
  };
  $("#ok").addEventListener("click", () => {
    const d = pool[idx[round]], km = S.distanceKm(guess[0], guess[1], d.la, d.lo), base = S.mapPoints(km, info.scale), pts = Math.round(base * (training?.practice?1:S.hintFactor(hints)));
    guesses.push([guess[0],guess[1],hints]);persist({guesses:[...guesses],hints:0,phase:"locked",pending:null});P.remember(photo?asDam(d):d,km); total += pts; locked = true; lockedAt = Date.now(); $("#ok").hidden = true; $("#ctr").hidden = true; side();
    recap.push({ n: d.n, km, pts, hints });
    layers.push(pin(d.la, d.lo, PIN_TRUTH, "pulse").addTo(map), L.polyline([guess, [d.la, d.lo]], { color: "#111a4c", dashArray: "6 6", weight: 2 }).addTo(map));
    map.fitBounds(L.latLngBounds([guess, [d.la, d.lo]]).pad(0.5), { maxZoom: 7 });
    $("#side").insertAdjacentHTML("beforeend", `<div class="panel result pop"><div class="react">${reactFor(base)}</div><div class="where">${flag(d, "big")}<div><b>${esc(countryOf(d))}</b>${photo ? `<br><span class="muted">${esc(d.n)}</span>` : ""}${multi() || !(d.s || d.ci) ? "" : `<br><span class="muted">${esc(d.s || d.ci)}</span>`}</div></div>${t("map.dist", { km: fmt(km) })}
      <div class="pts-line">+<span id="rp">0</span>${hints && !training?.practice ? ` <small>(−${hints * 10} %)</small>` : ""}</div>${photo ? creditHtml(d) + (d.reg ? factsHtml(asDam(d)) : "") : factsHtml(d) + revealPhoto(photoFor(d))}${!photo || d.reg ? `<button class="ghost" id="sheetbtn">${t("sheet.open")}</button>` : ""}${safeMode() ? "" : `<p class="muted small">${t("map.next2")}</p>`}</div>`);
    countUp($("#rp"), pts, 700, fmt); $("#sheetbtn")?.addEventListener("click", () => openSheet(photo ? asDam(d) : d));
    if (base >= 4800) confetti(80);
    $("#sc").textContent = t("map.score", { s: fmt(total) });
    $("#next").hidden = false; $("#next").textContent = round === roundCount - 1 ? t("map.last") : t("map.next"); $("#next").focus();
  });
  $("#next").addEventListener("click", () => {
    round++;persist({phase:"next",hints:0});
    if (round < roundCount) return render();
    $("#next").hidden = true; $("#kbd").hidden = true;
    const eagle = recap.filter((r) => r.km < 10).length, perfect = recap.some((r) => r.pts >= 5000);
    finishGame("map", token, { guesses }, {
      localScore:()=>({score:total}),
      summary: () => `<h2>${t("map.over")}</h2><ol class="recap">${recap.map((r) => `<li><b>${esc(r.n)}</b> <span>${fmt(r.km)} km${r.hints ? " 💡" + r.hints : ""}</span> <em>${fmt(r.pts)}</em></li>`).join("")}</ol>`,
      xp: (r) => Math.round((r.score / 1000) * XPMUL[level]), award: () => ({ eagle, perfect: perfect ? 1 : 0 }), celebrate: (r) => r.score >= 20000,
    });
  });
  render();
}

// ---------------------------------------------------------------- Mode 2 : barrage du jour
function playDaily({ token, seed }) {
  const { pool, info, scope } = ctx, key = `geodam-daily-${scope}-${seed}`, target = pool[S.dailyIndex(pool, seed)];
  if (store.get(key) && activeGame?.phase!=="finished" && !activeGame?.guesses?.length) {
    const past = JSON.parse(store.get(key));
    app.innerHTML = `<div class="panel"><h2>${t("daily.played")}</h2><div class="row">${zoneSelect()}</div><p>${t("daily.playedtxt", { d: esc(seed), n: esc(target.n), c: esc(countryOf(target)) })} ${past.found ? t("daily.res", { n: past.tries, s: fmt(past.score) }) : t("daily.nores")}</p><p class="muted">${t("daily.again")}</p><div id="lb"></div><div class="row"><button id="tohome2">${t("end.home")}</button></div></div>`;
    $("#tohome2").addEventListener("click", () => route());
    showLeaderboard("daily", $("#lb")); return;
  }
  const guesses = [], ch = [], photoClue = photoFor(target);
  let cur = null;
  const m = (v, u) => (v != null && v !== "" ? `${fmt(v)} ${u}` : null);
  const clues = [
    (d) => [inWorld() ? contLabel(d) : multi() ? null : d.s, d.h != null && t("clue.hhigh", { h: d.h })].filter(Boolean).join(" · "),
    (d) => [d.y && t("clue.d1", { y: d.y }), d.t && t("clue.d2", { t: typeLabel(d) })].filter(Boolean).join(" · "),
    (d) => [uses(d).join(", "), m(d.v, "hm³"), d.mw > 0 && m(d.mw, "MW")].filter(Boolean).join(" · "),
    (d) => [d.r && t("clue.d3", { r: d.r }), d.rn && d.rn !== d.n && `${t("clue.reservoir")} : ${d.rn}`].filter(Boolean).join(" · "),
    (d) => [d.ow && `${t("clue.owner")} : ${d.ow}`, d.el != null && `${t("clue.elev")} : ${m(d.el, "m")}`, d.len && `${t("clue.length")} : ${m(d.len, "m")}`].filter(Boolean).join(" · "),
    (d) => [multi() ? t("clue.d4", { c: countryOf(d) }) : d.s && t("clue.d4p", { s: d.s }), t("clue.d5", { i: `${d.n[0]}${"·".repeat(Math.max(0, d.n.length - 1))}` }) + (d.ci ? t("clue.d6", { c: d.ci }) : "")].filter(Boolean).join(" · "),
  ];
  app.innerHTML = `<div class="hud"><span>${t("daily.title", { d: esc(seed) })}${inWorld() ? "" : " — " + esc(ctx.name)}</span><span class="hud-tools">${zoneSelect()}${switchHtml()}</span><span id="tries"></span></div>
    <div class="game"><div><details class="panel rules" open><summary>📜 ${t("daily.rules.title")}</summary><ol>${[1, 2, 3, 4, 5].map((i) => `<li>${t("daily.rules." + i, { km: Math.ceil(info.foundKm) })}</li>`).join("")}</ol></details>
    <div class="panel" style="margin-top:12px"><h3>${t("daily.clues")}</h3><ol id="clues" class="cluelist"></ol></div>
    <div class="panel" style="margin-top:12px"><h3>${t("daily.attempts")}</h3><ul class="attempts" id="att"></ul></div></div>
    <div><div id="map"></div><p class="muted small">${t("map.centerhint")}</p><div class="row actions"><button id="ctr" class="ghost">${t("map.center")}</button><button id="ok" disabled>${t("daily.ok")}</button></div></div></div><div id="end"></div>`;
  let guess = null, over = false;
  // Un indice de plus à chaque erreur : les indices à venir sont visibles mais verrouillés, le dernier ajoute une photo si elle existe.
  const showClues = () => {
    const n = over ? clues.length : guesses.length + 1;
    $("#clues").innerHTML = clues.map((f, i) => i < n
      ? `<li class="clue-card on${i === n - 1 && guesses.length && !over ? " new" : ""}"><span class="num">${i + 1}</span><div>${esc(f(target) || "—")}${i === clues.length - 1 && photoClue ? `<img class="clue-photo" src="${esc(photoClue.img)}" alt="${esc(t("photo.alt"))}" referrerpolicy="no-referrer" loading="lazy" data-fb="${esc(fbSrc(photoClue))}"><span class="credit">📷 ${esc(photoClue.a || "?")} · ${esc(photoClue.lic)}</span>` : ""}</div></li>`
      : `<li class="clue-card locked"><span class="num">🔒</span><div class="muted">${t("daily.locked", { n: i + 1 })}</div></li>`).join("");
    $("#tries").textContent = t("daily.try", { n: Math.min(guesses.length + 1, S.DAILY_TRIES), t: S.DAILY_TRIES });
  };
  const place = (lat, lng) => { if (over) return; guess=[lat,lng];persist({pending:guess}); if (cur) cur.remove(); cur = pin(lat, lng, PIN_GUESS, "drop").addTo(map); $("#ok").disabled = false; if (!safeMode() && !restoring) $("#ok").click(); };
  makeMap(place);
  $("#ok").hidden = !safeMode(); bindSafe(() => { $("#ok").hidden = over || !safeMode(); });
  $("#ctr").addEventListener("click", () => { const c = map.getCenter(); place(c.lat, S.wrapLng(c.lng)); });
  $("#ok").addEventListener("click", () => {
    const km = S.distanceKm(guess[0], guess[1], target.la, target.lo), found = km <= info.foundKm;
    guesses.push(guess);persist({guesses:[...guesses],phase:"next",pending:null});P.remember(target,km); ch.push(found ? "🟩" : km < 500 ? "🟧" : "🟥");
    const arrow = found ? "🎯" : S.arrowFor(S.bearingDeg(guess[0], guess[1], target.la, target.lo));
    $("#att").insertAdjacentHTML("beforeend", `<li class="pop">${guesses.length}. ${arrow} ${found ? t("daily.found") : `${fmt(km)} km`}</li>`);
    cur = null; $("#ok").disabled = true; guess = null;
    if (found || guesses.length === S.DAILY_TRIES) {
      over = true; $("#ok").hidden = true; $("#ctr").hidden = true; showClues();
      pin(target.la, target.lo, PIN_TRUTH, "pulse").addTo(map); map.setView([target.la, target.lo], multi() ? 5 : 8);

      if (found) confetti(150);
      finishGame("daily", token, { guesses }, {
        summary: () => `<h2>${found ? t("daily.win") : t("daily.lose")}</h2><div class="where center">${flag(target, "big")}<span>${t("daily.was", { n: esc(target.n), c: esc(countryOf(target)) })}</span></div>${factsHtml(target)}${revealPhoto(photoClue)}<button class="ghost" id="sheetbtn">${t("sheet.open")}</button>`,
        xp: (r) => (r.found ? 15 + (S.DAILY_TRIES - r.tries) * 3 : 4), award: () => ({ daily: seed }), share: () => `GéoDam ${seed} ${found ? guesses.length : "X"}/${S.DAILY_TRIES}\n${ch.join("")}`,
      }).then(res=>{if(res)store.set(key,JSON.stringify(res));$("#sheetbtn")?.addEventListener("click",()=>openSheet(target));});
    } else { showClues(); toast(t("daily.newclue", { n: guesses.length + 1 })); }
  });
  showClues();
}

// ---------------------------------------------------------------- Mode 3 : mission cartographe
function playMission({ token, seed }) {
  const rounds = S.pickMissionRounds(dams,missingPool,seed),guesses=[],evidence=[];
  let round = 0, guess = null, layers = [], locked = false, lockedAt = 0;
  const dOf = (rd) => (rd.src === "k" ? dams[rd.i] : missingPool[rd.i]);
  app.innerHTML = `<div class="hud"><span id="rd"></span>${switchHtml()}<span class="pill part">🛰️ ${t("mission.title")}</span></div>
    <div class="notice">${t("mission.blind")}</div>
    <div class="game"><div id="side"></div><div><div id="map"></div><p class="muted small">${t("map.centerhint")}</p>
    <div class="row actions"><button id="ctr" class="ghost">${t("map.center")}</button><button id="ok" disabled>${t("map.validate")}</button><button id="next" class="accent" hidden></button></div></div></div><div id="end"></div>`;
  const place = (lat, lng) => {
    if (locked) return;
    guess=[lat,lng];persist({pending:guess}); layers.forEach((l) => l.remove()); layers = [pin(lat, lng, PIN_GUESS, "drop").addTo(map)]; $("#ok").disabled = false; if (!safeMode() && !restoring) $("#ok").click();
  };
  makeMap(place, null);
  bindSafe(() => { $("#ok").hidden = locked || !safeMode(); });
  $("#ctr").addEventListener("click", () => { const c = map.getCenter(); place(c.lat, S.wrapLng(c.lng)); });
  const render = () => {
    const d = dOf(rounds[round]); guess = null; locked = false;
    layers.forEach((l) => l.remove()); layers = []; frame(boundsOfIso(d.iso));
    $("#rd").textContent = t("map.round", { n: round + 1, t: S.MISSION_KNOWN + S.MISSION_UNKNOWN });
    $("#side").innerHTML = clueCard(d, 3, -1, true) + `<p class="muted small">${hintTxt()}</p>`;
    $("#side").insertAdjacentHTML("beforeend",'<fieldset class="panel evidence"><legend>'+tr("Documenter ma proposition","Document my proposal")+'</legend><label>'+tr("URL de la source consultée","Source URL")+'<input id="source" type="url" maxlength="1000" placeholder="https://"></label><label>'+tr("Précision estimée (km)","Estimated accuracy (km)")+'<input id="accuracy" type="number" min="0.01" max="500" step="any" value="5"></label><label>'+tr("Commentaire et méthode","Comment and method")+'<textarea id="comment" maxlength="1000"></textarea></label><p class="small">'+tr("Une proposition reste une suggestion jusqu’à examen humain. Votre connexion est pseudonymisée pour limiter les votes répétés.","Proposals remain suggestions until human review. Your connection is pseudonymized to limit repeat votes.")+'</p><button type="button" class="ghost" id="skipproposal">'+tr("Passer sans contribuer","Skip without contributing")+'</button></fieldset>');
    $("#skipproposal").onclick=()=>{guess=[map.getCenter().lat,S.wrapLng(map.getCenter().lng)];$("#source").value="";$("#ok").disabled=false;$("#ok").click();};

    $("#ok").hidden = !safeMode(); $("#ok").disabled = true; $("#ctr").hidden = false; $("#next").hidden = true;
  };
  $("#ok").addEventListener("click", () => {
    const rd=rounds[round],d=dOf(rd);
    if(!guess)return;
    evidence.push({id:d.id,source:$("#source").value,accuracy_km:Number($("#accuracy").value),comment:$("#comment").value});
    guesses.push(guess);persist({guesses:[...guesses],evidence:[...evidence],phase:"locked",pending:null}); locked = true; lockedAt = Date.now(); $("#ok").hidden = true; $("#ctr").hidden = true;
    if (rd.src === "k") {
      const km = S.distanceKm(guess[0], guess[1], d.la, d.lo), pts = S.mapPoints(km);
      layers.push(pin(d.la, d.lo, PIN_TRUTH, "pulse").addTo(map), L.polyline([guess, [d.la, d.lo]], { color: "#111a4c", dashArray: "6 6", weight: 2 }).addTo(map));
      map.fitBounds(L.latLngBounds([guess, [d.la, d.lo]]).pad(0.5), { maxZoom: 7 });
      $("#side").insertAdjacentHTML("beforeend", `<div class="panel result pop"><div class="react">${reactFor(pts)}</div><div class="where">${flag(d, "big")}<b>${esc(countryOf(d))}</b></div>${t("map.dist", { km: fmt(km) })} → <span class="pts">+${fmt(pts)}</span></div>`);
    } else {
      $("#side").insertAdjacentHTML("beforeend", `<div class="panel result pop"><div class="react">🛰️</div><b>${t("mission.thanks")}</b><br><span class="pts">${t("mission.bonus", { n: S.MISSION_BONUS })}</span>${safeMode() ? "" : `<p class="muted small">${t("map.next2")}</p>`}</div>`);
    }
    $("#next").hidden = false; $("#next").textContent = round === rounds.length - 1 ? t("map.last") : t("map.next"); $("#next").focus();
  });
  $("#next").addEventListener("click", () => {
    round++;persist({phase:"next",hints:0});
    if (round < rounds.length) return render();
    $("#next").hidden = true;
    finishGame("mission", token, { guesses, evidence }, {
      summary: () => `<h2>🛰️ ${t("mission.sum")}</h2>`,
      xp: (r) => Math.round(r.score / 500), celebrate: (r) => (r.community?.saved || 0) >= 3,
      award: (r) => ({ contrib: r.community?.saved || 0 }),
      community: (r, el) => {
        const c = r.community; if (!c) return;
        const statusLabels={proposed:tr("Proposée","Proposed"),already_proposed:tr("Déjà proposée depuis cette connexion","Already proposed from this connection"),missing_source:tr("Non enregistrée : source manquante","Not saved: missing source")};
        const nameOf = (id) => esc(missingPool.find((x) => x.id === id)?.n || id);
        el.innerHTML = `<div class="comm"><p><b>${t("mission.saved", { n: c.saved })}</b> · ${t("mission.trust", { p: c.trust })}</p>
          ${c.trust < 15 ? `<p class="err">${t("mission.lowtrust")}</p>` : ""}
          <ul>${c.items.map((it) => `<li><b>${nameOf(it.id)}</b> — ${esc(statusLabels[it.status]||"")} · ${it.others ? t("mission.others", { o: it.others, km: fmt(it.kmToCommunity ?? 0) }) : t("mission.first")}</li>`).join("")}</ul>${DEMO ? `<small class="muted">${t("mission.demo")}</small>` : ""}</div>`;
      },
    });
  });
  render();
}

// ---------------------------------------------------------------- démarrage
function boot() {
  applyStatic(); setLogo();
  if (DEMO) $("#demo-banner").hidden = false;
  setupConnectivity();setupUpdates();
  Promise.all([fetch("data/dams.json").then((r) => r.json()), fetch("data/countries.json").then((r) => r.json()), fetch("data/stats.json").then((r) => r.json()).catch(() => null), loadPhotos().catch(() => null)])
    .then(([d, c, s]) => { dams = d; countries = c; stats = s; setWorld(); route(); })
    .catch(() => { app.innerHTML = `<p class="err">${t("data.err")}</p>`; });
}
boot();
