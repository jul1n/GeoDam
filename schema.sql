CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sid        TEXT NOT NULL UNIQUE,          -- id de session signé : 1 session = 1 score max
  mode       TEXT NOT NULL,                 -- map | hilo | daily
  scope      TEXT NOT NULL DEFAULT 'world', -- 'world' ou code pays ISO (FR, CN, US…)
  period     TEXT NOT NULL,                 -- 'all' ou date YYYY-MM-DD (daily)
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  ip         TEXT,                          -- IP du joueur à l'enregistrement du score (ou son hash, cf. IP_MODE)
  country    TEXT,                          -- pays déduit par Cloudflare
  ua         TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0,    -- modération : UPDATE scores SET hidden=1 WHERE id=…
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rank ON scores (scope, mode, period, hidden, score DESC);
CREATE INDEX IF NOT EXISTS idx_ip   ON scores (ip, created_at);

-- Mission cartographe : propositions de coordonnées pour les barrages du registre sans géolocalisation.
-- Ce sont des SUGGESTIONS à valider par l'équipe du registre, jamais des données officielles.
CREATE TABLE IF NOT EXISTS contributions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sid        TEXT NOT NULL,                 -- session de jeu
  dam_id     TEXT NOT NULL,                 -- « Dam Code » du registre
  la         REAL NOT NULL,
  lo         REAL NOT NULL,
  trust      REAL NOT NULL,                 -- fiabilité du joueur sur les barrages étalons (0-1)
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sid, dam_id)
);
CREATE INDEX IF NOT EXISTS idx_contrib_dam ON contributions (dam_id);
