import registerStats from "../public/data/stats.json";
import datasetMetadata from "../public/data/version.json";
const DATASET_VERSION=datasetMetadata.version+":"+datasetMetadata.fingerprint;
import { publicDamPage } from "./public-pages.js";
import dams from "../public/data/dams.json";
import countries from "../public/data/countries.json";
import missing from "../public/data/missing.json";
import photos from "../public/data/photos.json";
import { mapScore, dailyScore, missionScore, consensus, poolInfo, continentPool, CONTINENTS, WORLD, levelPool, poolUsable, LEVELS, MAP_ROUNDS } from "../public/js/shared.js";

import { Store } from "./storage.js";
const db=env=>new Store(env.DB);
const MODES = ["map", "daily", "mission"];
const TOP_N = 50;            // il faut être dans le top 50 pour pouvoir inscrire son nom
const SESSION_TTL = 2 * 3600 * 1000;
const MIN_MS = { map: 3000 * MAP_ROUNDS, mission: 3000 * MAP_ROUNDS, daily: 3000 }; // temps minimum plausible (par manche / par réponse)
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,15}$/u;
const SUBMITS_PER_HOUR = 10;
const CONTRIB_PER_HOUR = 60;      // propositions de coordonnées max par IP et par heure
const MIN_TRUST = 0.15;           // en dessous (clics au hasard sur les barrages étalons), les propositions ne sont pas retenues
const missingIds = new Set(missing.map((m) => m.id));
const ISOS = new Set(countries.map((c) => c.iso));
const poolCache = new Map(); // ISO -> {pool, info} (reste en mémoire tant que l'isolate vit)

// pool de barrages de la zone de jeu : le monde (embarqué) ou un pays (fichier statique servi par ASSETS)
async function getPool(env, request, scope) {
  if (scope === "world") return { pool: dams, info: poolInfo(dams, "world") };
  if (scope.startsWith("ct:")) {   // continent : sous-ensemble du pool monde
    if (!poolCache.has(scope)) { const pool = continentPool(dams, scope.slice(3)); poolCache.set(scope, { pool, info: poolInfo(pool, scope) }); }
    return poolCache.get(scope);
  }
  if (!poolCache.has(scope)) {
    const r = await env.ASSETS.fetch(new URL(`/data/country/${scope}.json`, request.url));
    if (!r.ok) return null;
    const pool = await r.json();
    poolCache.set(scope, { pool, info: poolInfo(pool, scope) });
  }
  return poolCache.get(scope);
}
const okScope = (sc) => sc === "world" || ISOS.has(sc) || (typeof sc === "string" && sc.startsWith("ct:") && !!CONTINENTS[sc.slice(3)]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options":"nosniff", "referrer-policy":"no-referrer" } });
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
  if (env.IP_MODE === "raw") return ip;
  return b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode("ip:" + ip))).slice(0, 22);
}

const today = () => new Date().toISOString().slice(0, 10);
const periodFor = (mode, sess) => (mode === "daily" ? sess.seed : "all");

// ---------- routes ----------
async function startSession(request, env) {
  const { mode, scope = "world", level } = await request.json().catch(() => ({}));
  if (!MODES.includes(mode) || !okScope(scope) || (mode === "mission" && scope !== "world")) return fail("bad_mode");
  if (mode === "map" && level !== undefined && !LEVELS.includes(level)) return fail("bad_mode");
  const seed = mode === "daily" ? today() : crypto.randomUUID().slice(0, 8);
  const sess = { m: mode, sc: scope, seed, v: DATASET_VERSION, t: Date.now(), id: crypto.randomUUID(), ...(mode === "map" ? { lv: level ?? "hard" } : {}) };
  return json({ token: await sign(env, sess), seed, mode, scope });
}

async function finish(request, env) {
  const body = await request.json().catch(() => ({}));
  const sess = await verify(env, body.token);
  if (!sess || sess.k) return fail("invalid_session", 401);
  const age = Date.now() - sess.t;
  if(age<0 || age>SESSION_TTL || sess.v!==DATASET_VERSION)return fail("expired",410);
  const payloadHash=b64u(await crypto.subtle.digest("SHA-256",enc.encode(JSON.stringify({guesses:body.guesses,evidence:body.evidence||[]}))));
  const saved=await db(env).first("SELECT payload_hash,response FROM finished_games WHERE sid=?",sess.id);
  if(saved&&saved.payload_hash!==payloadHash)return fail("invalid_game",409);
  if(saved?.response)return json(JSON.parse(saved.response));

  const zone = okScope(sess.sc) && (await getPool(env, request, sess.sc));
  if (!zone) return fail("invalid_session", 401);
  let res;
  if (sess.m === "map") {
    const lp = levelPool(sess.lv || "hard", sess.sc, zone.pool, photos);   // même pool que le client : photos célèbres / moins connues / barrages sans photo
    if (!poolUsable(lp, zone.info.distinct)) return fail("invalid_game");
    res = mapScore(lp, sess.seed, body.guesses, zone.info);
  }
  else if (sess.m === "daily") res = dailyScore(zone.pool, sess.seed, body.guesses, zone.info);
  else if (sess.m === "mission") res = missionScore(dams, missing, sess.seed, body.guesses);
  if (!res) return fail("invalid_game");

  const units = sess.m === "daily" ? body.guesses.length : 1;
  if (age < MIN_MS[sess.m] * units) return fail("too_fast", 422);

  await db(env).run("INSERT OR IGNORE INTO finished_games(sid,payload_hash,response) VALUES(?,?,'')",sess.id,payloadHash);
  const lock=await db(env).run("UPDATE finished_games SET lock_until=? WHERE sid=? AND payload_hash=? AND response='' AND lock_until<?",Date.now()+60000,sess.id,payloadHash,Date.now());
  if(!lock.meta?.changes)return fail("rate",409);
  try{
  let community=null;
  if(sess.m==="mission")community=await storeContributions(request,env,sess,res,body.evidence);
  if(community)res.score+=community.saved*500;
  const period = periodFor(sess.m, sess), board = sess.m === "map" ? `map:${sess.lv || "hard"}` : sess.m;   // un classement par niveau
  const { results } = {results:await db(env).all("SELECT COUNT(*) AS n FROM scores WHERE scope=?4 AND mode=?1 AND period=?2 AND hidden=0 AND score>?3",board,period,res.score,sess.sc)};
  const qualifies = res.score > 0 && results[0].n < TOP_N;
  const claim = qualifies ? await sign(env, { k: 1, m: board, sc: sess.sc, p: period, s: res.score, id: sess.id, t: Date.now() }) : null;
  const { contrib, ...pub } = res;
  const response={...pub,qualifies,claim,rank:results[0].n+1,community};
  await db(env).run("UPDATE finished_games SET response=?,lock_until=0 WHERE sid=?",JSON.stringify(response),sess.id);
  const committed=await db(env).first("SELECT payload_hash,response FROM finished_games WHERE sid=?",sess.id);
  return committed.payload_hash===payloadHash?json(JSON.parse(committed.response)):fail("invalid_game",409);
  }catch(e){await db(env).run("UPDATE finished_games SET lock_until=0 WHERE sid=? AND response=''",sess.id);throw e;}
}

// ---------- mission cartographe : propositions de coordonnées pour les barrages sans géolocalisation ----------
function evidenceOf(e){
  try{
    const u=new URL(e.source),accuracy=Number(e.accuracy_km);
    if(!["https:","http:"].includes(u.protocol)||u.username||u.password||u.href.length>1000||!Number.isFinite(accuracy)||accuracy<=0||accuracy>500)return null;
    return {source:u.href,comment:String(e.comment||"").trim().slice(0,1000),accuracy};
  }catch{return null;}
}
async function storeContributions(request,env,sess,res,evidence=[]){
  const out={saved:0,trust:Math.round(res.trust*100),items:[]};
  if(res.trust<MIN_TRUST)return out;
  const ip=await playerIp(request,env);
  for(const c of res.contrib){
    const e=evidenceOf(Array.isArray(evidence)?evidence.find(x=>x.id===c.id):null);
    if(!missingIds.has(c.id)||!e){out.items.push({id:c.id,others:0,status:"missing_source"});continue;}
    const r=await db(env).run("INSERT OR IGNORE INTO contributions (sid,dam_id,la,lo,trust,ip,source,comment,accuracy_km,dataset_version) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM contributions WHERE dam_id=? AND ip=?) AND (SELECT COUNT(*) FROM contributions WHERE ip=? AND created_at>datetime('now','-1 hour'))<60",
      sess.id,c.id,c.la,c.lo,res.trust,ip,e.source,e.comment,e.accuracy,sess.v,c.id,ip,ip);
    const own=await db(env).first("SELECT id FROM contributions WHERE sid=? AND dam_id=?",sess.id,c.id);
    if(own)out.saved++;
    const others=await db(env).all("SELECT la,lo,trust FROM contributions WHERE dam_id=? AND ip!=? AND ip IS NOT NULL AND trust>=0.3 AND source!='' AND status!='rejected'",c.id,ip);
    const cons=consensus(others);
    out.items.push({id:c.id,others:others.length,kmToCommunity:cons?Math.round(distance(c,cons)):null,status:r.meta?.changes?"proposed":"already_proposed"});
  }
  return out;
}
const distance=(a,b)=>{
  const r=Math.PI/180,x=Math.sin((b.la-a.la)*r/2)**2+Math.cos(a.la*r)*Math.cos(b.la*r)*Math.sin((b.lo-a.lo)*r/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(x)));
};
async function consensusRows(env){
  const results=await db(env).all("SELECT c.dam_id,c.la,c.lo,c.trust FROM contributions c WHERE c.ip IS NOT NULL AND c.trust>=0.3 AND c.source!='' AND c.accuracy_km<=5 AND c.status!='rejected' AND c.id=(SELECT MAX(x.id) FROM contributions x WHERE x.dam_id=c.dam_id AND x.ip=c.ip AND x.status!='rejected') ORDER BY c.id");
  const by=new Map();for(const r of results){if(!by.has(r.dam_id))by.set(r.dam_id,[]);by.get(r.dam_id).push(r);}
  return [...by].map(([id,pts])=>({id,...consensus(pts),trust:+(pts.reduce((s,p)=>s+p.trust,0)/pts.length).toFixed(2)}));
}
async function missionProgress(env){
  const rows=await consensusRows(env),counts=await db(env).first("SELECT COUNT(*) AS n,COUNT(DISTINCT ip) AS p,COUNT(DISTINCT dam_id) AS d FROM contributions");
  const accepted=await db(env).first("SELECT COUNT(*) AS n FROM contribution_reviews r WHERE status='accepted' AND id=(SELECT MAX(id) FROM contribution_reviews WHERE dam_id=r.dam_id)");
  return json({proposals:counts.n,contributors:counts.p,damsTouched:counts.d,validated:rows.filter(r=>r.ready&&!r.conflicted).length,accepted:accepted.n,pool:missing.length,totalMissing:registerStats.total-registerStats.geo});
}
const isAdmin=(request,env)=>env.ADMIN_TOKEN&&request.headers.get("Authorization")==="Bearer "+env.ADMIN_TOKEN;
async function adminContributions(request,url,env){
  if(!isAdmin(request,env))return fail("invalid_claim",401);
  const meta=new Map(missing.map(m=>[m.id,m]));
  const rows=(await consensusRows(env)).map(r=>({dam_id:r.id,name:meta.get(r.id)?.n,country:meta.get(r.id)?.ce,lat:+r.la.toFixed(5),lon:+r.lo.toFixed(5),independent_votes:r.n,total_votes:r.total,outliers:r.outliers,spread_km:Math.round(r.spread),avg_trust:r.trust,status:r.ready&&!r.conflicted?"ready_for_review":"needs_more_votes"}));
  if(url.searchParams.get("format")==="csv"){
    const head=Object.keys(rows[0]||{dam_id:0}),cell=v=>'"'+String(v??"").replace(/^[\s=+@-]/,"'$&").replace(/"/g,'""')+'"';
    return new Response([head.map(cell).join(","),...rows.map(r=>head.map(k=>cell(r[k])).join(","))].join("\r\n"),
      {headers:{"content-type":"text/csv; charset=utf-8","cache-control":"no-store","content-disposition":"attachment; filename=geodam-contributions.csv"}});
  }
  return json({rows});
}
async function reviewContribution(request,env){
  if(!isAdmin(request,env))return fail("invalid_claim",401);
  const b=await request.json();
  if(!missingIds.has(b.dam_id)||!["in_review","accepted","rejected"].includes(b.status)||typeof b.note!=="string"||!b.note.trim()||b.note.length>1000||typeof b.reviewer!=="string"||!b.reviewer.trim()||b.reviewer.length>100)return fail("invalid_game");
  if(b.status==="accepted"&&(!Number.isFinite(b.lat)||Math.abs(b.lat)>90||!Number.isFinite(b.lon)||Math.abs(b.lon)>180))return fail("invalid_game");
  const proposals=await db(env).all("SELECT id,la,lo FROM contributions WHERE dam_id=?",b.dam_id);
  if(!proposals.length)return fail("invalid_game");
  const changes=proposals.map(p=>["UPDATE contributions SET status=? WHERE id=?",b.status==="accepted"?(distance(p,{la:b.lat,lo:b.lon})<=5?"accepted":"rejected"):b.status,p.id]);
  await db(env).batch([
    ["INSERT INTO contribution_reviews(dam_id,status,lat,lon,note,reviewer) VALUES(?,?,?,?,?,?)",b.dam_id,b.status,b.status==="accepted"?b.lat:null,b.status==="accepted"?b.lon:null,b.note,b.reviewer],
    ...changes
  ]);return json({ok:true});
}
async function contributionDetail(request,url,env){
  if(!isAdmin(request,env))return fail("invalid_claim",401);
  const id=url.searchParams.get("id");
  return json({proposals:await db(env).all("SELECT id,dam_id,la,lo,trust,source,comment,accuracy_km,dataset_version,status,created_at FROM contributions WHERE dam_id=? ORDER BY id DESC",id),
    history:await db(env).all("SELECT status,lat,lon,note,reviewer,created_at FROM contribution_reviews WHERE dam_id=? ORDER BY id DESC",id)});
}
async function contributionStatus(request,env){
  const {token}=await request.json(),sess=await verify(env,token);
  if(!sess||sess.k||sess.m!=="mission"||Date.now()-sess.t>90*864e5)return fail("invalid_session",401);
  return json({items:await db(env).all("SELECT dam_id AS id,status FROM contributions WHERE sid=?",sess.id)});
}
async function rateLimit(request,env,path){
  const ip=await playerIp(request,env),bucket=Math.floor(Date.now()/60000),key=path+":"+ip;
  const max=path==="/api/session"?20:path.startsWith("/api/admin/")?60:120;
  const row=await db(env).first("INSERT INTO api_limits(key,bucket,n) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET n=n+1 RETURNING n",key,bucket);
  return row.n<=max;
}
async function purge(env){
  await db(env).batch([
    ["UPDATE scores SET ip=NULL,ua=NULL,country=NULL WHERE created_at<datetime('now','-90 days') AND (ip IS NOT NULL OR ua IS NOT NULL OR country IS NOT NULL)"],
    ["UPDATE contributions SET ip=NULL WHERE created_at<datetime('now','-90 days') AND ip IS NOT NULL"],
    ["DELETE FROM api_limits WHERE bucket<?",Math.floor(Date.now()/60000)-1440],
    ["DELETE FROM finished_games WHERE created_at<datetime('now','-1 day')"]
  ]);
}
async function submit(request, env) {
  const body = await request.json().catch(() => ({}));
  const c = await verify(env, body.claim);
  if (!c || !c.k) return fail("invalid_claim", 401);
  if (Date.now() - c.t > 15 * 60 * 1000) return fail("claim_expired", 410);
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) return fail("bad_name");

  const ip = await playerIp(request, env);
  const recent=await db(env).all("SELECT COUNT(*) AS n FROM scores WHERE ip=?1 AND created_at>datetime('now','-1 hour')",ip);
  if (recent[0].n >= SUBMITS_PER_HOUR) return fail("rate", 429);
  if (c.m === "daily") {
    const dup=await db(env).all("SELECT 1 FROM scores WHERE mode='daily' AND scope=?3 AND period=?1 AND ip=?2",c.p,ip,c.sc);
    if (dup.length) return fail("dup_daily", 409);
  }
  try {
    const inserted=await db(env).run("INSERT INTO scores(sid,mode,scope,period,name,score,ip,country,ua) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE (SELECT COUNT(*) FROM scores WHERE ip=?7 AND created_at>datetime('now','-1 hour'))<10",
      c.id,c.m,c.sc,c.p,name,c.s,ip,request.cf?.country??null,(request.headers.get("User-Agent")||"").slice(0,200));
    if(!inserted.meta?.changes)return fail("rate",429);
  } catch { return fail("dup", 409); }
  return json({ ok: true });
}

async function leaderboard(url, env) {
  const mode = url.searchParams.get("mode");
  const scope = url.searchParams.get("scope") || "world", level = url.searchParams.get("level") || "hard";
  if (!MODES.includes(mode) || !okScope(scope) || !LEVELS.includes(level)) return fail("bad_mode");
  const period = mode === "daily" ? (url.searchParams.get("period") || today()) : "all";
  const results=await db(env).all("SELECT name,score,country,created_at FROM scores WHERE scope=?3 AND mode=?1 AND period=?2 AND hidden=0 ORDER BY score DESC,id ASC LIMIT 20",mode==="map"?"map:"+level:mode,period,scope);
  return json({ mode, scope, period, entries: results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(!url.pathname.startsWith("/api/")){
      if(!["GET","HEAD"].includes(request.method))return fail("not_found",405);
      try{return await publicDamPage(request,env) || await env.ASSETS.fetch(request);}catch{return new Response("Public page unavailable",{status:503});}
    }
    if(!env.SECRET || env.SECRET.length<24)return fail("server",500);
    try {
      if(request.method==="POST"){
        if(Number(request.headers.get("content-length")||0)>16384)return fail("invalid_game",413);
        if(!request.headers.get("content-type")?.startsWith("application/json"))return fail("invalid_game",415);
        const origin=request.headers.get("origin");if(origin&&origin!==url.origin)return fail("invalid_claim",403);
        const reader=request.body?.getReader();let size=0;const chunks=[];
        if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return fail("invalid_game",413);}chunks.push(value);}}
        const cf=request.cf;
        const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
        request=new Request(request.url,{method:request.method,headers:request.headers,body:bytes,cf});
      }
      const routes=new Set(["/api/session","/api/finish","/api/submit","/api/leaderboard","/api/mission/progress","/api/mission/status","/api/admin/review","/api/admin/detail","/api/admin/contributions"]);
      if(!routes.has(url.pathname))return fail("not_found",404);
      if(!await rateLimit(request,env,url.pathname))return fail("rate",429);
      if(url.pathname==="/api/admin/review"&&request.method==="POST")return await reviewContribution(request,env);
      if(url.pathname==="/api/admin/detail"&&request.method==="GET")return await contributionDetail(request,url,env);
      if(url.pathname==="/api/mission/status"&&request.method==="POST")return await contributionStatus(request,env);
      if (url.pathname === "/api/session" && request.method === "POST") return await startSession(request, env);
      if (url.pathname === "/api/finish" && request.method === "POST") return await finish(request, env);
      if (url.pathname === "/api/submit" && request.method === "POST") return await submit(request, env);
      if (url.pathname === "/api/leaderboard" && request.method === "GET") return await leaderboard(url, env);
      if (url.pathname === "/api/mission/progress" && request.method === "GET") return await missionProgress(env);
      if (url.pathname === "/api/admin/contributions" && request.method === "GET") return await adminContributions(request, url, env);
    } catch (e) { console.error("api error", e?.stack || e); return fail("server", 500); }
    return fail("not_found", 404);
  },
  async scheduled(event,env,ctx){ctx.waitUntil(purge(env));},
};
