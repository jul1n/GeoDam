// Pages « site public » inspirées du cahier des charges : Explorer (recherche + fiches), Le registre en chiffres,
// Glossaire (+ quiz), À propos / mentions légales. Et les helpers de fiche barrage partagés avec le jeu.
import { t, getLang, countryOf } from "./i18n.js";
import { esc, fmt, confetti, countUp, toast, flag } from "./ui.js";
import * as P from "./profile.js";

const REGISTER_URL = "https://www.icold-cigb.org/GB/world_register/world_register_of_dams.asp";
const DICT_URL = "https://www.icold-cigb.org/GB/dictionary/dictionary.asp";
const norm = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------------------------------------------------------------- helpers fiche barrage
export const uses = (d) => (d.p || []).map((c) => t("use." + c));
export const typeLabel = (d) => (d.t ? t("ty." + d.t) : null);
export const contLabel = (d) => (t("ct." + d.ct) !== "ct." + d.ct ? t("ct." + d.ct) : d.ct);
export const factsHtml = (d) =>
  `<div class="fact"><b>${t("sheet.why")}</b>${(d.p?.length ? d.p : ["none"]).map((c) => `<p>${esc(t("fact." + c))}</p>`).join("")}</div>`;

const awardAndToast = (ev) => {
  const r = P.award(ev);
  if (r.xp) toast(t("toast.xp", { n: r.xp }));
  if (r.levelUp) { toast(t("toast.level", { n: P.level().n + 1, name: t("lvl." + P.level().n) }), "good"); confetti(); }
  r.badges.forEach((b) => toast(t("toast.badge", { name: t("bd." + b) }), "good"));
};
export { awardAndToast };

export function openSheet(d) {
  awardAndToast({ sheet: 1, xp: 1 });
  const row = (k, v) => `<dt>${k}</dt><dd>${v == null || v === "" ? `<span class="muted">${t("sheet.missing")}</span>` : esc(v)}</dd>`;
  const dlg = document.createElement("dialog");
  dlg.className = "sheet"; dlg.setAttribute("aria-labelledby", "sheet-h");
  dlg.innerHTML = `<form method="dialog"><button class="close" aria-label="${t("sheet.close")}">✕</button></form>
    <h2 id="sheet-h">${esc(d.n)}</h2><p class="muted">${flag(d)}${esc([countryOf(d), d.s, d.ci].filter(Boolean).join(" · "))}</p>
    <dl class="kv">
      ${row(t("clue.river"), d.r)}${row(t("clue.reservoir"), d.rn)}${row(t("clue.owner"), d.ow)}${row(t("clue.year"), d.y)}${row(t("clue.type"), typeLabel(d))}
      ${row(t("clue.height"), d.h != null ? d.h + " m" : null)}${row(t("clue.length"), d.len ? fmt(d.len) + " m" : null)}${row(t("clue.elev"), d.el != null ? fmt(d.el) + " m" : null)}
      ${row(t("clue.volume"), d.v > 0 ? fmt(d.v) + " hm³" : null)}${row(t("clue.catch"), d.ca ? fmt(d.ca) + " km²" : null)}${row(t("clue.power"), d.mw > 0 ? fmt(d.mw) + " MW" : null)}
      ${row(t("clue.use"), uses(d).join(", "))}${d.la != null ? row(t("sheet.coords"), `${d.la.toFixed(4)}, ${d.lo.toFixed(4)}`) : ""}
    </dl>${factsHtml(d)}${d.la != null ? '<div id="sheet-map" class="sheet-map" role="img" aria-label="Map"></div>' : ""}`;
  document.body.append(dlg);
  dlg.addEventListener("close", () => { sheetMap?.remove(); dlg.remove(); });
  dlg.showModal();
  let sheetMap = null;
  if (d.la != null && window.L) {
    sheetMap = L.map("sheet-map", { zoomControl: true, attributionControl: false }).setView([d.la, d.lo], 9);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 15 }).addTo(sheetMap);
    L.circleMarker([d.la, d.lo], { radius: 8, color: "#fff", weight: 3, fillColor: "#ee813c", fillOpacity: 1 }).addTo(sheetMap);
    setTimeout(() => sheetMap?.invalidateSize(), 60);
  }
}

// ---------------------------------------------------------------- Explorer
function exploreBlock(el, { dams, pools }) {
  el.innerHTML = `<h2>🔎 ${t("explore.title")}</h2><p class="muted">${t("explore.lead")}</p><label class="sr" for="q">${t("explore.search")}</label>
    <input type="search" id="q" class="bigsearch" placeholder="${esc(t("explore.search"))}" autocomplete="off"><p class="muted" id="qinfo">${t("explore.hint")}</p>
    <ul class="results" id="res"></ul>`;
  const all = () => { const seen = new Set(), out = []; for (const d of [...dams, ...[...pools.values()].flat()]) if (!seen.has(d.id)) { seen.add(d.id); out.push(d); } return out; };
  const hay = new WeakMap();
  const run = () => {
    const q = norm($("#q", el).value).trim(), box = $("#res", el);
    if (q.length < 2) { box.innerHTML = ""; $("#qinfo", el).textContent = t("explore.hint"); return; }
    const toks = q.split(/\s+/), pool = all(), hits = [];
    for (const d of pool) {
      let h = hay.get(d); if (!h) { h = norm([d.n, d.c, d.ce, d.r, d.s, d.ci, d.ow, d.rn].join(" | ")); hay.set(d, h); }
      if (toks.every((k) => h.includes(k))) hits.push([norm(d.n).startsWith(toks[0]) ? 0 : 1, -d.h, d]);
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    $("#qinfo", el).textContent = hits.length ? t("explore.count", { n: fmt(hits.length) }) + (hits.length > 40 ? " — " + t("explore.more", { n: 40 }) : "") : t("explore.none");
    box.innerHTML = hits.slice(0, 40).map(([, , d], i) => `<li><button class="hit" data-i="${i}"><b>${esc(d.n)}</b><span>${esc([countryOf(d), d.r].filter(Boolean).join(" · "))}</span><em>${d.h != null ? d.h + " m" : ""}</em></button></li>`).join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => openSheet(hits[+b.dataset.i][2])));
  };
  $("#q", el).addEventListener("input", run);
}
const $ = (s, el = document) => el.querySelector(s);

// ---------------------------------------------------------------- Le registre en chiffres
export async function renderRegister(el, { api, startMission, dams, pools }) {
  el.innerHTML = `<section class="page"><h1>${t("reg.title")}</h1><p class="lead">${t("reg.lead")}</p><div class="panel" id="exp"></div><div id="regbody" class="panel">…</div><p class="muted">${t("reg.note")}</p></section>`;
  exploreBlock($("#exp", el), { dams, pools });
  let s;
  try { s = await (await fetch("data/stats.json")).json(); } catch { $("#regbody", el).textContent = t("err.net"); return; }
  const lang = getLang();
  const bars = (items, max) => items.map(([label, v, sub]) => `<div class="bar"><span class="bl">${esc(label)}</span><span class="bt"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></span><span class="bv">${sub ?? fmt(v)}</span></div>`).join("");
  const dec = Object.entries(s.decennies), dmax = Math.max(...dec.map(([, v]) => v));
  const W = 560, H = 150, bw = W / dec.length;
  const chart = `<svg viewBox="0 0 ${W} ${H + 24}" class="chart" role="img" aria-label="${t("reg.decades")}">${dec.map(([k, v], i) => {
    const h = (v / dmax) * H; return `<g><rect x="${i * bw + 3}" y="${H - h}" width="${bw - 6}" height="${h}" rx="3"><title>${k}s : ${fmt(v)}</title></rect>${i % 2 === 0 ? `<text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle">${k}</text>` : ""}</g>`;
  }).join("")}</svg>`;
  const comp = Object.entries(s.completude);
  $("#regbody", el).innerHTML = `
    <div class="kpis"><div><b id="k1">0</b><span>${t("reg.total")}</span></div><div><b id="k2">0</b><span>${t("reg.geo")}</span></div><div><b id="k3">0</b><span>${t("reg.countries")}</span></div></div>
    <h2>${t("reg.complete")}</h2><p class="muted">${t("reg.completelead")}</p>
    <ul class="why">${comp.map(([k, v]) => `<li><div class="bar"><span class="bl">${esc(t("fld." + k))}</span><span class="bt ${v < 70 ? "low" : ""}"><i style="width:${v}%"></i></span><span class="bv">${v} %</span></div><small>${esc(t("why." + k))}</small></li>`).join("")}</ul>
    <div class="cta"><div><b>${t("reg.cta")}</b><br><span>${t("reg.ctatxt")}</span></div><button id="regcta" class="accent">${t("hero.cta2")}</button></div>
    <div id="mprog"></div>
    <h2>${t("reg.uses")}</h2>${bars(Object.entries(s.usages).sort((a, b) => b[1] - a[1]).map(([c, v]) => [t("use." + c), v]), Math.max(...Object.values(s.usages)))}
    <h2>${t("reg.decades")}</h2>${chart}
    <div class="two"><div><h2>${t("reg.topc")}</h2>${bars((lang === "fr" ? s.top_pays : s.top_pays_en).map((c) => [c[lang === "fr" ? "fr" : "en"], c.n]), s.top_pays[0].n)}</div>
    <div><h2>${t("reg.tall")}</h2>${bars(s.plus_hauts.map((d) => [d.n, d.h, d.h + " m"]), s.plus_hauts[0].h)}<h2>${t("reg.big")}</h2>${bars(s.plus_gros.map((d) => [d.n, d.v, fmt(d.v)]), s.plus_gros[0].v)}</div></div>
    <p><a class="btnlink" href="${REGISTER_URL}" target="_blank" rel="noopener">${t("reg.link")} ↗</a></p>`;
  countUp($("#k1", el), s.total, 1100, fmt); countUp($("#k2", el), s.geo, 1100, fmt); countUp($("#k3", el), s.pays, 900, fmt);
  $("#regcta", el).addEventListener("click", () => startMission());
  missionProgress($("#mprog", el), api);
}

export async function missionProgress(box, api) {
  try {
    const p = await api("mission/progress");
    const pct = Math.min(100, (p.damsTouched / Math.max(1, p.totalMissing)) * 100);
    box.innerHTML = `<div class="mprog"><h3>${t("mission.progress")}</h3><div class="kpis small"><div><b>${fmt(p.proposals)}</b><span>${t("mission.p1")}</span></div><div><b>${fmt(p.damsTouched)}</b><span>${t("mission.p2")}</span></div>
      <div><b>${fmt(p.validated)}</b><span>${t("mission.p3")}</span></div><div><b>${fmt(p.contributors)}</b><span>${t("mission.p4")}</span></div></div>
      <div class="bar"><span class="bt"><i style="width:${Math.max(1, pct)}%"></i></span><span class="bv">${fmt(p.damsTouched)} / ${fmt(p.totalMissing)}</span></div>${p.demo ? `<small class="muted">${t("mission.demo")}</small>` : ""}</div>`;
  } catch { box.innerHTML = ""; }
}

// ---------------------------------------------------------------- Glossaire + quiz
const TERMS = [
  ["Barrage-poids", "Gravity dam", "Ouvrage dont la stabilité repose sur son propre poids.", "A dam that resists water pressure through its own weight."],
  ["Barrage-voûte", "Arch dam", "Mur courbe qui reporte la poussée de l'eau sur les rives.", "A curved dam that transfers the water thrust to the valley sides."],
  ["Barrage à contreforts", "Buttress dam", "Mur mince soutenu en aval par une série de contreforts.", "A thin wall supported downstream by a series of buttresses."],
  ["Barrage en terre", "Earthfill dam", "Remblai de matériaux meubles compactés, souvent avec un noyau étanche.", "An embankment of compacted soil, often with a watertight core."],
  ["Barrage en enrochement", "Rockfill dam", "Remblai de blocs de roche avec un noyau ou un masque étanche.", "An embankment of rock blocks with a watertight core or face."],
  ["Évacuateur de crues", "Spillway", "Ouvrage qui évacue l'eau excédentaire sans endommager le barrage.", "A structure that releases excess water without damaging the dam."],
  ["Crête", "Crest", "Partie supérieure du barrage.", "The top of the dam."],
  ["Réservoir", "Reservoir", "Volume d'eau retenu par le barrage.", "The body of water held back by the dam."],
  ["Conduite forcée", "Penstock", "Conduite qui amène l'eau sous pression jusqu'aux turbines.", "A pipe that carries pressurised water to the turbines."],
  ["Prise d'eau", "Intake", "Ouvrage par lequel l'eau est captée dans le réservoir.", "The structure through which water is drawn from the reservoir."],
  ["Vidange de fond", "Bottom outlet", "Ouvrage permettant d'abaisser ou de vider le réservoir.", "An outlet used to lower or empty the reservoir."],
  ["Revanche", "Freeboard", "Hauteur entre le niveau de l'eau et la crête du barrage.", "The height between the water level and the dam crest."],
  ["Bassin versant", "Catchment", "Territoire dont les eaux convergent vers le barrage.", "The land area whose water drains towards the dam."],
  ["Appui", "Abutment", "Flanc de vallée sur lequel s'appuie le barrage.", "The valley side against which the dam rests."],
  ["Fondation", "Foundation", "Terrain sur lequel repose le barrage.", "The ground on which the dam rests."],
  ["Batardeau", "Cofferdam", "Barrage provisoire pour travailler à sec pendant la construction.", "A temporary dam that keeps the works dry during construction."],
  ["Dissipateur d'énergie", "Stilling basin", "Bassin au pied de l'évacuateur qui calme l'écoulement.", "A basin at the foot of the spillway that calms the flow."],
  ["Passe à poissons", "Fish ladder", "Passage permettant aux poissons de franchir l'ouvrage.", "A passage that lets fish get past the structure."],
  ["Envasement", "Sedimentation", "Dépôt de sédiments qui réduit la capacité du réservoir.", "Sediment build-up that reduces reservoir capacity."],
  ["Station de transfert d'énergie par pompage (STEP)", "Pumped storage plant (PSP)", "Deux réservoirs : on pompe en heures creuses, on turbine en pointe.", "Two reservoirs: water is pumped up off-peak and released through turbines at peak."],
  ["Aménagement au fil de l'eau", "Run-of-river scheme", "Peu de stockage : on turbine le débit naturel du cours d'eau.", "Little storage: the natural river flow is run through the turbines."],
  ["Crue de projet", "Design flood", "Crue extrême que l'ouvrage doit pouvoir évacuer en sécurité.", "The extreme flood the structure must be able to pass safely."],
  ["Digue à résidus", "Tailings dam", "Barrage qui retient les résidus d'une exploitation minière.", "A dam that retains the waste of a mining operation."],
];

export function renderGlossary(el) {
  const L = getLang() === "fr" ? 0 : 1, other = 1 - L;
  el.innerHTML = `<section class="page"><h1>${t("gl.title")}</h1><p class="lead">${t("gl.lead")}</p>
    <div class="panel"><input type="search" id="gq" class="bigsearch" placeholder="${esc(t("gl.search"))}" aria-label="${esc(t("gl.search"))}" autocomplete="off">
    <dl class="terms" id="terms"></dl><p><a class="btnlink" href="${DICT_URL}" target="_blank" rel="noopener">${t("gl.link")} ↗</a></p></div>
    <div class="panel quiz" id="quiz"><h2>🧠 ${t("gl.quiz")}</h2><button id="qstart">${t("gl.start")}</button></div></section>`;
  const list = () => {
    const q = norm($("#gq", el).value).trim();
    const rows = TERMS.filter((x) => !q || norm(x.join(" ")).includes(q));
    $("#terms", el).innerHTML = rows.length ? rows.map((x) => `<div><dt>${esc(x[L])} <small>${esc(x[other])}</small></dt><dd>${esc(x[2 + L])}</dd></div>`).join("") : `<p class="muted">${t("gl.none")}</p>`;
  };
  $("#gq", el).addEventListener("input", list); list();
  $("#qstart", el).addEventListener("click", () => {
    const qs = [...TERMS].sort(() => Math.random() - 0.5).slice(0, 5); let i = 0, ok = 0;
    const box = $("#quiz", el);
    const ask = () => {
      const q = qs[i], opts = [q, ...[...TERMS].filter((x) => x !== q).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
      box.innerHTML = `<h2>🧠 ${t("gl.q", { n: i + 1 })}</h2><p class="qdef">« ${esc(q[2 + L])} »</p><div class="opts">${opts.map((o, k) => `<button class="tab" data-k="${k}">${esc(o[L])}</button>`).join("")}</div><p id="qfb" role="status"></p>`;
      box.querySelectorAll(".opts button").forEach((b) => b.addEventListener("click", () => {
        const good = opts[+b.dataset.k] === q; if (good) ok++;
        box.querySelectorAll(".opts button").forEach((x) => { x.disabled = true; if (opts[+x.dataset.k] === q) x.classList.add("good"); });
        if (!good) b.classList.add("bad");
        $("#qfb", box).textContent = good ? t("gl.ok") : t("gl.ko", { t: q[L] });
        setTimeout(() => { if (++i < 5) ask(); else done(); }, 1300);
      }));
    };
    const done = () => {
      box.innerHTML = `<h2>🧠 ${t("gl.score", { s: ok })}</h2><button id="qagain">${t("gl.start")}</button>`;
      $("#qagain", box).addEventListener("click", () => { renderGlossary(el); $("#qstart", el).click(); });
      if (ok === 5) confetti();
      awardAndToast({ xp: ok * 3, quizPerfect: ok === 5 ? 1 : 0 });
    };
    ask();
  });
}

// ---------------------------------------------------------------- À propos + mentions légales
export function renderAbout(el, { demo }) {
  const brief = [[1, "ok"], [2, "ok"], [3, "ok", "3n"], [4, "ok"], [5, "part"], [6, "ok", "6n"], [7, "no", "7n"], [8, "part", "8n"], [9, "part", "9n"]];
  el.innerHTML = `<section class="page"><h1>${t("about.title")}</h1><div class="panel"><p>${t("about.p1")}</p>
    <h2>${t("about.icold")}</h2><p>${t("about.icoldtxt")}</p><h2>${t("about.data")}</h2><p>${t("about.datatxt")}</p></div>
    <div class="panel"><h2>${t("about.brief")}</h2><p class="muted">${t("about.brief.lead")}</p>
    <ul class="brief">${brief.map(([n, st, note]) => `<li><span class="pill ${st}">${t("brief." + st)}</span><div><b>${t("brief." + n)}</b>${note ? `<br><small>${t("brief." + note)}</small>` : ""}</div></li>`).join("")}</ul></div>
    <div class="panel" id="legal"><h1 class="h2">${t("legal.title")}</h1><h2>${t("legal.who")}</h2><p>${t("legal.whotxt")}</p>
    <h2>${t("legal.data")}</h2><p>${t("legal.datatxt")}</p><h2>${t("legal.host")}</h2><p>${t("legal.hosttxt")}</p>${demo ? `<p class="notice">${t("legal.demo")}</p>` : ""}</div></section>`;
}
