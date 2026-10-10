// Logique de jeu partagée client + serveur : le Worker (ou le mode démo) rejoue les parties pour recalculer le score.
export const MAP_ROUNDS = 5;
export const DAILY_TRIES = 6;
export const HILO_CAP = 60;
export const MAX_HINTS = 3;       // indices payants en carte muette : -10 % du score de la manche par indice
export const HINT_COST = 0.1;
export const MISSION_KNOWN = 2;   // manches « étalon » (coordonnées connues) servant à pondérer la confiance
export const MISSION_UNKNOWN = 3; // manches où le joueur propose une localisation pour un barrage sans coordonnées
export const MISSION_BONUS = 500; // points par contribution
export const HILO_STATS = {
  h: "Hauteur (m)", v: "Volume du réservoir (hm³)", y: "Année de mise en service", mw: "Puissance installée (MW)",
  len: "Longueur de crête (m)", el: "Altitude (m)", ca: "Bassin versant (km²)",
};

export function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFrom = (s) => mulberry32(xfnv1a(String(s)));

const rad = Math.PI / 180;
export function distanceKm(la1, lo1, la2, lo2) {
  const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 +
    Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function bearingDeg(la1, lo1, la2, lo2) {
  const y = Math.sin((lo2 - lo1) * rad) * Math.cos(la2 * rad);
  const x = Math.cos(la1 * rad) * Math.sin(la2 * rad) - Math.sin(la1 * rad) * Math.cos(la2 * rad) * Math.cos((lo2 - lo1) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}
export const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
export const arrowFor = (deg) => ARROWS[Math.round(deg / 45) % 8];
export const mapPoints = (km, scale = 1500) => Math.round(5000 * Math.exp(-km / scale));
export const hintFactor = (h) => 1 - HINT_COST * Math.min(MAX_HINTS, Math.max(0, h | 0));

// Réglages de difficulté selon la zone : le monde est noté sur ~1 500 km, un pays à l'échelle de son étendue.
export const WORLD = { scale: 1500, foundKm: 25, distinct: true };
export function poolInfo(dams, scope) {
  if (scope === "world") return WORLD;
  let s = 90, n = -90, w = 180, e = -180;
  for (const d of dams) { s = Math.min(s, d.la); n = Math.max(n, d.la); w = Math.min(w, d.lo); e = Math.max(e, d.lo); }
  const scale = Math.min(1500, Math.max(30, distanceKm(s, w, n, e) / 6));
  return { scale, foundKm: Math.max(3, scale / 60), distinct: false };
}

const okPoint = (p, len = 2) => Array.isArray(p) && p.length === len && Math.abs(p[0]) <= 90 && p.every(Number.isFinite);
export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

// ---------- Mode 1 : carte muette (réponse = [lat, lng, indicesUtilisés]) ----------
export function pickMapRounds(dams, seed, distinct = true) {
  const r = rngFrom("map:" + seed), out = [], iso = new Set();
  for (let g = 0; out.length < MAP_ROUNDS && g < 1000; g++) {
    const i = Math.floor(r() * dams.length);
    if (out.includes(i) || (distinct && iso.has(dams[i].iso))) continue;
    iso.add(dams[i].iso); out.push(i);
  }
  return out;
}
export function mapScore(dams, seed, guesses, info = WORLD) {
  if (!Array.isArray(guesses) || guesses.length !== MAP_ROUNDS || !guesses.every((g) => okPoint(g, 3) && g[2] >= 0 && g[2] <= MAX_HINTS)) return null;
  const rounds = pickMapRounds(dams, seed, info.distinct).map((i, k) => {
    const d = dams[i], km = distanceKm(guesses[k][0], guesses[k][1], d.la, d.lo);
    return { km, pts: Math.round(mapPoints(km, info.scale) * hintFactor(guesses[k][2])) };
  });
  return { score: rounds.reduce((s, r) => s + r.pts, 0), rounds };
}

// ---------- Mode 2 : plus haut / plus bas ----------
const validCache = new WeakMap();
const statOk = (d, k) => d[k] != null && (k === "y" || k === "el" || d[k] > 0);
function validIdx(dams) {
  let v = validCache.get(dams);
  if (!v) {
    v = {};
    for (const k of Object.keys(HILO_STATS)) v[k] = dams.flatMap((d, i) => (statOk(d, k) ? [i] : []));
    validCache.set(dams, v);
  }
  return v;
}
export function hiloSequence(dams, seed, n) {
  const r = rngFrom("hilo:" + seed), valid = validIdx(dams), steps = [];
  let a = Math.floor(r() * dams.length);
  for (let i = 0; i < n; i++) {
    const ks = Object.keys(HILO_STATS).filter((k) => statOk(dams[a], k) && valid[k].length >= 8);
    const k = ks[Math.floor(r() * ks.length)], list = valid[k];
    let b = a;
    for (let g = 0; g < 100 && (b === a || dams[b][k] === dams[a][k]); g++) b = list[Math.floor(r() * list.length)];
    steps.push({ k, a, b });
    a = b;
  }
  return steps;
}
export const hiloCorrect = (va, vb, guess) => vb === va || (guess === "h" ? vb > va : vb < va);
export function hiloScore(dams, seed, answers) {
  if (!Array.isArray(answers) || !answers.length || answers.length > HILO_CAP + 1 || !answers.every((x) => x === "h" || x === "l")) return null;
  const steps = hiloSequence(dams, seed, answers.length);
  let s = 0;
  for (let i = 0; i < answers.length; i++) {
    const { k, a, b } = steps[i];
    if (!hiloCorrect(dams[a][k], dams[b][k], answers[i])) return i === answers.length - 1 ? { score: s } : null; // doit s'arrêter à la 1re erreur
    s++;
  }
  return s >= HILO_CAP ? { score: s } : null; // pas d'erreur : valide seulement si plafond atteint
}

// ---------- Mode 3 : barrage du jour ----------
export function dailyIndex(dams, date) {
  const top = dams.flatMap((d, i) => (d.f === 3 ? [i] : []));
  return top[xfnv1a("daily:" + date) % top.length];
}
export function dailyScore(dams, date, guesses, info = WORLD) {
  if (!Array.isArray(guesses) || !guesses.length || guesses.length > DAILY_TRIES || !guesses.every((g) => okPoint(g))) return null;
  const d = dams[dailyIndex(dams, date)];
  let best = Infinity;
  for (let i = 0; i < guesses.length; i++) {
    const km = distanceKm(guesses[i][0], guesses[i][1], d.la, d.lo);
    best = Math.min(best, km);
    if (km <= info.foundKm) return i === guesses.length - 1 ? { score: 5000 - 700 * i, found: true, tries: i + 1 } : null;
  }
  if (guesses.length < DAILY_TRIES) return null; // partie inachevée
  return { score: Math.round(1400 * Math.exp(-best / info.scale)), found: false, tries: DAILY_TRIES };
}

// ---------- Mode 4 : mission cartographe (compléter les coordonnées manquantes du registre) ----------
// 5 manches : 2 « étalons » (barrages connus, notés) + 3 barrages SANS coordonnées (le joueur propose un emplacement).
export function pickMissionRounds(known, missing, seed) {
  const r = rngFrom("mission:" + seed), k = [], m = [];
  for (let g = 0; k.length < MISSION_KNOWN && g < 500; g++) { const i = Math.floor(r() * known.length); if (!k.includes(i)) k.push(i); }
  for (let g = 0; m.length < MISSION_UNKNOWN && g < 500; g++) { const i = Math.floor(r() * missing.length); if (!m.includes(i)) m.push(i); }
  const rounds = [...k.map((i) => ({ src: "k", i })), ...m.map((i) => ({ src: "m", i }))];
  for (let i = rounds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rounds[i], rounds[j]] = [rounds[j], rounds[i]]; }
  return rounds;
}
export function missionScore(known, missing, seed, guesses) {
  const n = MISSION_KNOWN + MISSION_UNKNOWN;
  if (!Array.isArray(guesses) || guesses.length !== n || !guesses.every((g) => okPoint(g))) return null;
  const rounds = pickMissionRounds(known, missing, seed);
  let pts = 0, kn = 0; const contrib = [];
  rounds.forEach((rd, idx) => {
    const g = guesses[idx];
    if (rd.src === "k") { const d = known[rd.i]; pts += mapPoints(distanceKm(g[0], g[1], d.la, d.lo)); kn++; }
    else contrib.push({ id: missing[rd.i].id, la: g[0], lo: g[1] });
  });
  const trust = pts / (kn * 5000);
  return { score: pts + MISSION_BONUS * contrib.length, trust, contrib };
}
// médiane géographique pondérée simple (lat/lon séparées) + dispersion maximale autour d'elle
export function consensus(points) {
  const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const la = med(points.map((p) => p.la)), lo = med(points.map((p) => p.lo));
  return { la, lo, n: points.length, spread: Math.max(...points.map((p) => distanceKm(la, lo, p.la, p.lo))) };
}
