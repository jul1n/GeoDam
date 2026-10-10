"""Restore SQL in a disposable SQLite database and validate integrity."""
import argparse,sqlite3,tempfile
from pathlib import Path
def verify(path):
    sql=Path(path).read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="geodam-restore-") as tmp:
        db=sqlite3.connect(str(Path(tmp)/"restore.sqlite"));db.executescript(sql)
        assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok","SQLite integrity failure"
        assert not db.execute("PRAGMA foreign_key_check").fetchall(),"Foreign key failure"
        for name in ["scores","contributions","contribution_reviews","finished_games","api_limits"]:db.execute("SELECT COUNT(*) FROM "+name).fetchone()
        assert not db.execute("SELECT 1 FROM contributions WHERE la NOT BETWEEN -90 AND 90 OR lo NOT BETWEEN -180 AND 180 OR trust NOT BETWEEN 0 AND 1 LIMIT 1").fetchone(),"Invalid coordinates/trust"
        db.close()
        print("Restore verified:",path)
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("backup");verify(p.parse_args().backup)
