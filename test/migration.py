import sqlite3,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
old="""CREATE TABLE scores(id INTEGER PRIMARY KEY AUTOINCREMENT,sid TEXT NOT NULL UNIQUE,mode TEXT NOT NULL,scope TEXT NOT NULL DEFAULT 'world',period TEXT NOT NULL,name TEXT NOT NULL,score INTEGER NOT NULL,ip TEXT,country TEXT,ua TEXT,hidden INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE TABLE contributions(id INTEGER PRIMARY KEY AUTOINCREMENT,sid TEXT NOT NULL,dam_id TEXT NOT NULL,la REAL NOT NULL,lo REAL NOT NULL,trust REAL NOT NULL,ip TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(sid,dam_id));"""
db=sqlite3.connect(":memory:");db.executescript(old)
db.execute("INSERT INTO contributions(sid,dam_id,la,lo,trust,ip) VALUES('legacy','dam',1,2,0.5,'test')")
for sid in ["first","second"]:
 db.execute("INSERT INTO scores(sid,mode,scope,period,name,score,ip) VALUES(?,'daily','world','2026-01-01','Test',5000,'test')",(sid,))
db.executescript((root/"migrations/0001_reliability.sql").read_text(encoding="utf-8"))
assert db.execute("SELECT source,dataset_version FROM contributions").fetchone()==("","legacy")
assert db.execute("SELECT COUNT(*) FROM scores WHERE hidden=0").fetchone()[0]==1
try:db.execute("INSERT INTO contributions(sid,dam_id,la,lo,trust) VALUES('bad','dam',0,190,0.5)");raise AssertionError("Bounds not enforced")
except sqlite3.IntegrityError:pass
assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
print("Legacy migration passed: records preserved, duplicate daily scores moderated, coordinate constraints enforced.")
