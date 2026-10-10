import dams from "../public/data/dams.json";
import countries from "../public/data/countries.json";
import { mapScore, hiloScore, dailyScore, poolInfo, MAP_ROUNDS } from "../public/js/shared.js";

const MODES = ["map", "hilo", "daily"];
const TOP_N = 50;            // il faut être dans le top 50 pour pouvoir inscrire son nom
const SESSION_TTL = 2 * 3600 * 1000;
const MIN_MS = { map: 3000 * MAP_ROUNDS, daily: 3000, hilo: 1200 }; // temps minimum plausible (par manche / par réponse)
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,15}$/u;
const SUBMITS_PER_HOUR = 10;
const ISOS = new Set(countries.map((c) => c.iso));
const poolCache = new Map(); // ISO -> {pool, info} (reste en mémoire tant que l'isolate vit)

// pool de barrages de la zone de jeu : le monde (embarqué) ou un pays (fichier statique servi par ASSETS)
async function getPool(env, request, scope) {
  if (scope === "world") return { pool: dams, info: poolInfo(dams, "world") };
  if (!poolCache.has(scope)) {
    const r = await env.ASSETS.fetch(new URL(`/data/country/${scope}.json`, request.url));
    if (!r.ok) return null;
    const pool = await r.json();
    poolCache.set(scope, { pool, info: poolInfo(pool, scope) });
  }
  return poolCache.get(scope);
}
const okScope = (sc) => sc === "world" || ISOS.has(sc);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (code, status = 400) => json({ error: code }, status); // codes traduits côté client (i18n.js)

// ---------- signature HMAC (sessions et "claims" infalsifiables) ----------
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (env) => crypto.subtle.importKey("raw", enc.encode(env.SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sign(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}
async function verify(env, token) {
  if (typeof token !== "string" || token.split(".").length !== 2) return null;
  const [body, sig] = token.split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(sig), enc.encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(unb64u(body)));
  } catch { return null; }
}

async function playerIp(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (env.IP_MODE !== "hash") return ip;
  return b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode("ip:" + ip))).slice(0, 22);
}

const today = () => new Date().toISOString().slice(0, 10);
const periodFor = (mode, sess) => (mode === "daily" ? sess.seed : "all");

// ---------- routes ----------
async function startSession(request, env) {
  const { mode, scope = "world" } = await request.json().catch(() => ({}));
  if (!MODES.includes(mode) || !okScope(scope)) return fail("bad_mode");
  const seed = mode === "daily" ? today() : crypto.randomUUID().slice(0, 8);
  const sess = { m: mode, sc: scope, seed, t: Date.now(), id: crypto.randomUUID() };
  return json({ token: await sign(env, sess), seed, mode, scope });
}

async function finish(request, env) {
  const body = await request.json().catch(() => ({}));
  const sess = await verify(env, body.token);
  if (!sess || sess.k) return fail("invalid_session", 401);
  const age = Date.now() - sess.t;
  if (age > SESSION_TTL) return fail("expired", 410);

  const zone = okScope(sess.sc) && (await getPool(env, request, sess.sc));
  if (!zone) return fail("invalid_session", 401);
  let res;
  if (sess.m === "map") res = mapScore(zone.pool, sess.seed, body.guesses, zone.info);
  else if (sess.m === "hilo") res = hiloScore(zone.pool, sess.seed, body.answers);
  else if (sess.m === "daily") res = dailyScore(zone.pool, sess.seed, body.guesses, zone.info);
  if (!res) return fail("invalid_game");

  const units = sess.m === "map" ? 1 : sess.m === "daily" ? body.guesses.length : body.answers.length;
  if (age < MIN_MS[sess.m] * units) return fail("too_fast", 422);

  const period = periodFor(sess.m, sess);
  const { results } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scores WHERE scope=?4 AND mode=?1 AND period=?2 AND hidden=0 AND score>?3").bind(sess.m, period, res.score, sess.sc).all();
  const qualifies = res.score > 0 && results[0].n < TOP_N;
  const claim = qualifies ? await sign(env, { k: 1, m: sess.m, sc: sess.sc, p: period, s: res.score, id: sess.id, t: Date.now() }) : null;
  return json({ ...res, qualifies, claim, rank: results[0].n + 1 });
}

async function submit(request, env) {
  const body = await request.json().catch(() => ({}));
  const c = await verify(env, body.claim);
  if (!c || !c.k) return fail("invalid_claim", 401);
  if (Date.now() - c.t > 15 * 60 * 1000) return fail("claim_expired", 410);
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) return fail("bad_name");

  const ip = await playerIp(request, env);
  const { results: recent } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scores WHERE ip=?1 AND created_at > datetime('now','-1 hour')").bind(ip).all();
  if (recent[0].n >= SUBMITS_PER_HOUR) return fail("rate", 429);
  if (c.m === "daily") {
    const { results: dup } = await env.DB.prepare("SELECT 1 FROM scores WHERE mode='daily' AND scope=?3 AND period=?1 AND ip=?2").bind(c.p, ip, c.sc).all();
    if (dup.length) return fail("dup_daily", 409);
  }
  try {
    await env.DB.prepare(
      "INSERT INTO scores (sid,mode,scope,period,name,score,ip,country,ua) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
      .bind(c.id, c.m, c.sc, c.p, name, c.s, ip, request.cf?.country ?? null, (request.headers.get("User-Agent") || "").slice(0, 200)).run();
  } catch { return fail("dup", 409); }
  return json({ ok: true });
}

async function leaderboard(url, env) {
  const mode = url.searchParams.get("mode");
  const scope = url.searchParams.get("scope") || "world";
  if (!MODES.includes(mode) || !okScope(scope)) return fail("bad_mode");
  const period = mode === "daily" ? (url.searchParams.get("period") || today()) : "all";
  const { results } = await env.DB.prepare(
    "SELECT name, score, country, created_at FROM scores WHERE scope=?3 AND mode=?1 AND period=?2 AND hidden=0 ORDER BY score DESC, id ASC LIMIT 20")
    .bind(mode, period, scope).all();
  return json({ mode, scope, period, entries: results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.SECRET) return fail("server", 500);
    try {
      if (url.pathname === "/api/session" && request.method === "POST") return await startSession(request, env);
      if (url.pathname === "/api/finish" && request.method === "POST") return await finish(request, env);
      if (url.pathname === "/api/submit" && request.method === "POST") return await submit(request, env);
      if (url.pathname === "/api/leaderboard" && request.method === "GET") return await leaderboard(url, env);
    } catch (e) { return fail("server", 500); }
    return fail("not_found", 404);
  },
};
