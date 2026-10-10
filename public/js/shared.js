// Logique de jeu partagée client + serveur : le Worker (ou le mode démo) rejoue les parties pour recalculer le score.
export const MAP_ROUNDS = 5;
export const DAILY_TRIES = 6;
export const MAX_HINTS = 3;       // indices payants en carte muette : -10 % du score de la manche par indice
export const HINT_COST = 0.1;
export const MISSION_KNOWN = 2;   // manches « étalon » (coordonnées connues) servant à pondérer la confiance
export const MISSION_UNKNOWN = 3; // manches où le joueur propose une localisation pour un barrage sans coordonnées
export const MISSION_BONUS = 500; // points par contribution
// Continents jouables : regroupent les valeurs « Continent » du registre. Scope = "ct:" + clé (ex. "ct:EUROPE").
export const CONTINENTS = { EUROPE: ["EUROPE"], ASIA: ["ASIA"], AFRICA: ["AFRICA"], NAMERICA: ["AMERICA N.", "AMERICA C."], SAMERICA: ["AMERICA S."], OCEANIA: ["AUSTRAL-ASIA"] };
export const continentPool = (dams, key) => dams.filter((d) => CONTINENTS[key]?.includes(d.ct));

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
// Emprise « robuste » d'un ensemble de barrages : on ignore les 2 % de points les plus excentrés (outre-mer, Alaska, Hawaï…)
// pour que la carte se cadre sur le territoire principal (ex. la France hexagonale).
export function robustBox(dams) {
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
  const la = dams.map((d) => d.la), lo = dams.map((d) => d.lo), p = dams.length >= 100 ? 0.01 : 0;
  return [q(la, p), q(lo, p), q(la, 1 - p), q(lo, 1 - p)]; // [sud, ouest, nord, est]
}
export function poolInfo(dams, scope) {
  if (scope === "world") return WORLD;
  const [s, w, n, e] = robustBox(dams);
  const scale = Math.min(1500, Math.max(30, distanceKm(s, w, n, e) / 6));
  // un continent mélange des pays (manches de pays distincts) ; un pays n'en a qu'un
  return { scale, foundKm: Math.max(3, scale / 60), distinct: scope.startsWith("ct:") };
}

const okPoint = (p, len = 2) => Array.isArray(p) && p.length === len && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p.every(Number.isFinite);
export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

// ---------- Niveaux de la carte : facile (photo + indices, barrages célèbres), moyen (photo seule, moins connus), difficile (indices seuls) ----------
export const LEVELS = ["easy", "medium", "hard"];
export const MIN_LEVEL_POOL = 8;
export const EASY_RANK = 500;     // en monde : les 500 premières photos (Wikidata trié par notoriété) ayant des indices du registre
// Un pool est jouable s'il a assez de barrages (et, hors pays, au moins 5 pays distincts pour les 5 manches).
export const poolUsable = (pool, distinct) => pool.length >= MIN_LEVEL_POOL && (!distinct || new Set(pool.map((d) => d.iso)).size >= MAP_ROUNDS);
export function levelPool(level, scope, dams, photos) {
  const inScope = (x) => scope === "world" || (scope.startsWith("ct:") ? CONTINENTS[scope.slice(3)]?.includes(x.ct) : x.iso === scope);
  const ph = photos.map((p, i) => [p, i]).filter(([p]) => inScope(p));
  const easy = ph.filter(([p, i]) => p.reg && (scope !== "world" || i < EASY_RANK)).map(([p]) => p);
  if (level === "easy") return easy;
  if (level === "medium") {
    const e = new Set(easy), rest = ph.map(([p]) => p).filter((p) => !e.has(p));
    return rest.length >= MIN_LEVEL_POOL ? rest : ph.map(([p]) => p);
  }
  const hard = dams.filter((d) => d.f === 2);   // barrages moins connus
  return hard.length >= 50 ? hard : dams;
}

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
  if (!Array.isArray(guesses) || guesses.length !== MAP_ROUNDS || !guesses.every((g) => okPoint(g, 3) && Number.isInteger(g[2]) && g[2] >= 0 && g[2] <= MAX_HINTS)) return null;
  const rounds = pickMapRounds(dams, seed, info.distinct).map((i, k) => {
    const d = dams[i], km = distanceKm(guesses[k][0], guesses[k][1], d.la, d.lo);
    return { km, pts: Math.round(mapPoints(km, info.scale) * hintFactor(guesses[k][2])) };
  });
  return { score: rounds.reduce((s, r) => s + r.pts, 0), rounds };
}

// ---------- Mode 2 : barrage du jour ----------
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

// ---------- Mode 3 : mission cartographe (compléter les coordonnées manquantes du registre) ----------
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
  return { score: pts, trust, contrib };
}
// Weighted spherical consensus. Candidates always require human review.
export function consensus(points) {
  const valid=points.filter(p=>Number.isFinite(p.la)&&Number.isFinite(p.lo)&&Math.abs(p.la)<=90&&Math.abs(p.lo)<=180);
  if(!valid.length)return null;
  const weight=p=>Math.max(0.01,Math.min(1,Number(p.trust)||0.3));
  const mean=ps=>{
    let x=0,y=0,z=0;
    for(const p of ps){const w=weight(p),a=p.la*rad,b=p.lo*rad;x+=w*Math.cos(a)*Math.cos(b);y+=w*Math.cos(a)*Math.sin(b);z+=w*Math.sin(a);}
    if(Math.hypot(x,y,z)<1e-9)return {la:ps[0].la,lo:ps[0].lo};
    return {la:Math.atan2(z,Math.hypot(x,y))/rad,lo:Math.atan2(y,x)/rad};
  };
  const clusters=[];
  for(const p of valid){
    const c=clusters.find(c=>distanceKm(p.la,p.lo,c.center.la,c.center.lo)<=10);
    if(c){c.points.push(p);c.center=mean(c.points);c.weight+=weight(p);}
    else clusters.push({points:[p],center:p,weight:weight(p)});
  }
  clusters.sort((a,b)=>b.weight-a.weight);
  const best=clusters[0],center=mean(best.points),spread=Math.max(...best.points.map(p=>distanceKm(center.la,center.lo,p.la,p.lo)));
  return {...center,n:best.points.length,total:valid.length,spread,outliers:valid.length-best.points.length,
    conflicted:!!clusters[1]&&clusters[1].weight>=best.weight*0.5,
    ready:best.points.length>=3&&spread<=5&&best.points.length/valid.length>=0.75};
}
