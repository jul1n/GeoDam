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
  try { r = await fetch("api/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),signal:AbortSignal.timeout(15000) } : {signal:AbortSignal.timeout(15000)}); }
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
    const { mode, scope = "world", level } = body;
    const seed = mode === "daily" ? today() : Math.random().toString(36).slice(2, 10);
    const sess = { m: mode, sc: scope, seed, t: Date.now(), id: crypto.randomUUID(), ...(mode === "map" ? { lv: level ?? "hard" } : {}) };
    return { token: enc(sess), seed, mode, scope };
  }
  if (route === "finish") {
    const sess = dec(body.token); if (!sess) throw fail("invalid_session");
    db.finished=db.finished||{};
    const hash=JSON.stringify({guesses:body.guesses,evidence:body.evidence||[]});
    if(db.finished[sess.id]){
      if(db.finished[sess.id].hash!==hash)throw fail("invalid_game");
      return db.finished[sess.id].res;
    }
    const zone = await resolver(sess.sc); if (!zone) throw fail("invalid_session");
    let res;
    if (sess.m === "map") res = S.mapScore(S.levelPool(sess.lv || "hard", sess.sc, zone.pool, zone.photos), sess.seed, body.guesses, zone.info);
    else if (sess.m === "daily") res = S.dailyScore(zone.pool, sess.seed, body.guesses, zone.info);
    else if (sess.m === "mission") res = S.missionScore(zone.known, zone.missing, sess.seed, body.guesses);
    if (!res) throw fail("invalid_game");
    let community = null;
    if (sess.m === "mission") {
      community = { saved: 0, trust: Math.round(res.trust * 100), items: [] };
      if (res.trust >= 0.15) for (const c of res.contrib) {
        const e=body.evidence?.find(x=>x.id===c.id);
        let valid=false;try{valid=!!e&&["http:","https:"].includes(new URL(e.source).protocol)&&Number(e.accuracy_km)>0&&Number(e.accuracy_km)<=500;}catch{}
        if(!valid){community.items.push({id:c.id,status:"missing_source",others:0});continue;}
        if(db.contrib.some(x=>x.id===c.id)){community.items.push({id:c.id,status:"already_proposed",others:0});continue;}
        const others = db.contrib.filter((x) => x.id === c.id);
        const cons = others.length ? S.consensus(others) : null;
        db.contrib.push({...c,...e,sid:sess.id,status:"proposed"}); community.saved++;
        community.items.push({status:"proposed",id:c.id,others: others.length, kmToCommunity: cons ? Math.round(S.distanceKm(c.la, c.lo, cons.la, cons.lo)) : null });
      }
      save(db);
    }
    if(community)res.score+=community.saved*S.MISSION_BONUS;
    const period = sess.m === "daily" ? sess.seed : "all", bm = sess.m === "map" ? `map:${sess.lv || "hard"}` : sess.m;
    const entries = board(db, sess.sc, bm, period);
    const { contrib, ...pub } = res;
    const response={ ...pub, qualifies: res.score > 0, claim: enc({ k: 1, m: bm, sc: sess.sc, p: period, s: res.score, id: sess.id }),
      rank: entries.filter((e) => e.score > res.score).length + 1, community };
    db.finished[sess.id]={hash,res:response};save(db);return response;
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
    const mode = q.get("mode"), scope = q.get("scope") || "world", period = mode === "daily" ? today() : "all", key = mode === "map" ? `map:${q.get("level") || "hard"}` : mode;
    return { mode, scope, period, entries: board(db, scope, key, period).slice(0, 20), demo: true };
  }
  if(route==="mission/status"){const sess=dec(body.token);if(!sess)throw fail("invalid_session");return {items:db.contrib.filter(c=>c.sid===sess.id).map(c=>({id:c.id,status:c.status||"proposed"}))};}
  if (route === "mission/progress") {
    const ids=new Set(db.contrib.map(c=>c.id)),zone=await resolver("world");
    return { proposals: db.contrib.length, contributors: db.contrib.length ? 1 : 0, damsTouched: ids.size, validated: 0, pool:zone?.missing?.length||0,totalMissing:zone?.stats?zone.stats.total-zone.stats.geo:0, demo: true };
  }
  throw fail("not_found");
}
function board(db, scope, mode, period) {
  const mine = db.lb[boardKey(scope, mode, period)] || [];
  const fake = scope === "world" ? (SAMPLE[mode.split(":")[0]] || []).map(([name, score]) => ({ name, score, sample: true })) : [];
  return [...mine, ...fake].sort((a, b) => b.score - a.score);
}
