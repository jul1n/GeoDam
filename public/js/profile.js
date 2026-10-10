// Profil joueur local (aucun compte) : XP, niveaux, badges, série de jours. Stocké dans le navigateur.
const KEY = "geodam-profile-v1";
export const LEVELS = [0, 40, 120, 260, 450, 700, 1000, 1500, 2200];   // XP cumulée nécessaire pour chaque niveau
export const BADGES = {
  first: "🎮", eagle: "🦅", cartographer: "🛰️", mapper30: "🗺️", fire: "🔥", globe: "🌍", loyal: "📅", scholar: "📖", explorer: "🔎", perfect: "💎",
};
const blank = () => ({ xp: 0, c: {}, badges: [], scopes: [], streak: 0, last: "", bestHilo: 0 });
let p = blank();
try { p = { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { /* premier passage */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } };

export const get = () => p;
export function level() {
  let l = 0; while (l + 1 < LEVELS.length && p.xp >= LEVELS[l + 1]) l++;
  const lo = LEVELS[l], hi = LEVELS[l + 1] ?? LEVELS[l];
  return { n: l, xp: p.xp, lo, hi, pct: hi > lo ? Math.min(100, Math.round(((p.xp - lo) / (hi - lo)) * 100)) : 100 };
}
const count = (k, v = 1) => { p.c[k] = (p.c[k] || 0) + v; };
const RULES = {
  first: () => (p.c.games || 0) >= 1,
  eagle: () => (p.c.eagle || 0) >= 1,
  cartographer: () => (p.c.contrib || 0) >= 3,
  mapper30: () => (p.c.contrib || 0) >= 30,
  fire: () => p.bestHilo >= 10,
  globe: () => p.scopes.length >= 5,
  loyal: () => p.streak >= 3,
  scholar: () => (p.c.quizPerfect || 0) >= 1,
  explorer: () => (p.c.sheets || 0) >= 10,
  perfect: () => (p.c.perfect || 0) >= 1,
};

// Enregistre un événement de jeu ; renvoie { xp, levelUp, badges:[nouveaux] }.
export function award(ev) {
  const before = level().n;
  let xp = ev.xp || 0;
  if (ev.game) { count("games"); if (ev.scope && !p.scopes.includes(ev.scope)) p.scopes.push(ev.scope); }
  if (ev.eagle) count("eagle", ev.eagle);
  if (ev.contrib) count("contrib", ev.contrib);
  if (ev.sheet) count("sheets");
  if (ev.perfect) count("perfect");
  if (ev.quizPerfect) count("quizPerfect");
  if (ev.hilo) p.bestHilo = Math.max(p.bestHilo, ev.hilo);
  if (ev.daily) {
    const d = new Date(ev.daily + "T00:00:00Z"), prev = new Date(p.last + "T00:00:00Z");
    if (p.last !== ev.daily) { p.streak = p.last && (d - prev) / 864e5 === 1 ? p.streak + 1 : 1; p.last = ev.daily; xp += 10 * Math.min(p.streak, 5); }
  }
  p.xp += xp;
  const fresh = Object.keys(RULES).filter((b) => !p.badges.includes(b) && RULES[b]());
  p.badges.push(...fresh);
  save();
  return { xp, levelUp: level().n > before, badges: fresh };
}
