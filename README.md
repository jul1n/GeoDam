# GéoDam

Jeu web bilingue (FR/EN) autour du **Registre mondial des barrages** de la CIGB/ICOLD (62 362 barrages, édition 2025).
Trois défis (carte à 3 niveaux avec photos libres, barrage du jour, mission cartographe), un profil joueur (XP, niveaux, badges), des pages « site public » (explorer, registre en chiffres, glossaire) et une
**mission cartographe** qui fait compléter par les joueurs les ~20 000 barrages sans coordonnées.

- **Démo** (GitHub Pages, serveur simulé dans le navigateur) : https://jul1n.github.io/GeoDam/ — à activer une fois, voir « Démo GitHub Pages ».
- **Version complète** : Cloudflare Workers + D1 (classements partagés, anti-triche, contributions).

> ⚠️ **Données.** Le registre est la propriété de la CIGB/ICOLD (conditions générales d'utilisation du WRD, v. 4 janv. 2025 : base protégée par le droit d'auteur,
> accès personnel). L'auteur du projet déclare disposer de l'**autorisation de l'ICOLD** pour publier les extraits de ce dépôt ; **conservez cette autorisation par écrit**.
> Le fichier source `.xlsx` n'est pas versionné. Le logo ICOLD (`public/img/logo-icold.png`, repris du site officiel) n'est utilisé que pour créditer la source des données ; son usage relève de la même autorisation.

## Les défis

| Mode | Principe |
|---|---|
| 🗺️ Carte (3 niveaux) | 5 manches : placer le barrage sur la carte. 🟢 **Facile** : photo + indices, barrages les plus célèbres (500 photos tirées du registre) ; 🟡 **Moyen** : photo seule, barrages moins connus ; 🔴 **Difficile** : indices seuls, barrages moins connus. 3 indices payants (−10 % chacun). Un classement par niveau ; les niveaux difficiles rapportent plus d'XP. |
| 📅 Barrage du jour | Même barrage pour tous, 6 essais, un indice de plus à chaque erreur. Règles résumées dans un encart repliable de la partie. |
| 🛰️ Mission cartographe | 5 manches : 2 barrages « étalons » (position connue, mesurent la fiabilité) + 3 barrages **sans coordonnées** : la proposition est enregistrée. |

Zone de jeu : le monde (9 000 barrages, 700 max par pays), **un continent** (6 zones, sous-ensemble du pool monde, manches de pays distincts) ou **un pays** (83 pays, Chine et États-Unis complets). On la choisit sur l'accueil (recherche au clavier) ou **en cours de partie** via une liste déroulante qui relance le même défi dans la nouvelle zone.

## Gamification de la donnée et de son utilité

- **Mission cartographe** : chaque proposition de coordonnées est une *suggestion*, jamais une donnée officielle. Elle est pondérée par la fiabilité du joueur
  (score sur les étalons ; en dessous de 15 %, rien n'est retenu) et comparée aux autres joueurs (médiane géographique).
  Quand ≥ 3 avis convergent à moins de 50 km, le barrage passe « prêt à vérifier ».
- **Export pour l'équipe du registre** (protégé) : `GET /api/admin/contributions?format=csv` avec `Authorization: Bearer <ADMIN_TOKEN>` → un candidat par barrage (nom, pays, coordonnées médianes, nombre d'avis, dispersion en km, statut).
- **Utilité** : la page *Le registre* montre la complétude de chaque champ et **pourquoi il compte** ; chaque manche affiche « à quoi sert ce barrage » ; une jauge suit la progression de la communauté.
- **Profil local** (sans compte) : XP, 9 niveaux, 9 badges, série de jours. Stocké dans le navigateur.

## Correspondance avec le cahier des charges ICOLD (refonte du site)

Le prototype ne remplace pas le site de l'ICOLD ; il montre comment certaines attentes se traduisent en expérience grand public.

| Attente du cahier des charges | Statut |
|---|---|
| Design moderne, ordinateur/tablette/téléphone, français et anglais | ✅ responsive, FR/EN (détection + sélecteur), installable (PWA) |
| Accessibilité | ✅ lien d'évitement, focus visible, libellés ARIA, alternative clavier à la carte (« placer au centre »), `prefers-reduced-motion`, contrastes |
| Registre : contenu, chiffres clés, accès à l'application dédiée | ✅ page *Le registre* + lien officiel ; **la base elle-même n'est pas recréée** |
| Recherche et pages par barrage | ✅ recherche multi-champs intégrée à la page *Le registre* + fiche barrage |
| Dictionnaire technique multilingue | 🟡 glossaire discret (pied de page) : 23 termes FR/EN + quiz, lien vers le dictionnaire complet |
| Mentions légales, confidentialité, messages bilingues | ✅ page *À propos* (éditeur à renseigner avant mise en ligne) |
| Statistiques et outils pour l'équipe | 🟡 export CSV des contributions, jauge de progression |
| Hébergement UE, sauvegardes, reprise par un autre prestataire | 🟡 voir plus bas ; code ouvert et documenté |
| Compte unique (Keycloak), espaces de travail des comités, boutique BaseDoc, base des incidents | ⛔ hors périmètre (pas de compte : pseudo seulement) |

## Stack

| Couche | Techno |
|---|---|
| Front | HTML + JS ES modules (aucun build), Leaflet 1.9.4, fonds Esri, thème clair aux couleurs CIGB |
| App installable | PWA : `manifest.webmanifest`, `sw.js` (coque hors ligne), icônes `scripts/make_icons.py` |
| API + classements | Cloudflare Workers (`src/worker.js`), base D1 (`schema.sql`) |
| Données | Python/pandas (`scripts/build_data.py`) → `public/data/*.json` |
| Démo statique | `public/js/api.js` simule l'API dans le navigateur (activée sur `*.github.io` ou `?demo=1`) |

Les drapeaux (162 SVG, `public/flags/`) viennent de [flag-icons](https://github.com/lipis/flag-icons) (licence MIT, `public/flags/LICENSE-flag-icons.txt`) : embarqués, aucun appel à un service externe.

Tous les chemins sont **relatifs** : le même code tourne à la racine (Cloudflare) ou sous `/GeoDam/` (Pages).

## Anti-triche (sans login)

1. `POST /api/session` : jeton signé (HMAC) contenant mode, zone, graine et heure.
2. Les manches sont dérivées de la graine (`public/js/shared.js`, partagé client/serveur) ; le client n'envoie **que ses réponses**.
3. `POST /api/finish` : le serveur rejoue la partie, recalcule le score, vérifie un temps minimum, applique les indices (−10 % chacun) et renvoie un « claim » signé si le score entre dans le top 50 de la zone.
4. `POST /api/submit` : claim + pseudo → insertion avec l'IP (`CF-Connecting-IP`). 1 claim = 1 score, 10 scores/h/IP, 1 score « du jour » par IP et par zone.

Limite connue : les données sont publiques, un joueur motivé peut écrire un bot. La modération passe par `UPDATE scores SET hidden=1 WHERE id=…`.

## Données

`python -I scripts/build_data.py chemin/vers/world_register_dams_2025.xlsx` produit :

| Fichier | Contenu |
|---|---|
| `dams.json` | pool monde (9 000), indices enrichis (exploitant, réservoir, altitude, longueur, bassin versant…) |
| `country/XX.json` + `countries.json` | pools par pays, sans limite (Chine 7 115, États-Unis 5 378) |
| `missing.json` | 1 522 barrages sans coordonnées mais documentés (cours d'eau, ville ou région) |
| `bounds.json` | emprise de chaque pays (cadrage de la carte en mission) |
| `photos.json` | 1 500 barrages avec photo libre (Wikidata + Commons : auteur, licence, miniature), rapprochés du registre à < 3 km (`scripts/build_photos.py`). Les photos ne sont pas copiées, elles sont servies par Wikimedia. |
| `stats.json` | chiffres clés et complétude pour la page *Le registre* |

Contrôle qualité : 42 095 barrages géolocalisés sur 62 362, coordonnées à ~6 décimales, aucune hors plage ; 5 points isolés (> 1 500 km de leurs voisins) et 3 240 noms génériques exclus. Rapport : `data/qa_report.json`.

## Lancer en local

```bash
npm install
cp .dev.vars.example .dev.vars        # puis changez SECRET et ADMIN_TOKEN
npm run db:local                      # après un changement de schema.sql : DROP TABLE scores, contributions puis relancer
npm run dev                           # http://127.0.0.1:8787
npm run db:reset-local                # vide les scores de test
npm test                              # tests bout en bout (~2 min : temps minimum anti-triche)
```

## Démo GitHub Pages

Le workflow `.github/workflows/pages.yml` publie `public/`. **Une seule action manuelle** (GitHub ne l'autorise pas depuis un workflow) :
*Settings → Pages → Build and deployment → Source : **GitHub Actions***. Le déploiement suit à chaque push sur `main`.
En démo, aucun serveur : classements et contributions restent dans le navigateur (des joueurs fictifs peuplent les classements).

## Déployer la version complète

```bash
npx wrangler login
npx wrangler d1 create geodam --location=weur   # base en Europe de l'Ouest ; copier database_id dans wrangler.jsonc
npm run db:remote
npx wrangler secret put SECRET                  # chaîne aléatoire longue
npx wrangler secret put ADMIN_TOKEN             # accès à l'export des contributions
npm run deploy
```

## Sauvegarde, hébergement, reprise

- **UE** : `--location=weur` à la création de la base D1 ; le Worker, lui, s'exécute au plus près du joueur (sans donnée personnelle hors la requête).
- **Sauvegarde** : `npm run db:backup` (export SQL) — à planifier (ex. hebdomadaire) et à tester par une restauration (`wrangler d1 execute … --file=backup.sql`).
- **Réversibilité** : tout est dans ce dépôt (code, schéma, scripts de données) ; aucune dépendance propriétaire hors Cloudflare ; l'ICOLD garde la maîtrise de ses données.
- **Coûts (ordre de grandeur, à confirmer sur les grilles en vigueur)** : palier gratuit Cloudflare suffisant pour un usage modéré → 0 € de licence/hébergement + nom de domaine (~10–15 €/an) ≈ 30–45 € sur 3 ans, 50–75 € sur 5 ans. Au-delà du gratuit, l'offre Workers Paid (~5 USD/mois) ≈ 180 USD sur 3 ans.

## RGPD

L'IP est une donnée personnelle. Le joueur en est informé **au moment où il saisit son pseudo** (encadré avant le champ, FR/EN) ; la page *À propos* détaille finalités, base légale, durée (90 jours) et droits.
`IP_MODE="hash"` dans `wrangler.jsonc` enregistre un HMAC de l'IP (l'anti-abus continue de fonctionner). Purge suggérée :
`UPDATE scores SET ip=NULL WHERE created_at < datetime('now','-90 days')` (idem pour `contributions`).
