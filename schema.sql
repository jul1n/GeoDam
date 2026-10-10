CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sid        TEXT NOT NULL UNIQUE,          -- id de session signé : 1 session = 1 score max
  mode       TEXT NOT NULL,                 -- map | hilo | daily
  period     TEXT NOT NULL,                 -- 'all' ou date YYYY-MM-DD (daily)
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  ip         TEXT,                          -- IP du joueur à l'enregistrement du score (ou son hash, cf. IP_MODE)
  country    TEXT,                          -- pays déduit par Cloudflare
  ua         TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0,    -- modération : UPDATE scores SET hidden=1 WHERE id=…
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rank ON scores (mode, period, hidden, score DESC);
CREATE INDEX IF NOT EXISTS idx_ip   ON scores (ip, created_at);
