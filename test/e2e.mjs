// Test bout en bout contre `wrangler dev` : node test/e2e.mjs [http://127.0.0.1:8787]
import { readFileSync } from "node:fs";
import * as S from "../public/js/shared.js";

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const dams = JSON.parse(readFileSync(new URL("../public/data/dams.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name} ${extra}`); if (!cond) failed++; };
const post = async (path, body) => { const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
const tag = Math.random().toString(36).slice(2, 6);

// ----- map : parties parfaite + falsifiée -----
const m = await post("/api/session", { mode: "map" });
const idx = S.pickMapRounds(dams, m.seed);
const perfect = idx.map((i) => [dams[i].la, dams[i].lo, 0]);
let r = await post("/api/finish", { token: m.token, guesses: perfect });
check("map : trop rapide refusé", r.status === 422, JSON.stringify(r));
await sleep(15500);
r = await post("/api/finish", { token: m.token, guesses: perfect });
check("map : score parfait 25000", r.score === 25000 && r.qualifies && r.claim, JSON.stringify({ s: r.score, q: r.qualifies }));
check("map : token trafiqué refusé", (await post("/api/finish", { token: m.token.slice(0, -2) + "xx", guesses: perfect })).status === 401);
const bad = await post("/api/submit", { claim: r.claim, name: "<b>x</b>" });
check("pseudo invalide refusé", bad.status === 400, bad.error);
const ok = await post("/api/submit", { claim: r.claim, name: "Test " + tag });
check("map : score enregistré", ok.ok === true, JSON.stringify(ok));
check("map : claim rejouée refusée", (await post("/api/submit", { claim: r.claim, name: "Again " + tag })).status === 409);

// ----- indices : -10 % par indice utilisé ; indices hors plage refusés -----
const mh = await post("/api/session", { mode: "map" });
const hidx = S.pickMapRounds(dams, mh.seed);
await sleep(15500);
const hr = await post("/api/finish", { token: mh.token, guesses: hidx.map((i, k) => [dams[i].la, dams[i].lo, k === 0 ? 3 : 0]) });
check("indices : 3 indices = -30 % sur la manche", hr.score === 25000 - 1500, JSON.stringify({ s: hr.score, e: hr.error }));
check("indices : 4 indices refusés", (await post("/api/finish", { token: mh.token, guesses: hidx.map((i) => [dams[i].la, dams[i].lo, 4]) })).status === 400);

// ----- daily : trouvé du 1er coup -----
const d = await post("/api/session", { mode: "daily" });
const t = dams[S.dailyIndex(dams, d.seed)];
await sleep(3200);
r = await post("/api/finish", { token: d.token, guesses: [[t.la, t.lo]] });
check("daily : trouvé 5000", r.score === 5000 && r.found, JSON.stringify(r));
check("daily : score enregistré", (await post("/api/submit", { claim: r.claim, name: "Daily " + tag })).ok === true);
const d2 = await post("/api/session", { mode: "daily" });
await sleep(3200);
const r2 = await post("/api/finish", { token: d2.token, guesses: [[t.la, t.lo]] });
check("daily : 2e score même IP refusé", (await post("/api/submit", { claim: r2.claim, name: "Daily2 " + tag })).status === 409);

// ----- mode pays : Luxembourg-like petit pays (FR) et Chine complète -----
for (const iso of ["FR", "CN"]) {
  const pool = JSON.parse(readFileSync(new URL(`../public/data/country/${iso}.json`, import.meta.url), "utf8"));
  const info = S.poolInfo(pool, iso);
  const cs = await post("/api/session", { mode: "map", scope: iso });
  const rounds = S.pickMapRounds(pool, cs.seed, info.distinct);
  check(`${iso} : 5 manches distinctes`, rounds.length === 5 && new Set(rounds).size === 5);
  await sleep(15500);
  const cr = await post("/api/finish", { token: cs.token, guesses: rounds.map((i) => [pool[i].la, pool[i].lo, 0]) });
  check(`${iso} : score parfait (échelle ${Math.round(info.scale)} km)`, cr.score === 25000, JSON.stringify({ s: cr.score, e: cr.error }));
  const cok = await post("/api/submit", { claim: cr.claim, name: `Pays ${iso} ${tag}` });
  check(`${iso} : enregistré`, cok.ok === true, JSON.stringify(cok));
  const clb = await (await fetch(`${BASE}/api/leaderboard?mode=map&scope=${iso}`)).json();
  check(`${iso} : classement séparé du monde`, clb.entries.length >= 1 && clb.entries.every((e) => e.name.startsWith("Pays")));
}
check("scope inconnu refusé", (await post("/api/session", { mode: "map", scope: "XX" })).status === 400);
// ----- continent : sous-ensemble du monde, manches de pays distincts, classement propre -----
{
  const key = "EUROPE", pool = S.continentPool(dams, key), info = S.poolInfo(pool, "ct:" + key);
  const cs = await post("/api/session", { mode: "map", scope: "ct:" + key });
  const rounds = S.pickMapRounds(pool, cs.seed, info.distinct);
  check("continent : 5 manches, pays distincts", rounds.length === 5 && new Set(rounds.map((i) => pool[i].iso)).size === 5);
  await sleep(15500);
  const cr = await post("/api/finish", { token: cs.token, guesses: rounds.map((i) => [pool[i].la, pool[i].lo, 0]) });
  check(`continent : score parfait (échelle ${Math.round(info.scale)} km)`, cr.score === 25000, JSON.stringify({ s: cr.score, e: cr.error }));
  check("continent : enregistré", (await post("/api/submit", { claim: cr.claim, name: "Europe " + tag })).ok === true);
  const clb = await (await fetch(`${BASE}/api/leaderboard?mode=map&scope=ct:${key}`)).json();
  check("continent : classement séparé", clb.entries.length === 1 && clb.entries[0].name.startsWith("Europe"));
  check("continent inconnu refusé", (await post("/api/session", { mode: "map", scope: "ct:XX" })).status === 400);
  check("« plus haut / plus bas » retiré", (await post("/api/session", { mode: "hilo" })).status === 400);
}
// ----- mission cartographe : contributions + export protégé -----
const missing = JSON.parse(readFileSync(new URL("../public/data/missing.json", import.meta.url), "utf8"));
const ms = await post("/api/session", { mode: "mission" });
const mr = S.pickMissionRounds(dams, missing, ms.seed);
const mg = mr.map((rd) => (rd.src === "k" ? [dams[rd.i].la, dams[rd.i].lo] : [48.85 + Math.random() * 0.01, 2.35]));
await sleep(15500);
const mres = await post("/api/finish", { token: ms.token, guesses: mg });
check("mission : score = 2 étalons parfaits + 3 contributions", mres.score === 10000 + 3 * S.MISSION_BONUS, JSON.stringify({ s: mres.score, e: mres.error }));
check("mission : 3 propositions enregistrées", mres.community?.saved === 3 && mres.community.trust === 100, JSON.stringify(mres.community));
const again = await post("/api/finish", { token: ms.token, guesses: mg });
check("mission : rejouer le même token n'ajoute rien", again.community?.saved === 0);
const prog = await (await fetch(BASE + "/api/mission/progress")).json();
check("mission : progression visible", prog.proposals >= 3 && prog.damsTouched >= 3, JSON.stringify(prog));
check("export admin refusé sans jeton", (await fetch(BASE + "/api/admin/contributions")).status === 401);
const adm = await fetch(BASE + "/api/admin/contributions", { headers: { Authorization: "Bearer dev-admin-token" } });
check("export admin avec jeton", adm.status === 200 && (await adm.json()).rows.length >= 3);
const ms2 = await post("/api/session", { mode: "mission" });
const mr2 = S.pickMissionRounds(dams, missing, ms2.seed);
await sleep(15500);
const lazy = await post("/api/finish", { token: ms2.token, guesses: mr2.map(() => [-60, -120]) });
check("mission : clics au hasard sur les étalons => propositions écartées", lazy.community?.saved === 0 && lazy.community.trust < 15, JSON.stringify(lazy.community));
check("mission refusée hors monde", (await post("/api/session", { mode: "mission", scope: "FR" })).status === 400);

// ----- photo-mystère : même barème que la carte, pool de photos libres -----
{
  const photos = JSON.parse(readFileSync(new URL("../public/data/photos.json", import.meta.url), "utf8"));
  const ps = await post("/api/session", { mode: "photo" });
  const pr = S.pickMapRounds(photos, ps.seed, true);
  check("photo : 5 manches de pays distincts", pr.length === 5 && new Set(pr.map((i) => photos[i].iso)).size === 5);
  await sleep(15500);
  const pres = await post("/api/finish", { token: ps.token, guesses: pr.map((i) => [photos[i].la, photos[i].lo, 0]) });
  check("photo : score parfait 25000", pres.score === 25000, JSON.stringify({ s: pres.score, e: pres.error }));
  check("photo refusée hors monde", (await post("/api/session", { mode: "photo", scope: "FR" })).status === 400);
}

const lb = await (await fetch(BASE + "/api/leaderboard?mode=map")).json();
check("classement map contient le joueur", lb.entries.some((e) => e.name === "Test " + tag));
console.log(failed ? `\n${failed} échec(s)` : "\nTout est OK");
process.exit(failed ? 1 : 0);
