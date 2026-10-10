-- Existing installations: apply once via Wrangler migrations.
ALTER TABLE contributions ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE contributions ADD COLUMN comment TEXT NOT NULL DEFAULT '';
ALTER TABLE contributions ADD COLUMN accuracy_km REAL;
ALTER TABLE contributions ADD COLUMN dataset_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE contributions ADD COLUMN status TEXT NOT NULL DEFAULT 'proposed';
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
