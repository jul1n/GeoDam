// Accès à l'API. Deux implémentations derrière la même fonction :
//  - réelle : Cloudflare Worker + D1 (api/…)
//  - démo   : GitHub Pages n'héberge que du statique, donc le serveur est simulé dans le navigateur
//             (scores locaux, aucune donnée envoyée). Activée sur *.github.io, avec ?demo=1 ou GEODAM.demo = true.
import * as S from "./shared.js";
import { t } from "./i18n.js";

export const DEMO = /\.github\.io$/.test(location.hostname) || new URLSearchParams(location.search).has("demo") || !!window.GEODAM?.demo;

let resolver = async () => null;                       // l'application fournit les pools (monde, pays, mission)
export const setResolver = (fn) => { resolver = fn; };

const fail = (code) => Object.assign(new Error(t("err." + code) !== "err." + code ? t("err." + code) : t("err.server")), { code });

export async function api(path, body) {
  if (DEMO) return demo(path, body);
  let r;
  try { r = await fetch("api/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); }
  catch { throw fail("net"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(j.error || "server");
  return j;
}

// ---------------------------------------------------------------- serveur simulé (démo)
const KEY = "geodam-demo-v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { lb: {}, contrib: [] }; } catch { return { lb: {}, contrib: [] }; } };
const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* navigation privée */ } };
const enc = (o) => "demo." + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/^demo\./, ""))))); } catch { return null; } };
const today = () => new Date().toISOString().slice(0, 10);
const SAMPLE = {   // joueurs fictifs pour que le classement ne soit pas vide en démo
  map: [["Hydro_Hugo", 21840], ["Crête_Clara", 19260], ["Turbine_Tom", 16410], ["Volta_Victor", 12975]],
  daily: [["Crête_Clara", 5000], ["Hydro_Hugo", 4300], ["Barrage_Betty", 3600], ["Turbine_Tom", 2200]],
  mission: [["Cartographe_Léa", 10780], ["Hydro_Hugo", 9120], ["Crête_Clara", 8260], ["Volta_Victor", 5410]],
};
const boardKey = (sc, m, p) => `${sc}|${m}|${p}`;

async function demo(path, body) {
  await new Promise((r) => setTimeout(r, 60));
  const [route, qs] = path.split("?"), q = new URLSearchParams(qs || ""), db = load();
  if (route === "session") {
    const { mode, scope = "world" } = body;
    const seed = mode === "daily" ? today() : Math.random().toString(36).slice(2, 10);
    const sess = { m: mode, sc: scope, seed, t: Date.now(), id: crypto.randomUUID() };
    return { token: enc(sess), seed, mode, scope };
  }
  if (route === "finish") {
    const sess = dec(body.token); if (!sess) throw fail("invalid_session");
    const zone = await resolver(sess.sc); if (!zone) throw fail("invalid_session");
    let res;
    if (sess.m === "map") res = S.mapScore(zone.pool, sess.seed, body.guesses, zone.info);
    else if (sess.m === "daily") res = S.dailyScore(zone.pool, sess.seed, body.guesses, zone.info);
    else if (sess.m === "mission") res = S.missionScore(zone.known, zone.missing, sess.seed, body.guesses);
    if (!res) throw fail("invalid_game");
    let community = null;
    if (sess.m === "mission") {
      community = { saved: 0, trust: Math.round(res.trust * 100), items: [] };
      if (res.trust >= 0.15) for (const c of res.contrib) {
        if (db.contrib.some((x) => x.sid === sess.id && x.id === c.id)) continue;
        const others = db.contrib.filter((x) => x.id === c.id);
        const cons = others.length ? S.consensus(others) : null;
        db.contrib.push({ ...c, sid: sess.id }); community.saved++;
        community.items.push({ id: c.id, others: others.length, kmToCommunity: cons ? Math.round(S.distanceKm(c.la, c.lo, cons.la, cons.lo)) : null });
      }
      save(db);
    }
    const period = sess.m === "daily" ? sess.seed : "all";
    const entries = board(db, sess.sc, sess.m, period);
    const { contrib, ...pub } = res;
    return { ...pub, qualifies: res.score > 0, claim: enc({ k: 1, m: sess.m, sc: sess.sc, p: period, s: res.score, id: sess.id }),
      rank: entries.filter((e) => e.score > res.score).length + 1, community };
  }
  if (route === "submit") {
    const c = dec(body.claim); if (!c || !c.k) throw fail("invalid_claim");
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,15}$/u.test(name)) throw fail("bad_name");
    const k = boardKey(c.sc, c.m, c.p);
    db.lb[k] = db.lb[k] || [];
    if (db.lb[k].some((e) => e.sid === c.id)) throw fail("dup");
    db.lb[k].push({ sid: c.id, name, score: c.s }); save(db);
    return { ok: true };
  }
  if (route === "leaderboard") {
    const mode = q.get("mode"), scope = q.get("scope") || "world", period = mode === "daily" ? today() : "all";
    return { mode, scope, period, entries: board(db, scope, mode, period).slice(0, 20), demo: true };
  }
  if (route === "mission/progress") {
    const ids = new Set(db.contrib.map((c) => c.id));
    return { proposals: db.contrib.length, contributors: db.contrib.length ? 1 : 0, damsTouched: ids.size, validated: 0, pool: 1522, totalMissing: 20267, demo: true };
  }
  throw fail("not_found");
}
function board(db, scope, mode, period) {
  const mine = db.lb[boardKey(scope, mode, period)] || [];
  const fake = scope === "world" ? (SAMPLE[mode] || []).map(([name, score]) => ({ name, score, sample: true })) : [];
  return [...mine, ...fake].sort((a, b) => b.score - a.score);
}
