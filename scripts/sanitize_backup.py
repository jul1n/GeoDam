"""Remove connection identifiers and transient tokens from recovery exports."""
import sqlite3,sys
from pathlib import Path
def sanitize(path):
    target=Path(path)
    db=sqlite3.connect(":memory:");db.executescript(target.read_text(encoding="utf-8"))
    db.execute("UPDATE scores SET ip=NULL,ua=NULL,country=NULL");db.execute("UPDATE contributions SET ip=NULL")
    db.execute("DELETE FROM api_limits");db.execute("DELETE FROM finished_games")
    db.commit();target.write_text("\n".join(db.iterdump())+"\n",encoding="utf-8");db.close()
if __name__=="__main__":sanitize(sys.argv[1])
