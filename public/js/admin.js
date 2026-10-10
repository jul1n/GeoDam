import {esc} from "./ui.js";
const $=s=>document.querySelector(s);let token="";
async function request(path,body){
  const r=await fetch("api/admin/"+path,{method:body?"POST":"GET",headers:{"Authorization":"Bearer "+token,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error("Requête refusée ou indisponible ("+r.status+")");
  return r.json();
}
async function list(){
  const {rows}=await request("contributions");
  $("#candidates").innerHTML='<h2>Candidats à examiner</h2><ul>'+rows.map((r,i)=>'<li><button class="ghost" data-row="'+i+'">'+esc(r.name||r.dam_id)+' · '+r.independent_votes+' avis indépendants · '+esc(r.status)+'</button></li>').join("")+'</ul>';
  $("#candidates").querySelectorAll("[data-row]").forEach(b=>b.onclick=()=>detail(rows[Number(b.dataset.row)]).catch(showError));
}
const showError=e=>$("#error").textContent=e.message;
$("#login").onsubmit=async e=>{
  e.preventDefault();token=$("#token").value;$("#token").value="";
  try{await list();$("#login").hidden=true;$("#logout").hidden=false;$("#error").textContent="";}catch(e){token="";showError(e);}
};
$("#logout").onclick=()=>{token="";$("#login").hidden=false;$("#logout").hidden=true;$("#candidates").replaceChildren();$("#detail").replaceChildren();};
async function detail(row){
  const data=await request("detail?id="+encodeURIComponent(row.dam_id));
  const sourceLink=source=>{try{const u=new URL(source);return ["https:","http:"].includes(u.protocol)?'<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+esc(u.href)+'</a>':esc(source);}catch{return esc(source);}};
  $("#detail").innerHTML='<h2>'+esc(row.name||row.dam_id)+'</h2><p>Consensus candidat : '+row.lat+', '+row.lon+' ; dispersion '+row.spread_km+' km. Un accord ne prouve pas l’exactitude.</p><ul>'+data.proposals.map(p=>'<li>'+p.la+', '+p.lo+' · précision estimée '+p.accuracy_km+' km · fiabilité '+Math.round(p.trust*100)+' %<br>'+sourceLink(p.source)+'<p>'+esc(p.comment)+'</p><small>'+esc(p.dataset_version)+' · '+esc(p.created_at)+' · '+esc(p.status)+'</small></li>').join("")+'</ul><h3>Historique</h3><ul>'+data.history.map(h=>'<li>'+esc(h.status)+' · '+esc(h.reviewer)+' · '+esc(h.created_at)+'<p>'+esc(h.note)+'</p></li>').join("")+'</ul><form id="review" class="panel evidence"><label>Décision<select name="status"><option value="in_review">À examiner</option><option value="accepted">Accepter après vérification</option><option value="rejected">Rejeter</option></select></label><label>Latitude vérifiée<input name="lat" type="number" min="-90" max="90" step="any" value="'+row.lat+'"></label><label>Longitude vérifiée<input name="lon" type="number" min="-180" max="180" step="any" value="'+row.lon+'"></label><label>Relecteur<input name="reviewer" maxlength="100" required></label><label>Motif et preuves<textarea name="note" maxlength="1000" required></textarea></label><button>Enregistrer la décision</button></form><p role="status" id="review-status"></p>';
  $("#review").onsubmit=async e=>{
    e.preventDefault();const form=e.target,button=form.querySelector("button");button.disabled=true;
    try{await request("review",{dam_id:row.dam_id,status:form.status.value,lat:Number(form.lat.value),lon:Number(form.lon.value),reviewer:form.reviewer.value,note:form.note.value});await detail(row);$("#review-status").textContent="Décision enregistrée.";await list();}catch(e){showError(e);}finally{button.disabled=false;}
  };
  $("#detail").scrollIntoView({block:"start"});
}
