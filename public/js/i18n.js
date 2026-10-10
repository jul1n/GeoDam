// Traductions FR / EN. Langue : choix mémorisé > langue du navigateur > anglais.
const DICT = {
  fr: {
    "title": "GéoDam — Devine où est le barrage",
    "meta.desc": "Place des barrages sur la carte du monde, compare-les et trouve le barrage du jour.",
    "nav.home": "← Accueil", "nav.install": "Installer l'app", "nav.lang": "Langue",
    "install.ios": "Pour installer : touchez Partager puis « Sur l'écran d'accueil ».",
    "home.h1": "Où est ce barrage ?",
    "home.lead": "Plus de 9 000 barrages du monde entier, issus du registre de la CIGB. Pas de photo : juste une carte, des indices et votre instinct d'ingénieur.",
    "mode.map": "Carte muette", "mode.hilo": "Plus haut / plus bas", "mode.daily": "Barrage du jour",
    "mode.map.d": "5 manches. Un nom, quelques indices : placez le barrage sur la carte. Plus vous êtes près, plus vous marquez (max 25 000).",
    "mode.hilo.d": "Hauteur, volume, année, puissance : lequel est le plus grand ? La première erreur termine la partie.",
    "mode.daily.d": "Le même barrage pour tout le monde. 6 essais sur la carte, un nouvel indice à chaque erreur.",
    "play": "Jouer", "lb.title": "Classements", "lb.loading": "Chargement…", "lb.empty": "Aucun score pour le moment — soyez le premier !",
    "lb.day": "Classement du {d} (UTC)", "lb.player": "Joueur", "lb.score": "Score",
    "prep": "Préparation de la partie…", "data.err": "Impossible de charger les données.",
    "clue.continent": "Continent", "clue.country": "Pays", "clue.river": "Cours d'eau", "clue.height": "Hauteur", "clue.year": "Mise en service",
    "clue.type": "Type", "clue.use": "Usages", "clue.volume": "Volume", "clue.power": "Puissance",
    "map.round": "Manche {n} / {t}", "map.score": "Score : {s}", "map.validate": "Valider", "map.next": "Manche suivante", "map.last": "Voir le résultat",
    "map.hint": "Touchez la carte pour placer votre réponse.", "map.dist": "À <b>{km} km</b>",
    "map.over": "Partie terminée", "map.total": "Total : {s} / 25 000",
    "hilo.streak": "Série : {n}", "hilo.rule": "La première erreur termine la partie",
    "hilo.q": "{stat} — le barrage de droite est-il plus haut ou plus bas ?", "hilo.hi": "▲ Plus haut", "hilo.lo": "▼ Plus bas",
    "hilo.perfect": "Série parfaite !", "hilo.fail": "Raté !", "hilo.count": "{n} bonne(s) réponse(s) d'affilée.",
    "stat.h": "Hauteur (m)", "stat.v": "Volume du réservoir (hm³)", "stat.y": "Année de mise en service", "stat.mw": "Puissance installée (MW)",
    "daily.title": "Barrage du {d}", "daily.try": "Essai {n} / {t}", "daily.clues": "Indices", "daily.attempts": "Essais", "daily.ok": "Valider cet essai",
    "daily.found": "Trouvé !", "daily.played": "Déjà joué aujourd'hui",
    "daily.playedtxt": "Le barrage du {d} était <b>{n}</b> ({c}).", "daily.again": "Revenez demain pour un nouveau barrage.",
    "daily.res": "Trouvé en {n} essai(s) — {s} pts.", "daily.nores": "Pas trouvé.",
    "daily.win": "Bravo !", "daily.lose": "Perdu…", "daily.was": "C'était <b>{n}</b> ({c}).",
    "clue.d1": "Mis en service en {y}", "clue.d2": "Barrage {t}", "clue.d3": "Cours d'eau : {r}", "clue.d4": "Pays : {c}",
    "clue.d5": "Nom : {i}", "clue.d6": " — près de {c}", "clue.hhigh": "{h} m de haut",
    "end.calc": "Calcul du score…", "end.valid": "Score validé : <span class=\"pts\">{s}</span> — rang #{r}", "end.copy": "Copier mon résultat", "end.copied": "Copié ✓",
    "end.in": "🏆 Bien joué : vous entrez au classement !", "end.pseudo": "Votre pseudo", "end.save": "Enregistrer mon score",
    "end.ipnotice": "🔒 <b>Information :</b> en enregistrant votre pseudo, votre <b>adresse IP</b> est conservée avec votre score (lutte contre la triche et les abus). Elle n'est jamais affichée publiquement.",
    "end.out": "Pas assez pour le top 50 cette fois.", "end.zero": "Score nul : rien à enregistrer.", "end.again": "Rejouer", "end.home": "Accueil",
    "foot.data": "Données : CIGB/ICOLD — Registre mondial des barrages 2025. Fonds de carte et imagerie © Esri.",
    "layer.mute": "Carte muette", "layer.sat": "Satellite",
    "ct.ASIA": "Asie", "ct.EUROPE": "Europe", "ct.AMERICA N.": "Amérique du Nord", "ct.AMERICA S.": "Amérique du Sud", "ct.AMERICA C.": "Amérique centrale",
    "ct.AFRICA": "Afrique", "ct.AUSTRAL-ASIA": "Océanie / Asie du Sud-Est",
    "use.H": "Hydroélectricité", "use.I": "Irrigation", "use.S": "Eau potable", "use.C": "Protection contre les crues", "use.R": "Loisirs", "use.N": "Navigation", "use.F": "Pisciculture",
    "ty.TE": "en terre", "ty.ER": "en enrochement", "ty.PG": "poids", "ty.VA": "voûte", "ty.MV": "à voûtes multiples", "ty.CB": "à contreforts",
    "scope.title": "Zone de jeu", "scope.world": "🌍 Monde", "scope.search": "Rechercher un pays…", "scope.hint": "Tapez le nom d'un pays ou ouvrez la liste : Chine et États-Unis y sont jouables en entier.",
    "scope.back": "🌍 Retour au monde", "scope.loading": "Chargement du pays…", "scope.count": "{n} barrages", "scope.h1": "Barrages : {c}", "scope.lead": "Tous les barrages de ce pays, sans limite : cartes, séries et barrage du jour propres à {c}, avec leur propre classement.",
    "scope.ok": "Jouer ici", "scope.err": "Pays introuvable ou indisponible.", "lb.for": "Classement — {c}", "clue.province": "Région", "clue.d4p": "Région : {s}", "clue.d4c": "Ville : {c}",
    "err.bad_mode": "Mode inconnu.", "err.invalid_session": "Session invalide, relancez une partie.", "err.expired": "Session expirée, relancez une partie.",
    "err.invalid_game": "Partie invalide.", "err.too_fast": "Partie trop rapide : score refusé.", "err.invalid_claim": "Score non valide.", "err.claim_expired": "Délai dépassé, rejouez.",
    "err.bad_name": "Pseudo : 2 à 16 caractères (lettres, chiffres, espace, _ . -).", "err.rate": "Trop de scores enregistrés, réessayez plus tard.",
    "err.dup_daily": "Un score du jour est déjà enregistré depuis cette connexion.", "err.dup": "Score déjà enregistré.", "err.server": "Erreur serveur.", "err.net": "Erreur réseau.",
  },
  en: {
    "title": "GeoDam — Guess where the dam is",
    "meta.desc": "Place dams on the world map, compare them and find the dam of the day.",
    "nav.home": "← Home", "nav.install": "Install app", "nav.lang": "Language",
    "install.ios": "To install: tap Share, then “Add to Home Screen”.",
    "home.h1": "Where is this dam?",
    "home.lead": "Over 9,000 dams worldwide from the ICOLD register. No photos: just a map, clues and your engineer's instinct.",
    "mode.map": "Blank map", "mode.hilo": "Higher / lower", "mode.daily": "Dam of the day",
    "mode.map.d": "5 rounds. A name and a few clues: place the dam on the map. The closer you are, the more you score (max 25,000).",
    "mode.hilo.d": "Height, volume, year, power: which one is bigger? The first mistake ends the game.",
    "mode.daily.d": "The same dam for everyone. 6 tries on the map, a new clue after each miss.",
    "play": "Play", "lb.title": "Leaderboards", "lb.loading": "Loading…", "lb.empty": "No score yet — be the first!",
    "lb.day": "Leaderboard for {d} (UTC)", "lb.player": "Player", "lb.score": "Score",
    "prep": "Setting up the game…", "data.err": "Could not load the data.",
    "clue.continent": "Continent", "clue.country": "Country", "clue.river": "River", "clue.height": "Height", "clue.year": "Completed",
    "clue.type": "Type", "clue.use": "Purposes", "clue.volume": "Volume", "clue.power": "Power",
    "map.round": "Round {n} / {t}", "map.score": "Score: {s}", "map.validate": "Confirm", "map.next": "Next round", "map.last": "See result",
    "map.hint": "Tap the map to place your answer.", "map.dist": "<b>{km} km</b> away",
    "map.over": "Game over", "map.total": "Total: {s} / 25,000",
    "hilo.streak": "Streak: {n}", "hilo.rule": "The first mistake ends the game",
    "hilo.q": "{stat} — is the dam on the right higher or lower?", "hilo.hi": "▲ Higher", "hilo.lo": "▼ Lower",
    "hilo.perfect": "Perfect run!", "hilo.fail": "Missed!", "hilo.count": "{n} correct answer(s) in a row.",
    "stat.h": "Height (m)", "stat.v": "Reservoir volume (hm³)", "stat.y": "Year completed", "stat.mw": "Installed power (MW)",
    "daily.title": "Dam of {d}", "daily.try": "Try {n} / {t}", "daily.clues": "Clues", "daily.attempts": "Tries", "daily.ok": "Confirm this try",
    "daily.found": "Found!", "daily.played": "Already played today",
    "daily.playedtxt": "The dam of {d} was <b>{n}</b> ({c}).", "daily.again": "Come back tomorrow for a new dam.",
    "daily.res": "Found in {n} tries — {s} pts.", "daily.nores": "Not found.",
    "daily.win": "Well done!", "daily.lose": "Missed…", "daily.was": "It was <b>{n}</b> ({c}).",
    "clue.d1": "Completed in {y}", "clue.d2": "{t} dam", "clue.d3": "River: {r}", "clue.d4": "Country: {c}",
    "clue.d5": "Name: {i}", "clue.d6": " — near {c}", "clue.hhigh": "{h} m high",
    "end.calc": "Computing score…", "end.valid": "Verified score: <span class=\"pts\">{s}</span> — rank #{r}", "end.copy": "Copy my result", "end.copied": "Copied ✓",
    "end.in": "🏆 Well played: you made the leaderboard!", "end.pseudo": "Your nickname", "end.save": "Save my score",
    "end.ipnotice": "🔒 <b>Notice:</b> by saving your nickname, your <b>IP address</b> is stored with your score (anti-cheating and abuse prevention). It is never shown publicly.",
    "end.out": "Not enough for the top 50 this time.", "end.zero": "Zero score: nothing to save.", "end.again": "Play again", "end.home": "Home",
    "foot.data": "Data: ICOLD — World Register of Dams 2025. Basemap and imagery © Esri.",
    "layer.mute": "Blank map", "layer.sat": "Satellite",
    "ct.ASIA": "Asia", "ct.EUROPE": "Europe", "ct.AMERICA N.": "North America", "ct.AMERICA S.": "South America", "ct.AMERICA C.": "Central America",
    "ct.AFRICA": "Africa", "ct.AUSTRAL-ASIA": "Oceania / Southeast Asia",
    "use.H": "Hydropower", "use.I": "Irrigation", "use.S": "Water supply", "use.C": "Flood control", "use.R": "Recreation", "use.N": "Navigation", "use.F": "Fish farming",
    "ty.TE": "earthfill", "ty.ER": "rockfill", "ty.PG": "gravity", "ty.VA": "arch", "ty.MV": "multiple arch", "ty.CB": "buttress",
    "scope.title": "Play area", "scope.world": "🌍 World", "scope.search": "Search a country…", "scope.hint": "Type a country name or open the list: China and the USA are fully playable.",
    "scope.back": "🌍 Back to world", "scope.loading": "Loading country…", "scope.count": "{n} dams", "scope.h1": "Dams: {c}", "scope.lead": "Every dam of this country, no cap: maps, streaks and dam of the day specific to {c}, each with its own leaderboard.",
    "scope.ok": "Play here", "scope.err": "Country not found or unavailable.", "lb.for": "Leaderboard — {c}", "clue.province": "Region", "clue.d4p": "Region: {s}", "clue.d4c": "City: {c}",
    "err.bad_mode": "Unknown mode.", "err.invalid_session": "Invalid session, please start a new game.", "err.expired": "Session expired, please start a new game.",
    "err.invalid_game": "Invalid game.", "err.too_fast": "Game too fast: score rejected.", "err.invalid_claim": "Invalid score.", "err.claim_expired": "Time's up, please play again.",
    "err.bad_name": "Nickname: 2–16 characters (letters, digits, space, _ . -).", "err.rate": "Too many scores saved, try again later.",
    "err.dup_daily": "A daily score has already been saved from this connection.", "err.dup": "Score already saved.", "err.server": "Server error.", "err.net": "Network error.",
  },
};

const KEY = "geodam-lang";
let lang = "en";
try { lang = localStorage.getItem(KEY); } catch { /* ignore */ }
if (!DICT[lang]) lang = (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";

export const getLang = () => lang;
export function setLang(l) { lang = l; try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }
export function t(key, vars = {}) {
  const s = DICT[lang][key] ?? DICT.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
export const countryOf = (d) => (lang === "fr" ? d.c : d.ce);
export function applyStatic() {
  document.documentElement.lang = lang;
  document.title = t("title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.desc"));
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
}
