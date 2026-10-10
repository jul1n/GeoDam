CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sid        TEXT NOT NULL UNIQUE,          -- id de session signÃ© : 1 session = 1 score max
  mode       TEXT NOT NULL,                 -- map | hilo | daily
  scope      TEXT NOT NULL DEFAULT 'world', -- 'world' ou code pays ISO (FR, CN, USâ€¦)
  period     TEXT NOT NULL,                 -- 'all' ou date YYYY-MM-DD (daily)
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL CHECK(score BETWEEN 0 AND 25000),
  ip         TEXT,                          -- IP du joueur Ã  l'enregistrement du score (ou son hash, cf. IP_MODE)
  country    TEXT,                          -- pays dÃ©duit par Cloudflare
  ua         TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0,    -- modÃ©ration : UPDATE scores SET hidden=1 WHERE id=â€¦
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rank ON scores (scope, mode, period, hidden, score DESC);
CREATE INDEX IF NOT EXISTS idx_ip   ON scores (ip, created_at);

-- Mission cartographe : propositions de coordonnÃ©es pour les barrages du registre sans gÃ©olocalisation.
-- Ce sont des SUGGESTIONS Ã  valider par l'Ã©quipe du registre, jamais des donnÃ©es officielles.
CREATE TABLE IF NOT EXISTS contributions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sid        TEXT NOT NULL,                 -- session de jeu
  dam_id     TEXT NOT NULL,                 -- Â« Dam Code Â» du registre
  la         REAL NOT NULL,
  lo         REAL NOT NULL,
  trust      REAL NOT NULL,                 -- fiabilitÃ© du joueur sur les barrages Ã©talons (0-1)
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  accuracy_km REAL CHECK(accuracy_km > 0 AND accuracy_km <= 500),
  dataset_version TEXT NOT NULL DEFAULT 'legacy',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_review','accepted','rejected')),
  CHECK(la BETWEEN -90 AND 90),CHECK(lo BETWEEN -180 AND 180),CHECK(trust BETWEEN 0 AND 1),
  UNIQUE (sid, dam_id)
);
CREATE INDEX IF NOT EXISTS idx_contrib_dam ON contributions (dam_id);

CREATE INDEX IF NOT EXISTS idx_contrib_identity ON contributions(dam_id,ip,created_at);
CREATE INDEX IF NOT EXISTS idx_contrib_retention ON contributions(created_at);
CREATE TABLE IF NOT EXISTS contribution_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,dam_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('in_review','accepted','rejected')),
 lat REAL CHECK(lat BETWEEN -90 AND 90),lon REAL CHECK(lon BETWEEN -180 AND 180),
 note TEXT NOT NULL,reviewer TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_dam ON contribution_reviews(dam_id,id);
CREATE TABLE IF NOT EXISTS finished_games (
 sid TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,response TEXT NOT NULL,lock_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_limits (
 key TEXT NOT NULL,bucket INTEGER NOT NULL,n INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(key,bucket)
);
UPDATE scores SET hidden=1,ip=NULL WHERE mode='daily' AND ip IS NOT NULL
 AND id NOT IN (SELECT MIN(id) FROM scores WHERE mode='daily' AND ip IS NOT NULL GROUP BY scope,period,ip);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_unique ON scores(scope,period,ip) WHERE mode='daily' AND ip IS NOT NULL;
