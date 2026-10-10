# GéoDam

Jeu web autour du registre mondial des barrages de la CIGB/ICOLD (62 362 barrages, 2025).
Trois modes sans photo : **carte muette** (5 manches), **plus haut / plus bas**, **barrage du jour**.
Classement sans compte : un bon score donne le droit d'inscrire un pseudo ; l'IP est enregistrée à ce moment-là.

## Stack

| Couche | Techno |
|---|---|
| Front | HTML + JS ES modules (aucun build), Leaflet 1.9.4, fonds Esri ; responsive mobile ; thème clair aux couleurs CIGB/ICOLD |
| App installable | PWA : `manifest.webmanifest`, `sw.js` (coque hors ligne), icônes générées par `scripts/make_icons.py` |
| Langues | FR / EN (`public/js/i18n.js`, détection auto + sélecteur) ; les erreurs de l'API sont des codes traduits côté client |
| API + classement | Cloudflare Workers (`src/worker.js`) |
| Base | Cloudflare D1 (SQLite) — table `scores` (`schema.sql`) |
| Données | Python/pandas (`scripts/build_data.py`) → `public/data/dams.json` |

Un seul déploiement (`wrangler deploy`) sert les fichiers statiques et l'API, gratuit au niveau d'usage d'un petit jeu.

## Anti-triche (sans login)

1. `POST /api/session` : le serveur signe (HMAC) un jeton contenant le mode, la graine aléatoire et l'heure.
2. Les manches/paires sont dérivées de la graine (`public/js/shared.js`, partagé client/serveur).
3. `POST /api/finish` : le client n'envoie **que ses réponses** ; le serveur rejoue la partie, recalcule le score, vérifie le temps minimum, et renvoie un « claim » signé si le score entre dans le top 50.
4. `POST /api/submit` : claim + pseudo → insertion avec l'IP (`CF-Connecting-IP`). Un claim = un score, 10 scores/heure/IP max, 1 score « du jour » par IP.

Limite connue : le jeu de données est public, donc un joueur motivé peut écrire un bot. Le serveur empêche surtout les scores falsifiés ; la modération se fait via `UPDATE scores SET hidden=1 WHERE id=…`.

## Données

Les champs pays / usages / types sont stockés en codes ou en double langue (`c` FR, `ce` EN) et traduits à l'affichage.

`python -I scripts/build_data.py chemin/vers/world_register_dams_2025.xlsx`

- 42 095 barrages géolocalisés sur 62 362 ; coordonnées à ~6 décimales, aucune hors plage.
- Filtres : hauteur ≥ 15 m, noms génériques exclus, points isolés à >1 500 km de leurs voisins exclus.
- Pool jeu : 9 000 barrages, max 700 par pays, dont 2 500 « célèbres » (barrage du jour). Rapport : `data/qa_report.json`.

> ⚠️ Le registre est la propriété de la CIGB/ICOLD. Vérifiez les conditions de réutilisation avant de rendre le dépôt public ; le fichier xlsx source n'est pas versionné.

## Lancer en local

```bash
npm install
cp .dev.vars.example .dev.vars        # puis changez SECRET
npm run db:local
npm run dev                           # http://127.0.0.1:8787
npm run db:reset-local                # (re)vide les scores de test
node test/e2e.mjs                     # tests bout en bout (≈ 30 s)
```

## Déployer

```bash
npx wrangler login
npx wrangler d1 create geodam         # copier database_id dans wrangler.jsonc
npm run db:remote
npx wrangler secret put SECRET        # chaîne aléatoire longue
npm run deploy
```

## RGPD

L'IP est une donnée personnelle. Le joueur en est informé au moment précis où il saisit son pseudo (encadré avant le champ, FR/EN). Pour limiter le risque : `IP_MODE="hash"` dans `wrangler.jsonc`
(HMAC de l'IP, l'anti-abus continue de fonctionner) et purge périodique (`DELETE FROM scores WHERE created_at < datetime('now','-90 days')` sur `ip`).
