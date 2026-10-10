import * as S from "./shared.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
const CONTINENTS = { ASIA: "Asie", EUROPE: "Europe", "AMERICA N.": "Amérique du Nord", "AMERICA S.": "Amérique du Sud", "AMERICA C.": "Amérique centrale", AFRICA: "Afrique", "AUSTRAL-ASIA": "Océanie / Asie du Sud-Est" };
const MODE_LABEL = { map: "Carte muette", hilo: "Plus haut / plus bas", daily: "Barrage du jour" };
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

let dams = [], map = null;

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

function destroyMap() { if (map) { map.remove(); map = null; } }
function makeMap(onClick) {
  destroyMap();
  map = L.map("map", { worldCopyJump: true, minZoom: 2, maxBounds: [[-85, -540], [85, 540]] }).setView([25, 10], 2);
  const muet = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 12, attribution: "Fond de carte © Esri" }).addTo(map);
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 14, attribution: "Imagerie © Esri" });
  L.control.layers({ "Carte muette": muet, Satellite: sat }, null, { position: "topright" }).addTo(map);
  map.on("click", (e) => onClick(e.latlng.lat, S.wrapLng(e.latlng.lng)));
  return map;
}
const pin = (lat, lng, color) =>
  L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<div class="dam-pin" style="background:${color}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) });

function clueCard(d, { showCountry = false } = {}) {
  const rows = [
    ["Continent", CONTINENTS[d.ct] || d.ct], showCountry && ["Pays", d.c],
    ["Cours d'eau", d.r], ["Hauteur", d.h != null && `${d.h} m`], ["Mise en service", d.y],
    ["Type", d.t && `Barrage ${d.t.toLowerCase()}`], ["Usages", d.p?.length && d.p.join(", ")],
    ["Volume", d.v != null && `${fmt(d.v)} hm³`], ["Puissance", d.mw > 0 && `${fmt(d.mw)} MW`],
  ].filter((r) => r && r[1]);
  return `<div class="panel clue"><h2>${esc(d.n)}</h2><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
}

// ---------------- accueil + classement ----------------
function home() {
  destroyMap(); $("#btn-home").hidden = true;
  app.innerHTML = `
    <h1>Où est ce barrage ?</h1>
    <p class="lead">Plus de 9 000 barrages du monde entier, issus du registre de la CIGB. Pas de photo : juste une carte, des indices et votre instinct d'ingénieur.</p>
    <div class="cards">
      <div class="card"><h3>🗺️ Carte muette</h3><p>5 manches. Un nom, quelques indices : placez le barrage sur la carte. Plus vous êtes près, plus vous marquez (max 25 000).</p><button data-mode="map">Jouer</button></div>
      <div class="card"><h3>⚖️ Plus haut / plus bas</h3><p>Hauteur, volume, année, puissance : lequel est le plus grand ? Série sans faute, la première erreur termine la partie.</p><button data-mode="hilo">Jouer</button></div>
      <div class="card"><h3>📅 Barrage du jour</h3><p>Le même barrage pour tout le monde. 6 essais sur la carte, un nouvel indice à chaque erreur.</p><button data-mode="daily">Jouer</button></div>
    </div>
    <h2>Classements</h2>
    <div class="tabs" role="tablist">${Object.entries(MODE_LABEL).map(([m, l], i) => `<button class="tab" role="tab" data-lb="${m}" aria-selected="${i === 0}">${l}</button>`).join("")}</div>
    <div class="panel" id="lb">Chargement…</div>`;
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => start(b.dataset.mode)));
  app.querySelectorAll("[data-lb]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-lb]").forEach((x) => x.setAttribute("aria-selected", x === b));
    showLeaderboard(b.dataset.lb, $("#lb"));
  }));
  showLeaderboard("map", $("#lb"));
}

async function showLeaderboard(mode, el, highlight) {
  el.textContent = "Chargement…";
  try {
    const { entries, period } = await api(`/api/leaderboard?mode=${mode}`);
    el.innerHTML = (mode === "daily" ? `<p class="muted">Classement du ${esc(period)} (UTC)</p>` : "") +
      (entries.length ? `<table class="lb"><thead><tr><th>#</th><th>Joueur</th><th class="num">Score</th></tr></thead><tbody>${entries.map((e, i) =>
        `<tr${highlight === e.name ? ' style="font-weight:700"' : ""}><td>${i + 1}</td><td>${esc(e.name)}</td><td class="num">${fmt(e.score)}</td></tr>`).join("")}</tbody></table>`
        : '<p class="muted">Aucun score pour le moment — soyez le premier !</p>');
  } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------------- fin de partie : score + pseudo ----------------
async function finishGame(mode, token, payload, summaryHtml, shareText) {
  const box = document.createElement("div");
  box.className = "panel result"; box.innerHTML = "Calcul du score…";
  $("#end").replaceChildren(box);
  let res;
  try { res = await api("/api/finish", { token, ...payload }); }
  catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  box.innerHTML = `${summaryHtml}<p>Score validé : <span class="pts">${fmt(res.score)}</span> — rang #${res.rank}</p>`;
  if (shareText) box.insertAdjacentHTML("beforeend", `<div class="row"><button class="ghost" id="share">Copier mon résultat</button></div>`);
  $("#share")?.addEventListener("click", async (ev) => { try { await navigator.clipboard.writeText(shareText(res)); ev.target.textContent = "Copié ✓"; } catch { ev.target.textContent = shareText(res); } });
  if (res.qualifies) {
    box.insertAdjacentHTML("beforeend", `<h3>🏆 Bien joué : vous entrez au classement !</h3>
      <form class="row" id="nameform"><input type="text" id="pseudo" maxlength="16" minlength="2" placeholder="Votre pseudo" autocomplete="nickname" required value="${esc(store.get("geodam-name") || "")}"><button>Enregistrer</button></form>
      <p class="muted" style="font-size:.8rem;margin:6px 0 0">En enregistrant, votre adresse IP est conservée avec votre score (anti-triche).</p><p class="err" id="nerr"></p>`);
    $("#nameform").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = $("#pseudo").value.trim();
      try {
        await api("/api/submit", { claim: res.claim, name });
        store.set("geodam-name", name);
        $("#nameform").remove(); $("#nerr").remove();
        const lb = document.createElement("div"); lb.className = "panel"; lb.style.marginTop = "12px";
        box.append(lb); showLeaderboard(mode, lb, name);
      } catch (e) { $("#nerr").textContent = e.message; }
    });
  } else {
    box.insertAdjacentHTML("beforeend", `<p class="muted">${res.score > 0 ? "Pas assez pour le top 50 cette fois." : "Score nul : rien à enregistrer."}</p>`);
  }
  box.insertAdjacentHTML("beforeend", `<div class="row"><button id="again">Rejouer</button><button class="ghost" id="tohome">Accueil</button></div>`);
  $("#again").addEventListener("click", () => start(mode)); $("#tohome").addEventListener("click", home);
}

async function start(mode) {
  $("#btn-home").hidden = false;
  app.innerHTML = '<p class="muted">Préparation de la partie…</p>';
  try {
    const sess = await api("/api/session", { mode });
    ({ map: playMap, hilo: playHilo, daily: playDaily })[mode](sess);
  } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------------- Mode 1 : carte muette ----------------
function playMap({ token, seed }) {
  const idx = S.pickMapRounds(dams, seed), guesses = [];
  let round = 0, total = 0, guess = null, layers = [];
  app.innerHTML = `<div class="hud"><span id="rd"></span><span id="sc"></span></div>
    <div class="game"><div id="side"></div><div><div id="map"></div><div class="row"><button id="ok" disabled>Valider</button><button id="next" class="ghost" hidden>Suivant</button></div></div></div><div id="end"></div>`;
  makeMap((lat, lng) => {
    if ($("#ok").hidden || $("#ok").dataset.locked) return;
    guess = [lat, lng]; layers.forEach((l) => l.remove()); layers = [pin(lat, lng, "#ef4444").addTo(map)]; $("#ok").disabled = false;
  });
  const render = () => {
    const d = dams[idx[round]]; guess = null;
    layers.forEach((l) => l.remove()); layers = []; map.setView([25, 10], 2);
    $("#rd").textContent = `Manche ${round + 1} / ${S.MAP_ROUNDS}`; $("#sc").textContent = `Score : ${fmt(total)}`;
    $("#side").innerHTML = clueCard(d); $("#ok").hidden = false; $("#ok").disabled = true; delete $("#ok").dataset.locked; $("#next").hidden = true;
  };
  $("#ok").addEventListener("click", () => {
    const d = dams[idx[round]], km = S.distanceKm(guess[0], guess[1], d.la, d.lo), pts = S.mapPoints(km);
    guesses.push(guess); total += pts;
    $("#ok").dataset.locked = 1; $("#ok").hidden = true;
    layers.push(pin(d.la, d.lo, "#16a34a").addTo(map), L.polyline([guess, [d.la, d.lo]], { color: "#334155", dashArray: "6 6", weight: 2 }).addTo(map));
    map.fitBounds(L.latLngBounds([guess, [d.la, d.lo]]).pad(0.5), { maxZoom: 7 });
    $("#side").insertAdjacentHTML("beforeend", `<div class="panel result" style="margin-top:12px"><b>${esc(d.c)}</b><br>À <b>${fmt(km)} km</b> → <span class="pts">+${fmt(pts)}</span></div>`);
    $("#sc").textContent = `Score : ${fmt(total)}`;
    $("#next").hidden = false; $("#next").textContent = round === S.MAP_ROUNDS - 1 ? "Voir le résultat" : "Manche suivante";
  });
  $("#next").addEventListener("click", () => {
    round++;
    if (round < S.MAP_ROUNDS) return render();
    $("#next").hidden = true;
    finishGame("map", token, { guesses }, `<h2>Partie terminée</h2><p>Total local : ${fmt(total)} / 25 000</p>`);
  });
  render();
}

// ---------------- Mode 2 : plus haut / plus bas ----------------
function playHilo({ token, seed }) {
  const steps = S.hiloSequence(dams, seed, S.HILO_CAP + 1), answers = [];
  let i = 0, locked = false;
  const val = (d, k) => (k === "y" ? d[k] : fmt(d[k]));
  app.innerHTML = `<div class="hud"><span id="streak"></span><span class="muted">La première erreur termine la partie</span></div><div id="stage"></div><div id="end"></div>`;
  const render = () => {
    const { k, a, b } = steps[i], A = dams[a], B = dams[b]; locked = false;
    $("#streak").textContent = `Série : ${i}`;
    $("#stage").innerHTML = `<p class="stat-q">${esc(S.HILO_STATS[k])} — le barrage de droite est-il plus haut ou plus bas ?</p>
      <div class="versus"><div class="panel vs-card"><h3>${esc(A.n)}</h3><p class="muted">${esc(A.c)}</p><div class="big">${esc(val(A, k))}</div></div>
      <div class="panel vs-card"><h3>${esc(B.n)}</h3><p class="muted">${esc(B.c)}</p><div class="big" id="bval">?</div></div></div>
      <div class="row" style="justify-content:center"><button data-g="h">▲ Plus haut</button><button data-g="l">▼ Plus bas</button></div>`;
    $("#stage").querySelectorAll("[data-g]").forEach((btn) => btn.addEventListener("click", () => answer(btn.dataset.g)));
  };
  const answer = (g) => {
    if (locked) return; locked = true; answers.push(g);
    const { k, a, b } = steps[i], ok = S.hiloCorrect(dams[a][k], dams[b][k], g);
    $("#bval").textContent = val(dams[b], k); $("#bval").style.color = ok ? "var(--good)" : "var(--bad)";
    $("#stage").querySelectorAll("button").forEach((x) => (x.disabled = true));
    setTimeout(() => {
      if (ok && ++i < S.HILO_CAP) return render();
      $("#stage").querySelector(".row").remove();
      finishGame("hilo", token, { answers }, `<h2>${ok ? "Série parfaite !" : "Raté !"}</h2><p>${i} bonne${i > 1 ? "s" : ""} réponse${i > 1 ? "s" : ""} d'affilée.</p>`);
    }, 1100);
  };
  render();
}

// ---------------- Mode 3 : barrage du jour ----------------
function playDaily({ token, seed }) {
  const key = `geodam-daily-${seed}`, target = dams[S.dailyIndex(dams, seed)];
  if (store.get(key)) {
    const past = JSON.parse(store.get(key));
    app.innerHTML = `<div class="panel"><h2>Déjà joué aujourd'hui</h2><p>Le barrage du ${esc(seed)} était <b>${esc(target.n)}</b> (${esc(target.c)}). ${past.found ? `Trouvé en ${past.tries} essai(s) — ${fmt(past.score)} pts.` : "Pas trouvé."}</p><p class="muted">Revenez demain pour un nouveau barrage.</p><div id="lb"></div></div>`;
    showLeaderboard("daily", $("#lb")); return;
  }
  const guesses = [], marks = [], ch = [];
  const clues = [
    (d) => `${CONTINENTS[d.ct] || d.ct}${d.h != null ? ` · ${d.h} m de haut` : ""}`,
    (d) => [d.y && `Mis en service en ${d.y}`, d.t && `Barrage ${d.t.toLowerCase()}`].filter(Boolean).join(" · "),
    (d) => [d.p?.length && d.p.join(", "), d.v != null && `${fmt(d.v)} hm³`, d.mw > 0 && `${fmt(d.mw)} MW`].filter(Boolean).join(" · "),
    (d) => d.r && `Cours d'eau : ${d.r}`,
    (d) => `Pays : ${d.c}`,
    (d) => `Nom : ${d.n[0]}${"·".repeat(Math.max(0, d.n.length - 1))}${d.ci ? ` — près de ${d.ci}` : ""}`,
  ];
  app.innerHTML = `<div class="hud"><span>Barrage du ${esc(seed)}</span><span id="tries"></span></div>
    <div class="game"><div><div class="panel"><h3>Indices</h3><ol id="clues" style="padding-left:20px;margin:0"></ol></div>
    <div class="panel" style="margin-top:12px"><h3>Essais</h3><ul class="attempts" id="att"></ul></div></div>
    <div><div id="map"></div><div class="row"><button id="ok" disabled>Valider cet essai</button></div></div></div><div id="end"></div>`;
  let guess = null, over = false;
  const showClues = () => {
    $("#clues").innerHTML = clues.slice(0, guesses.length + 1).map((f) => `<li>${esc(f(target) || "—")}</li>`).join("");
    $("#tries").textContent = `Essai ${Math.min(guesses.length + 1, S.DAILY_TRIES)} / ${S.DAILY_TRIES}`;
  };
  makeMap((lat, lng) => {
    if (over) return; guess = [lat, lng];
    if (marks.cur) marks.cur.remove(); marks.cur = pin(lat, lng, "#ef4444").addTo(map); $("#ok").disabled = false;
  });
  $("#ok").addEventListener("click", () => {
    const km = S.distanceKm(guess[0], guess[1], target.la, target.lo), found = km <= S.FOUND_KM;
    guesses.push(guess); ch.push(found ? "🟩" : km < 500 ? "🟧" : "🟥");
    const arrow = found ? "🎯" : S.arrowFor(S.bearingDeg(guess[0], guess[1], target.la, target.lo));
    $("#att").insertAdjacentHTML("beforeend", `<li>${guesses.length}. ${arrow} ${found ? "Trouvé !" : `${fmt(km)} km`}</li>`);
    marks.cur = null; $("#ok").disabled = true; guess = null;
    if (found || guesses.length === S.DAILY_TRIES) {
      over = true; $("#ok").hidden = true; showClues();
      pin(target.la, target.lo, "#16a34a").addTo(map); map.setView([target.la, target.lo], 5);
      const local = S.dailyScore(dams, seed, guesses);
      store.set(key, JSON.stringify(local));
      finishGame("daily", token, { guesses },
        `<h2>${found ? "Bravo !" : "Perdu…"}</h2><p>C'était <b>${esc(target.n)}</b> (${esc(target.c)}).</p>`,
        (r) => `GéoDam ${seed} ${found ? guesses.length : "X"}/${S.DAILY_TRIES}\n${ch.join("")}`);
    } else showClues();
  });
  showClues();
}

// ---------------- démarrage ----------------
$("#btn-home").addEventListener("click", home);
$("#logo").addEventListener("click", (e) => { e.preventDefault(); home(); });
fetch("/data/dams.json").then((r) => r.json()).then((d) => { dams = d; home(); })
  .catch(() => { app.innerHTML = '<p class="err">Impossible de charger les données.</p>'; });
