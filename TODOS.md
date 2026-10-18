# TODOS

## Mesurer le coût de /api/mission/progress

**What:** mesurer le temps et les lignes lues de `/api/mission/progress` avec 1 000, 10 000 et 50 000 contributions.
**Why:** valider ou invalider le cache de 60 s (docs/designs/carte-vivante-contributions.md, R2).
**Pros:** décision éclairée sur une éventuelle table de totaux précalculés.
**Cons:** demande un jeu de données de test (~30 min).
**Context:** `src/worker.js:164`, `consensusRows` avec sous-requête corrélée, appelée sans authentification. Partir d'un `wrangler dev` local avec des lignes insérées dans `contributions`.
**Depends on / blocked by:** la carte vivante livrée.
