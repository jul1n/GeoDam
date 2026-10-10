// Profil joueur local (aucun compte) : XP, niveaux, badges, série de jours. Stocké dans le navigateur.
const KEY = "geodam-profile-v1";
export const LEVELS = [0, 40, 120, 260, 450, 700, 1000, 1500, 2200];   // XP cumulée nécessaire pour chaque niveau
export const BADGES = {
  first: "🎮", eagle: "🦅", cartographer: "🛰️", mapper30: "🗺️", globe: "🌍", loyal: "📅", scholar: "📖", explorer: "🔎", perfect: "💎",
};
const blank = () => ({ xp: 0, c: {}, badges: [], scopes: [], streak: 0, last: "", bestHilo: 0, learned: {}, events: [], missions: [], accepted: [] });
let p = blank();
export function validateProfile(value) {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid profile");
  const out=blank();
  if(!Number.isFinite(value.xp)||value.xp<0||value.xp>1e7)throw new Error("Invalid XP");
  out.xp=Math.floor(value.xp);
  for(const k of ["badges","scopes","events","accepted"])out[k]=Array.isArray(value[k])?value[k].filter(x=>typeof x==="string"&&x.length<200).slice(-2000):[];
  out.badges=out.badges.filter(x=>Object.hasOwn(BADGES,x));
  out.streak=Number.isInteger(value.streak)&&value.streak>=0?Math.min(value.streak,10000):0;
  out.last=/^\d{4}-\d{2}-\d{2}$/.test(value.last||"")?value.last:"";
  out.c=Object.fromEntries(Object.entries(value.c||{}).filter(([k,v])=>/^[a-zA-Z0-9]+$/.test(k)&&Number.isFinite(v)&&v>=0).map(([k,v])=>[k,Math.min(v,1e7)]));
  out.learned={};
  for(const [id,v] of Object.entries(value.learned||{}).slice(-5000)){
    if(id.length>100||!v||typeof v.n!=="string"||!Number.isFinite(v.km)||v.km<0)continue;
    out.learned[id]={n:v.n.slice(0,200),iso:String(v.iso||"").slice(0,2),km:v.km,last:Number(v.last)||0,next:Number(v.next)||0};
  }
  out.missions=Array.isArray(value.missions)?value.missions.filter(x=>typeof x.token==="string"&&x.token.length<3000&&Number.isFinite(x.date)).slice(-30):[];
  return out;
}
try{const v=JSON.parse(localStorage.getItem(KEY));if(v)p=validateProfile(v);}catch{}
export const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(p));return true;}catch{return false;}};
export const exportProfile=()=>JSON.stringify({format:"geodam-profile",version:2,profile:p},null,2);
export function importProfile(text){
  if(text.length>1000000)throw new Error("File too large");const v=JSON.parse(text);
  if(v.format!=="geodam-profile"||v.version!==2)throw new Error("Unsupported profile");
  const next=validateProfile(v.profile);localStorage.setItem(KEY,JSON.stringify(next));p=next;
}
export function remember(d,km){
  if(!d?.id||!Number.isFinite(km))return;
  const now=Date.now();p.learned[d.id]={n:d.n,iso:d.iso,km,last:now,next:now+(km>25?1:7)*864e5};save();
}
export const mistakes=()=>Object.keys(p.learned).filter(id=>p.learned[id].km>25||p.learned[id].next<=Date.now());
export function trackMission(token){if(!p.missions.some(m=>m.token===token)){p.missions.push({token,date:Date.now()});p.missions=p.missions.slice(-30);save();}}
export function acceptContribution(id){
  if(p.accepted.includes(id))return null;p.accepted.push(id);return award({id:"accepted:"+id,xp:25});
}

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
  globe: () => p.scopes.length >= 5,
  loyal: () => p.streak >= 3,
  scholar: () => (p.c.quizPerfect || 0) >= 1,
  explorer: () => (p.c.sheets || 0) >= 10,
  perfect: () => (p.c.perfect || 0) >= 1,
};

// Enregistre un événement de jeu ; renvoie { xp, levelUp, badges:[nouveaux] }.
export function award(ev) {
  if(ev.id&&p.events.includes(ev.id))return {xp:0,levelUp:false,badges:[]};
  if(ev.id){p.events.push(ev.id);p.events=p.events.slice(-2000);}
  const before = level().n;
  let xp = ev.xp || 0;
  if (ev.game) { count("games"); if (ev.scope && !p.scopes.includes(ev.scope)) p.scopes.push(ev.scope); }
  if (ev.eagle) count("eagle", ev.eagle);
  if (ev.contrib) count("contrib", ev.contrib);
  if (ev.sheet) count("sheets");
  if (ev.perfect) count("perfect");
  if (ev.quizPerfect) count("quizPerfect");
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
