"""Validate public data identifiers, coordinates, country counts and photo provenance."""
import json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/"public/data"/p).read_text(encoding="utf-8"))
def main():
    world=load("dams.json");countries=load("countries.json");missing=load("missing.json");photos=load("photos.json");stats=load("stats.json");errors=[]
    def check(ok,message):
        if not ok:errors.append(message)
    def pool(rows,label,geo=True):
        ids=[r.get("id") for r in rows];check(len(ids)==len(set(ids)),label+": duplicate identifiers")
        for r in rows:
            check(bool(r.get("id")) and bool(r.get("n")),label+": missing identity")
            check(len(str(r.get("iso","")))==2,label+": invalid country")
            if geo:
                check(isinstance(r.get("la"),(int,float)) and math.isfinite(r["la"]) and -90<=r["la"]<=90,label+": invalid latitude")
                check(isinstance(r.get("lo"),(int,float)) and math.isfinite(r["lo"]) and -180<=r["lo"]<=180,label+": invalid longitude")
    pool(world,"world");pool(missing,"missing",False);pool(photos,"photos")
    check(stats["total"]>=stats["geo"]>=len(world),"inconsistent totals")
    check(not(set(d["id"] for d in world)&set(d["id"] for d in missing)),"missing pool overlaps world")
    for c in countries:
        rows=load("country/"+c["iso"]+".json");pool(rows,c["iso"])
        check(len(rows)==c["n"],c["iso"]+": count mismatch");check(all(r["iso"]==c["iso"] for r in rows),c["iso"]+": mixed countries")
    for p in photos:
        check(str(p.get("img","")).startswith("https://"),"photo URL must use HTTPS")
        check(bool(p.get("lic")) and bool(p.get("page")),"photo missing license/source")
    check(len(missing)<=stats["total"]-stats["geo"],"missing pool larger than total")
    if errors:raise SystemExit("\n".join(sorted(set(errors))))
    print("Data verified:",len(world),"world dams,",len(countries),"countries,",len(photos),"photos,",len(missing),"mission candidates.")
if __name__=="__main__":main()
