// Logique de jeu partagée client + serveur : le Worker rejoue les parties pour recalculer le score.
export const MAP_ROUNDS = 5;
export const DAILY_TRIES = 6;
export const FOUND_KM = 25;
export const HILO_CAP = 60;
export const HILO_STATS = { h: "Hauteur (m)", v: "Volume du réservoir (hm³)", y: "Année de mise en service", mw: "Puissance installée (MW)" };

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
export const mapPoints = (km) => Math.round(5000 * Math.exp(-km / 1500));

const okPoint = (p) => Array.isArray(p) && p.length === 2 && Math.abs(p[0]) <= 90 && p.every(Number.isFinite);
export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

// ---------- Mode 1 : carte muette ----------
export function pickMapRounds(dams, seed) {
  const r = rngFrom("map:" + seed), out = [], iso = new Set();
  for (let g = 0; out.length < MAP_ROUNDS && g < 1000; g++) {
    const i = Math.floor(r() * dams.length);
    if (out.includes(i) || iso.has(dams[i].iso)) continue;
    iso.add(dams[i].iso); out.push(i);
  }
  return out;
}
export function mapScore(dams, seed, guesses) {
  if (!Array.isArray(guesses) || guesses.length !== MAP_ROUNDS || !guesses.every(okPoint)) return null;
  const rounds = pickMapRounds(dams, seed).map((i, k) => {
    const d = dams[i], km = distanceKm(guesses[k][0], guesses[k][1], d.la, d.lo);
    return { km, pts: mapPoints(km) };
  });
  return { score: rounds.reduce((s, r) => s + r.pts, 0), rounds };
}

// ---------- Mode 2 : plus haut / plus bas ----------
const validCache = new WeakMap();
function validIdx(dams) {
  let v = validCache.get(dams);
  if (!v) {
    v = {};
    for (const k of Object.keys(HILO_STATS)) v[k] = dams.flatMap((d, i) => (d[k] != null && (k !== "mw" || d.mw > 0) ? [i] : []));
    validCache.set(dams, v);
  }
  return v;
}
export function hiloSequence(dams, seed, n) {
  const r = rngFrom("hilo:" + seed), valid = validIdx(dams), steps = [];
  let a = Math.floor(r() * dams.length);
  for (let i = 0; i < n; i++) {
    const ks = Object.keys(HILO_STATS).filter((k) => dams[a][k] != null && (k !== "mw" || dams[a].mw > 0));
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
export function dailyScore(dams, date, guesses) {
  if (!Array.isArray(guesses) || !guesses.length || guesses.length > DAILY_TRIES || !guesses.every(okPoint)) return null;
  const d = dams[dailyIndex(dams, date)];
  let best = Infinity;
  for (let i = 0; i < guesses.length; i++) {
    const km = distanceKm(guesses[i][0], guesses[i][1], d.la, d.lo);
    best = Math.min(best, km);
    if (km <= FOUND_KM) return i === guesses.length - 1 ? { score: 5000 - 700 * i, found: true, tries: i + 1 } : null;
  }
  if (guesses.length < DAILY_TRIES) return null; // partie inachevée
  return { score: Math.round(1400 * Math.exp(-best / 1500)), found: false, tries: DAILY_TRIES };
}
