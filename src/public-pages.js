const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const documents=new Map();
async function assetJson(env,request,path){
  const key=(env.DATASET_VERSION||"")+"|"+path;
  if(!documents.has(key)){
    const r=await env.ASSETS.fetch(new URL(path,request.url));
    if(!r.ok)throw new Error("Public data unavailable");
    documents.set(key,await r.json());
  }
  return documents.get(key);
}
export async function publicDamPage(request,env){
  const u=new URL(request.url),m=u.pathname.match(/^\/(fr|en)\/barrages\/([^/]+)\/?$/);
  if(!m)return null;
  const lang=m[1],id=decodeURIComponent(m[2]),fr=lang==="fr";
  const index=await assetJson(env,request,"/data/dam-index.json"),iso=index[id];
  if(!iso)return new Response("Dam not found",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
  if(!u.pathname.endsWith("/"))return Response.redirect(u.href+"/",308);
  const pool=await assetJson(env,request,"/data/country/"+iso+".json"),d=pool.find(d=>d.id===id);
  if(!d)return new Response("Dam not found",{status:404});
  const site=await assetJson(env,request,"/site.json"),base=site.url.replace(/\/$/,""),route="/"+lang+"/barrages/"+encodeURIComponent(id)+"/",canonical=base+route,other=lang==="fr"?"en":"fr";
  const title=d.n+" · GéoDam",desc=d.n+" · "+(fr?d.c:d.ce)+" · ICOLD 2025";
  const fields=[[fr?"Pays":"Country",fr?d.c:d.ce],[fr?"Cours d’eau":"River",d.r],[fr?"Hauteur":"Height",d.h!=null?d.h+" m":null],[fr?"Année":"Year",d.y],[fr?"Coordonnées":"Coordinates",d.la+", "+d.lo]];
  const html='<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><meta name="description" content="'+esc(desc)+'"><link rel="canonical" href="'+esc(canonical)+'"><link rel="alternate" hreflang="'+lang+'" href="'+esc(canonical)+'"><link rel="alternate" hreflang="'+other+'" href="'+esc(base+"/"+other+"/barrages/"+encodeURIComponent(id)+"/")+'"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(desc)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:type" content="website"><meta property="og:image" content="'+esc(base+"/icons/icon-512.png")+'"><meta name="twitter:card" content="summary"><link rel="stylesheet" href="/css/style.css"></head><body><a class="skip" href="#content">'+(fr?"Aller au contenu":"Skip to content")+'</a><header class="top"><div class="top-in"><a class="logo" href="/?lang='+lang+'">GéoDam</a><nav><a href="/'+lang+'/registre/">'+(fr?"Le registre":"The register")+'</a> · <a href="/'+other+'/barrages/'+encodeURIComponent(id)+'/">'+(fr?"English":"Français")+'</a></nav></div></header><main id="content"><h1>'+esc(d.n)+'</h1><dl class="kv">'+fields.filter(([,v])=>v!=null).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join("")+'</dl><p>'+(fr?"Source : registre ICOLD 2025 ; extrait public, précision dépendante de la source.":"Source: ICOLD 2025 register; public extract, accuracy depends on the source.")+'</p><p><a href="/'+lang+'/pays/'+iso+'/">'+(fr?"Autres barrages du pays":"More dams in this country")+'</a></p></main><footer>'+esc(site.publisher||(fr?"Prototype — éditeur à renseigner":"Prototype — publisher not configured"))+'</footer></body></html>';
  return new Response(request.method==="HEAD"?null:html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin","content-security-policy":"default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}});
}
