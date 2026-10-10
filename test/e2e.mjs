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
const perfect = idx.map((i) => [dams[i].la, dams[i].lo]);
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

// ----- hilo : 4 bonnes réponses puis une erreur -----
const h = await post("/api/session", { mode: "hilo" });
const steps = S.hiloSequence(dams, h.seed, 5), ans = [];
steps.forEach(({ k, a, b }, i) => {
  const hi = dams[b][k] > dams[a][k];
  ans.push(i < 4 ? (hi ? "h" : "l") : (hi ? "l" : "h"));
});
await sleep(6500);
r = await post("/api/finish", { token: h.token, answers: ans });
check("hilo : série de 4", r.score === 4, JSON.stringify(r));
check("hilo : triche (pas d'erreur finale) refusée", (await post("/api/finish", { token: h.token, answers: ans.slice(0, 4) })).status === 400);

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

const lb = await (await fetch(BASE + "/api/leaderboard?mode=map")).json();
check("classement map contient le joueur", lb.entries.some((e) => e.name === "Test " + tag));
console.log(failed ? `\n${failed} échec(s)` : "\nTout est OK");
process.exit(failed ? 1 : 0);
