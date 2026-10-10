const VERSION="geodam-e5a801ad44022cf3";
const SHELL=VERSION+"-shell", DATA=VERSION+"-data";
const ROOT=new URL("./",self.location.href);
const CORE=["./","index.html","css/style.css","js/app.js","js/shared.js","js/i18n.js","js/lang-extra.js","js/api.js","js/pages.js","js/profile.js","js/ui.js","js/experience.js","vendor/leaflet/leaflet.js","vendor/leaflet/leaflet.css","manifest.webmanifest","icons/icon-192.png","data/dams.json","data/countries.json","data/stats.json","data/photos.json","data/version.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(SHELL).then(c=>c.addAll(CORE.map(p=>new URL(p,ROOT).href)))));
self.addEventListener("message",e=>{if(e.data?.type==="ACTIVATE_UPDATE")self.skipWaiting();});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("geodam-")&&![SHELL,DATA].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname)||u.pathname.includes("/api/"))return;
  e.respondWith((async()=>{
    const core=CORE.some(p=>new URL(p,ROOT).href===u.href);
    const cached=await caches.match(e.request);
    if(core&&cached)return cached; // Stable assets during a running game.
    try{
      const r=await fetch(e.request);
      if(r.ok){const c=await caches.open(DATA);await c.put(e.request,r.clone());const keys=await c.keys();if(keys.length>150)await c.delete(keys[0]);}
      return r;
    }catch{
      if(cached)return cached;
      if(e.request.mode==="navigate")return await caches.match(new URL("index.html",ROOT).href)||new Response("Offline",{status:503});
      return new Response("",{status:503,statusText:"Resource unavailable offline"});
    }
  })());
});
