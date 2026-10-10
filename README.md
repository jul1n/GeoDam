# GéoDam

Jeu web bilingue (FR/EN) autour du **Registre mondial des barrages** de la CIGB/ICOLD (62 362 barrages, édition 2025).
Trois défis — une **carte à 3 niveaux** (avec photos libres de Wikimedia), le **barrage du jour** et la **mission cartographe** —,
un profil joueur (XP, niveaux, badges), des pages « site public » (le registre en chiffres avec recherche, glossaire, à propos) et un
dispositif qui fait compléter par les joueurs, avec sources et revue humaine, les ~20 000 barrages du registre sans coordonnées.

- **Démo en ligne** (GitHub Pages, serveur simulé dans le navigateur : classements et contributions restent locaux) : https://jul1n.github.io/GeoDam/
- **Version complète** : Cloudflare Workers + D1 (classements partagés, anti-triche, contributions).

> ⚠️ **Données.** Le registre est la propriété de la CIGB/ICOLD (conditions générales d'utilisation du WRD, v. 4 janv. 2025 : base protégée par le droit d'auteur,
> accès personnel). L'auteur du projet déclare disposer de l'**autorisation de l'ICOLD** pour publier les extraits de ce dépôt ; **conservez cette autorisation par écrit**.
> Le fichier source `.xlsx` n'est pas versionné. Le logo ICOLD (`public/img/logo-icold.png`, repris du site officiel) n'est utilisé que pour créditer la source des données ; son usage relève de la même autorisation.

## Les défis

| Mode | Principe |
|---|---|
| 🗺️ Carte (3 niveaux) | 5 manches : placer le barrage sur la carte. 3 indices payants (−10 % du score de la manche chacun). Un classement par niveau ; les niveaux difficiles rapportent plus d'XP (×1,5 en moyen, ×2 en difficile). |
| 📅 Barrage du jour | Même barrage pour tous, 6 essais : à chaque erreur, la distance, une flèche et un indice de plus (les suivants sont visibles mais verrouillés ; le dernier ajoute une photo quand elle existe). Règles résumées dans un encart repliable. |
| 🛰️ Mission cartographe | 5 manches : 2 barrages « étalons » (position connue, ils mesurent la fiabilité) + 3 barrages **sans coordonnées**. Chaque proposition doit être accompagnée d'une **source** (lien, précision estimée, commentaire) pour être enregistrée. |

### Niveaux de la carte

| Niveau | Contenu | Pool (monde) |
|---|---|---|
| 🟢 Facile | photo + indices du registre, barrages les plus célèbres | 428 (les 500 premières photos classées par notoriété Wikidata ayant un barrage du registre rapproché) |
| 🟡 Moyen | photo seule (indices payants : continent, pays, nom + données), barrages moins connus | 1 072 |
| 🔴 Difficile | indices seuls, sans photo, barrages moins connus | 6 500 |

Les pools sont calculés par `levelPool` (`public/js/shared.js`), **identique côté client, serveur et démo**. Un niveau est grisé si la zone choisie (pays, continent) n'a pas assez de photos (≥ 8, et ≥ 5 pays distincts hors pays) ; le jeu retombe alors sur le niveau difficile. Le niveau est mémorisé dans le navigateur et modifiable en cours de partie.

Zone de jeu : le monde (9 000 barrages, 700 max par pays), **un continent** (6 zones, sous-ensemble du pool monde, manches de pays distincts) ou **un pays** (83 pays, Chine et États-Unis complets). On la choisit sur l'accueil (recherche au clavier) ou **en cours de partie** via une liste déroulante qui relance le même défi dans la nouvelle zone.

## Gamification de la donnée et de son utilité

- **Mission cartographe** : chaque proposition de coordonnées est une *suggestion*, jamais une donnée officielle. Elle est pondérée par la fiabilité du joueur
  (score sur les étalons ; en dessous de 15 %, rien n'est retenu) et comparée aux autres joueurs (consensus sphérique pondéré).
  Quand ≥ 3 avis indépendants convergent avec une dispersion ≤ 5 km, le barrage passe « prêt à vérifier ».
- **Export pour l'équipe du registre** (protégé) : `GET /api/admin/contributions?format=csv` avec `Authorization: Bearer <ADMIN_TOKEN>` → un candidat par barrage (nom, pays, coordonnées candidates, nombre d'avis, dispersion en km, statut).
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
| Front | HTML + JS ES modules (aucun build pour le jeu), Leaflet 1.9.4, fonds Esri, thème clair aux couleurs CIGB, photos Wikimedia |
| App installable | PWA : `manifest.webmanifest`, `sw.js` (coque hors ligne), icônes `scripts/make_icons.py` |
| API + classements | Cloudflare Workers (`src/worker.js`), base D1 (`schema.sql`) |
| Données | Python/pandas (`scripts/build_data.py`) → `public/data/*.json` |
| Démo statique | `public/js/api.js` simule l'API dans le navigateur (activée sur `*.github.io` ou `?demo=1`) |
| Pages publiques | `scripts/build_public.py` génère les pages FR/EN indexables (fiches, pays, glossaire, sitemaps) |
| Qualité | tests unitaires, bout en bout (`test/e2e.mjs`), fiabilité, navigateur (Playwright) ; workflow `Quality` |

Les drapeaux (162 SVG, `public/flags/`) viennent de [flag-icons](https://github.com/lipis/flag-icons) (licence MIT, `public/flags/LICENSE-flag-icons.txt`) : embarqués, aucun appel à un service externe.

Tous les chemins sont **relatifs** : le même code tourne à la racine (Cloudflare) ou sous `/GeoDam/` (Pages).

## Anti-triche (sans login)

1. `POST /api/session` : jeton signé (HMAC) contenant mode, zone, graine et heure.
2. Les manches sont dérivées de la graine (`public/js/shared.js`, partagé client/serveur) ; le client n'envoie **que ses réponses**.
3. `POST /api/finish` : le serveur rejoue la partie, recalcule le score, vérifie un temps minimum, applique les indices (−10 % chacun) et renvoie un « claim » signé si le score entre dans le top 50 de la zone.
4. `POST /api/submit` : claim + pseudo → insertion avec un identifiant de connexion (`CF-Connecting-IP`, **haché par défaut** : `IP_MODE="hash"` ; `raw` stocke l'IP en clair). 1 claim = 1 score, 10 scores/h par connexion, 1 score « du jour » par connexion et par zone. Les classements sont séparés par zone **et par niveau** (`map:easy`, `map:medium`, `map:hard`).

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
npm install                           # hors d'un dossier Google Drive (node_modules y est très lent)
cp .dev.vars.example .dev.vars        # puis changez SECRET et ADMIN_TOKEN
npm run db:local                      # nouvelle base ; pour une base existante : db:migrate:local
npm run dev                           # http://127.0.0.1:8787
npm run db:reset-local                # vide les scores de test
npm test                              # tests bout en bout (~2 min : temps minimum anti-triche)
```

## Démo GitHub Pages

Le workflow `.github/workflows/pages.yml` génère les pages publiques puis publie `public/` à chaque push sur `main` (Pages est activé : *Settings → Pages → Source : GitHub Actions*).
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
- **Sauvegarde** : npm run db:backup:verified sur Windows : export anonymisé, restauration de contrôle et chiffrement local ; script de planification hebdomadaire fourni plus bas.
- **Réversibilité** : tout est dans ce dépôt (code, schéma, scripts de données) ; aucune dépendance propriétaire hors Cloudflare ; l'ICOLD garde la maîtrise de ses données.
- **Coûts (ordre de grandeur, à confirmer sur les grilles en vigueur)** : palier gratuit Cloudflare suffisant pour un usage modéré → 0 € de licence/hébergement + nom de domaine (~10–15 €/an) ≈ 30–45 € sur 3 ans, 50–75 € sur 5 ans. Au-delà du gratuit, l'offre Workers Paid (~5 USD/mois) ≈ 180 USD sur 3 ans.

## RGPD

L'IP est une donnée personnelle. Le joueur en est informé **au moment où il saisit son pseudo** (encadré avant le champ, FR/EN) ; la page *À propos* détaille finalités, base légale, durée (90 jours) et droits.
`IP_MODE="hash"` dans `wrangler.jsonc` enregistre un HMAC de l'IP (l'anti-abus continue de fonctionner). La purge est désormais quotidienne et automatique ; commande manuelle de secours :
`UPDATE scores SET ip=NULL WHERE created_at < datetime('now','-90 days')` (idem pour `contributions`).


## Fiabilité, apprentissage et découverte

La confirmation des réponses est activée par défaut ; le bouton Manche suivante avance le jeu. L’accueil propose un tutoriel d’une manche, un entraînement avec indices gratuits, des parcours par continent et des révisions espacées. Réponses, indices et repère en attente sont sauvegardés localement ; une partie peut être reprise depuis l’accueil. Une partie classée reste limitée à deux heures et à sa version des données. L’envoi final est réessayable et idempotent ; changer les réponses d’une partie déjà finalisée est refusé.

Le profil est exportable/importable avec validation ; XP de partie et récompenses d’acceptation sont attribués une seule fois. L’interface propose une saisie de coordonnées, un viseur central, des indices repliables sur mobile, des commandes agrandies, des onglets au clavier, des annonces ciblées et des tableaux textuels pour les graphiques.

La PWA versionne la coque avec une empreinte des fichiers, propose les mises à jour entre les parties et permet l’entraînement hors ligne. Une ressource manquante reçoit une erreur 503 plutôt que du HTML. Les cartes Esri et photos Wikimedia peuvent manquer hors ligne. Les classements restent ludiques : les données publiques permettent toujours à un bot de retrouver les réponses.

### Contributions et revue

Une proposition enregistrée comporte une URL HTTP(S), une précision estimée strictement positive (≤ 500 km), et éventuellement un commentaire. Le bonus est attribué seulement après enregistrement. Un vote par connexion et barrage est autorisé tant que l’identifiant est conservé. Cette restriction ne prouve pas l’identité : VPN, connexions partagées et changements d’IP restent possibles.

Le consensus compte un avis par connexion conservée, confiance ≥ 0,3 et précision déclarée ≤ 5 km. Il utilise des vecteurs de la sphère pondérés par la confiance et le groupe dominant. Au moins trois avis, dispersion ≤ 5 km, majorité ≥ 75 % et absence de groupe concurrent significatif rendent un candidat prêt à vérifier. La purge d’un identifiant retire son avis du calcul d’indépendance, sans effacer la proposition.

admin.html offre une interface protégée par ADMIN_TOKEN, uniquement en mémoire :
- GET /api/admin/contributions : candidats, ou ?format=csv pour un export échappé.
- GET /api/admin/detail?id=… : sources, précision et historique sans IP.
- POST /api/admin/review : {dam_id,status,lat,lon,note,reviewer}. Statuts in_review, accepted, rejected. Une acceptation exige une position vérifiée ; seules les propositions à moins de 5 km de celle-ci sont acceptées.
- POST /api/mission/status : {token} de la mission. Le profil suit les décisions ; une acceptation rapporte 25 XP une fois.

Les décisions sont historisées ; elles ne modifient jamais automatiquement le registre officiel.

### Migration sans effacement

Pour une base existante avec l’ancien schéma : sauvegarder, puis npm run db:migrate:local ; après validation, npm run db:migrate:remote. La migration conserve les propositions anciennes (version legacy, source vide) hors du nouveau consensus et masque les anciens scores quotidiens en doublon.

Pour une nouvelle base, npm run db:local ou db:remote utilisent le schéma complet. Ne pas appliquer ensuite la migration historique à cette base déjà complète. Ne plus supprimer les tables pour une mise à jour.

### Pages publiques et provenance

Configurer public/site.json : URL publique, éditeur et contact ; productionReady reste faux jusqu’à renseignement.
- npm run build génère le HTML FR/EN pour GitHub Pages : fiches des barrages présents dans les extraits publics, pages pays, glossaire, canonical, hreflang, partage social, robots et sitemaps fractionnés.
- python scripts/build_public.py --worker génère les pages générales et sert les fiches via le Worker, sans dizaines de milliers de fichiers statiques.
- npm run deploy vérifie données et configuration publique, puis construit le mode Worker.
- public/data/version.json contient édition, tailles, SHA-256 et empreinte globale. Les sessions sont liées à cette version.
- npm run data:check contrôle identifiants, coordonnées, pools pays, compteurs et provenance photo.
- La recherche précise qu’elle couvre les barrages chargés, pas tout le registre.

### Conservation et sauvegarde locale

IP_MODE=hash est le défaut ; mettre à jour un ancien .dev.vars qui imposerait raw. La purge quotidienne du Worker supprime après 90 jours les identifiants de connexion, navigateur et pays de connexion. Limites API et résultats temporaires expirent après un jour.

Sur Windows :
~~~powershell
# Export local anonymisé, contrôle de restauration, chiffrement DPAPI.
npm run db:backup:verified

# Base distante, sauvegarde uniquement vers le disque local.
powershell -NoProfile -File scripts/backup.ps1 -Remote

# Installation optionnelle : chaque lundi à 03:43, heure locale.
powershell -NoProfile -File scripts/install_backup_task.ps1 -Remote

# Déchiffrement sous le même utilisateur Windows.
powershell -NoProfile -File scripts/decrypt_backup.ps1 -Path chemin.sql.dpapi -Output restauration.sql
~~~
Les sauvegardes sont dans %LOCALAPPDATA%\GeoDam\Backups, sans upload, avec expiration après 30 jours. DPAPI nécessite le même utilisateur Windows ; une reprise ailleurs exige un déchiffrement explicite avant transfert. Identifiants IP, sessions et compteurs anti-abus ne sont pas restaurés ; propositions et décisions métier le sont. La tâche planifiée et les accès Cloudflare sont à configurer par l’opérateur ; les tests ne les installent pas.

src/storage.js isole les opérations SQL derrière un adaptateur D1. Un autre hébergement nécessite aussi d’adapter le service des assets et les tâches planifiées. Le SQL et les exports restent utilisables avec SQLite.

### Vérifications

~~~bash
npm run test:unit
python test/migration.py
npm run data:check
python scripts/verify_backup.py schema.sql
npm test
~~~
test/reliability.mjs vérifie concurrence, votes répétés, revue et protections des requêtes sur un serveur local avec les seuls secrets de test. test/browser.mjs vérifie mobile, clavier, reprise et hors ligne avec Playwright/Chrome. Le workflow Quality contrôle données, migration, logique, API et parcours navigateur.

L’illustration d’accueil représente une centrale hydroélectrique en coupe : prise immergée, conduite fermée, turbine et alternateur, puis restitution en aval. Elle respecte la préférence de réduction des animations. Principe : https://www.energy.gov/cmei/water/how-hydropower-works
