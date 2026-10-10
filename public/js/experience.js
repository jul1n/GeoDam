import {getLang,t} from "./i18n.js";
import {esc,toast} from "./ui.js";
import * as P from "./profile.js";
export const tr=(fr,en)=>getLang()==="fr"?fr:en;
const KEY="geodam-session-v2";
export function savedGame(){try{const g=JSON.parse(localStorage.getItem(KEY));const point=p=>Array.isArray(p)&&p.length>=2&&p.length<=3&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
 return g&&g.version===2&&["map","daily","mission"].includes(g.mode)&&typeof g.scope==="string"&&/^(world|[A-Z]{2}|ct:[A-Z]+)$/.test(g.scope)&&Array.isArray(g.guesses)&&g.guesses.length<=6&&g.guesses.every(point)&&typeof g.session?.token==="string"&&g.session.token.length<3000&&typeof g.session.seed==="string"?g:null;}catch{return null;}}
export function saveGame(g){try{localStorage.setItem(KEY,JSON.stringify({...g,version:2}));return true;}catch{return false;}}
export function clearGame(){try{localStorage.removeItem(KEY);}catch{}}
export function announce(text){const el=document.getElementById("announcements");if(el)el.textContent=text;}
export function keyboardGroups(root=document){
  for(const group of root.querySelectorAll('[role="tablist"],[role="radiogroup"]')){
    const buttons=[...group.querySelectorAll('button:not(:disabled)')];
    buttons.forEach(b=>{b.tabIndex=b.getAttribute("aria-selected")==="true"||b.getAttribute("aria-checked")==="true"?0:-1;
      b.addEventListener("click",()=>buttons.forEach(x=>x.tabIndex=x===b?0:-1));
      b.addEventListener("keydown",e=>{
        if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key))return;
        e.preventDefault();let i=buttons.indexOf(b);
        i=e.key==="Home"?0:e.key==="End"?buttons.length-1:(i+(["ArrowRight","ArrowDown"].includes(e.key)?1:-1)+buttons.length)%buttons.length;
        buttons[i].focus();buttons[i].click();
      });
    });
  }
}
export function coordinateControl(map,place){
  const el=document.getElementById("map");if(!el)return;
  el.setAttribute("aria-label",tr("Carte de placement ; utilisez les flèches et + ou −, puis Placer ici.","Placement map; use arrow keys and + or −, then Place here."));
  const target=document.createElement("span");target.className="map-crosshair";target.setAttribute("aria-hidden","true");el.append(target);
  const details=document.createElement("details");details.className="coordinates panel";
  details.innerHTML='<summary>'+tr("Placer avec des coordonnées","Place using coordinates")+'</summary><form class="row"><label>'+tr("Latitude","Latitude")+'<input name="lat" type="number" step="any" min="-90" max="90" required></label><label>'+tr("Longitude","Longitude")+'<input name="lon" type="number" step="any" min="-180" max="180" required></label><button>'+tr("Placer ici","Place here")+'</button></form><p class="err" role="alert"></p>';
  el.parentElement.append(details);
  details.querySelector("form").addEventListener("submit",e=>{
    e.preventDefault();const form=e.target,lat=Number(form.lat.value),lon=Number(form.lon.value);
    if(!form.reportValidity()||!Number.isFinite(lat)||!Number.isFinite(lon))return;
    map.setView([lat,lon],Math.max(4,map.getZoom()));place(lat,lon);announce(tr("Repère placé","Marker placed"));
  });
  let failed=false;
  map.eachLayer(layer=>{if(layer.on)layer.on("tileerror",()=>{
    if(failed)return;failed=true;announce(tr("Fond de carte indisponible. La saisie de coordonnées reste disponible.","Map tiles unavailable. Coordinate entry is still available."));
  });});
}
export function decorateGame(){
  keyboardGroups();
  const side=document.getElementById("side");if(side){
    const b=document.createElement("button");b.type="button";b.className="ghost clue-toggle";b.textContent=tr("Afficher / masquer les indices","Show / hide clues");
    b.setAttribute("aria-expanded","true");b.setAttribute("aria-controls","side");side.before(b);
    b.onclick=()=>{const hidden=side.classList.toggle("mobile-collapsed");b.setAttribute("aria-expanded",String(!hidden));};
  }
}
export function homeExtras(app,{start,resume,selectScope,dams,api}){
  const el=document.createElement("section");el.className="panel learning";
  const g=savedGame(),learned=P.get().learned,due=P.mistakes();
  const continentNames=[["EUROPE","Europe","Europe"],["ASIA","Asie","Asia"],["AFRICA","Afrique","Africa"],["NAMERICA","Amérique du Nord","North America"],["SAMERICA","Amérique du Sud","South America"],["OCEANIA","Océanie","Oceania"]];
  el.innerHTML='<h2>'+tr("Jouer, apprendre, contribuer","Play, learn, contribute")+'</h2><div class="row"><button data-action="tutorial">'+tr("Tutoriel · une manche","Tutorial · one round")+'</button><button data-action="practice">'+tr("Entraînement · indices gratuits","Practice · free hints")+'</button><button data-action="revise" '+(!due.length?'disabled':'')+'>'+tr("Réviser mes erreurs","Review my mistakes")+'</button><a class="ghost" href="#/glossary">'+tr("Apprendre le vocabulaire","Learn the vocabulary")+'</a><button data-action="mission">'+tr("Contribuer au registre","Contribute to the register")+'</button></div>'+
    (g?'<p>'+tr("Une partie est sauvegardée sur cet appareil.","A game is saved on this device.")+'</p><div class="row"><button data-action="resume">'+tr("Reprendre","Resume")+'</button><button data-action="discard" class="ghost">'+tr("Abandonner la sauvegarde","Discard saved game")+'</button></div>':'')+
    '<h3>'+tr("Mes connaissances","My knowledge")+'</h3><p>'+Object.keys(learned).length+' '+tr("barrages étudiés","dams studied")+' · '+due.length+' '+tr("à réviser","to review")+'</p><div class="journeys">'+continentNames.map(([id,fr,en])=>{
      const ct=id==="NAMERICA"?["AMERICA N.","AMERICA C."]:id==="SAMERICA"?["AMERICA S."]:id==="OCEANIA"?["AUSTRAL-ASIA"]:[id];
      const pool=dams.filter(d=>ct.includes(d.ct)),count=pool.filter(d=>learned[d.id]).length;
      return '<button class="ghost" data-journey="'+id+'">'+esc(tr(fr,en))+' · '+count+'/'+pool.length+'</button>';
    }).join("")+'</div>'+
    '<details><summary>'+tr("Mes barrages à réviser","My dams to review")+'</summary><ul>'+due.slice(0,20).map(id=>'<li>'+esc(learned[id].n)+' · '+Math.round(learned[id].km)+' km</li>').join("")+'</ul></details>'+
    '<p class="muted">'+tr("Profil local : exportez-le avant de changer d’appareil.","Local profile: export it before switching devices.")+'</p><div class="row"><button class="ghost" data-action="export">'+tr("Exporter mon profil","Export my profile")+'</button><label class="file-button">'+tr("Importer un profil","Import a profile")+'<input type="file" accept="application/json,.json"></label><button class="ghost" data-action="status">'+tr("Suivre mes contributions","Track my contributions")+'</button></div><div class="contribution-status" role="status"></div>'+
    '<p class="muted small">'+tr("Classements ludiques : les données publiques ne permettent pas de garantir l’absence de bots.","Casual leaderboards: public data cannot guarantee the absence of bots.")+'</p>';
  app.querySelector(".profile")?.after(el);
  const intro=document.createElement("section");intro.className="landing-intro";
  intro.innerHTML='<p>'+tr("Première partie ? Découvrez le gameplay avec une manche guidée.","First game? Discover the gameplay with a guided round.")+'</p><button class="ghost" data-intro-tutorial>'+tr("Essayer le tutoriel","Try the tutorial")+'</button>';
  app.querySelector(".landing-games")?.append(intro);
  intro.querySelector("button").onclick=()=>start("map",{practice:true,tutorial:true});
  if(g){const saved=el.querySelector('[data-action="resume"]');const row=saved?.closest('.row');if(row)intro.append(row);}
  const onClick=async e=>{
    const action=e.target.closest("[data-action]")?.dataset.action;
    if(action==="tutorial")start("map",{practice:true,tutorial:true});
    if(action==="practice")start("map",{practice:true});
    if(action==="revise")start("map",{practice:true,revision:true});
    if(action==="mission")start("mission");
    if(action==="resume")resume();
    if(action==="discard"){clearGame();app.querySelector('[data-action="resume"]')?.remove();e.target.remove();}
    if(action==="export"){const blob=new Blob([P.exportProfile()],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="geodam-profile.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    if(action==="status"){
      const box=el.querySelector(".contribution-status");box.textContent=tr("Chargement…","Loading…");
      try{
        const statuses=[];
        for(const m of P.get().missions.filter(m=>Date.now()-m.date<90*864e5)){
          const res=await api("mission/status",{token:m.token});
          for(const it of res.items){
            if(it.status==="accepted")P.acceptContribution(it.id);
            const labels={proposed:["Proposée","Proposed"],in_review:["En cours d’examen","Under review"],accepted:["Acceptée · +25 XP","Accepted · +25 XP"],rejected:["Rejetée","Rejected"]};
            statuses.push('<li>'+esc(dams.find(d=>d.id===it.id)?.n||it.id)+' · '+tr(...(labels[it.status]||labels.proposed))+'</li>');
          }
        }
        box.innerHTML='<ul>'+statuses.join("")+'</ul>'+(statuses.length?'':tr("Aucune contribution à suivre.","No contributions to track."));
      }catch{box.textContent=t("err.net");}
    }
    const journey=e.target.closest("[data-journey]")?.dataset.journey;
    if(journey){await selectScope("ct:"+journey);start("map",{practice:true});}
  };
  el.addEventListener("click",onClick);intro.addEventListener("click",onClick);
  el.querySelector('input[type="file"]').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>1000000)throw new Error();P.importProfile(await file.text());toast(tr("Profil restauré","Profile restored"));location.reload();}
    catch{toast(tr("Profil invalide ou stockage indisponible","Invalid profile or unavailable storage"));}
  };
  keyboardGroups(app);
}
export function installHelp(){
  const d=document.createElement("dialog");d.className="sheet";d.setAttribute("aria-labelledby","install-title");
  d.innerHTML='<h2 id="install-title">'+tr("Installer GéoDam","Install GéoDam")+'</h2><p>'+tr("Retrouvez votre progression et l’entraînement depuis votre écran d’accueil.","Access your progress and practice from your home screen.")+'</p><ol><li>🧭 '+tr("Ouvrez cette page dans Safari.","Open this page in Safari.")+'</li><li>↑ '+tr("Touchez Partager : le carré avec une flèche.","Tap Share: the square with an arrow.")+'</li><li>⊞ '+tr("Choisissez Sur l’écran d’accueil, puis Ajouter.","Choose Add to Home Screen, then Add.")+'</li></ol><form method="dialog"><button>'+tr("Fermer","Close")+'</button></form>';
  document.body.append(d);d.onclose=()=>d.remove();d.showModal();
}
export function setupConnectivity(){
  const el=document.createElement("div");el.id="connection";el.className="connection";el.setAttribute("role","status");document.querySelector("header").after(el);
  const update=()=>{el.hidden=navigator.onLine;el.textContent=tr("Hors connexion · entraînement disponible ; cartes et photos peuvent manquer.","Offline · practice available; maps and photos may be unavailable.");};
  window.addEventListener("online",()=>{update();announce(tr("Connexion rétablie","Connection restored"));});window.addEventListener("offline",update);update();
}
export async function setupUpdates(){
  if(!("serviceWorker" in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register("sw.js");
    const offer=()=>{
      if(!reg.waiting||!navigator.serviceWorker.controller)return;
      const existing=document.getElementById("update-offer");if(existing)return;
      const b=document.createElement("button");b.id="update-offer";b.className="ghost";b.textContent=tr("Mise à jour disponible · appliquer","Update available · apply");document.querySelector(".tools").append(b);
      b.onclick=()=>{if(document.body.classList.contains("playing")){announce(tr("Terminez la partie avant la mise à jour.","Finish your game before updating."));return;}
        reg.waiting.postMessage({type:"ACTIVATE_UPDATE"});};
    };
    offer();reg.addEventListener("updatefound",()=>reg.installing?.addEventListener("statechange",offer));
    let refreshing=false;const hadController=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing||!hadController)return;refreshing=true;location.reload();});
  }catch{}
}
