"""Construit public/data/photos.json : barrages avec photo libre (Wikidata + Wikimedia Commons), pour le mode « Photo-mystère ».

Sources publiques : Wikidata (SPARQL) pour les barrages géolocalisés ayant une image, Wikimedia Commons (API) pour
l'auteur et la licence de chaque photo. Seules les licences libres sont conservées ; l'attribution est affichée dans le jeu.
Les photos ne sont PAS copiées dans le dépôt : elles sont servies par Wikimedia (miniatures 900 px).
Rapprochement optionnel avec le registre ICOLD (barrage le plus proche à < 3 km) pour enrichir les indices.

Usage : python -I scripts/build_photos.py   (nécessite d'abord scripts/build_data.py pour les rapprochements)
"""
import html
import json
import re
import time
import urllib.parse
import urllib.request
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "GeoDam/0.1 (https://github.com/jul1n/GeoDam; prototype)"
LIMIT = 1200      # candidats Wikidata (triés par notoriété)
KEEP = 600        # photos conservées au maximum
FREE = re.compile(r"^(CC BY|CC0|CC-BY|Public domain|PD|CC BY-SA|Attribution)", re.I)

SPARQL = """
SELECT ?d ?nen ?nfr ?img ?coord ?iso ?cen ?cfr ?sl WHERE {
  ?d wdt:P31 wd:Q12323; wdt:P18 ?img; wdt:P625 ?coord; wikibase:sitelinks ?sl .
  OPTIONAL { ?d wdt:P17 ?c . OPTIONAL { ?c wdt:P297 ?iso } OPTIONAL { ?c rdfs:label ?cen FILTER(LANG(?cen)="en") } OPTIONAL { ?c rdfs:label ?cfr FILTER(LANG(?cfr)="fr") } }
  OPTIONAL { ?d rdfs:label ?nen FILTER(LANG(?nen)="en") }
  OPTIONAL { ?d rdfs:label ?nfr FILTER(LANG(?nfr)="fr") }
} ORDER BY DESC(?sl) LIMIT %d
""" % LIMIT


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def km(a, b, c, d):
    p = 12742
    x = sin(radians(c - a) / 2) ** 2 + cos(radians(a)) * cos(radians(c)) * sin(radians(d - b) / 2) ** 2
    return p * asin(sqrt(x))


def main():
    q = urllib.parse.urlencode({"query": SPARQL, "format": "json"})
    rows = get("https://query.wikidata.org/sparql?" + q)["results"]["bindings"]
    seen, cands = set(), []
    for r in rows:
        qid = r["d"]["value"].rsplit("/", 1)[-1]
        m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", r["coord"]["value"])
        file = urllib.parse.unquote(r["img"]["value"].rsplit("/", 1)[-1])
        if qid in seen or not m or not re.search(r"\.(jpe?g|png)$", file, re.I):
            continue
        seen.add(qid)
        name = (r.get("nen") or r.get("nfr") or {}).get("value")
        if not name or re.fullmatch(r"Q\d+", name) or not r.get("iso"):
            continue
        cands.append({"id": qid, "n": name, "la": round(float(m.group(2)), 4), "lo": round(float(m.group(1)), 4), "file": file,
                      "iso": r["iso"]["value"], "ce": r.get("cen", {}).get("value"), "c": r.get("cfr", {}).get("value") or r.get("cen", {}).get("value")})
    print("candidats Wikidata :", len(cands))

    # métadonnées Commons (auteur, licence, miniature 900 px) par lots
    meta = {}
    for i in range(0, len(cands), 40):
        batch = cands[i:i + 40]
        titles = "|".join("File:" + c["file"] for c in batch)
        url = ("https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata|url|mime&iiurlwidth=900&format=json&titles="
               + urllib.parse.quote(titles))
        data = get(url)
        norm = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
        for page in data.get("query", {}).get("pages", {}).values():
            ii = (page.get("imageinfo") or [None])[0]
            if ii:
                meta[norm.get(page["title"], page["title"])[5:].replace("_", " ")] = ii
                meta[page["title"][5:].replace("_", " ")] = ii
        time.sleep(0.4)

    # registre ICOLD (rapprochement < 3 km) : pools monde + pays
    reg = {}
    for f in [ROOT / "public/data/dams.json", *sorted((ROOT / "public/data/country").glob("*.json"))]:
        for d in json.loads(f.read_text(encoding="utf-8")):
            reg[d["id"]] = d
    regl = list(reg.values())
    cont = {}
    for d in regl:
        cont.setdefault(d["iso"], {}).setdefault(d["ct"], 0)
        cont[d["iso"]][d["ct"]] += 1

    out, dropped = [], {"licence": 0, "meta": 0}
    for c in cands:
        ii = meta.get(c["file"].replace("_", " "))
        if not ii or not ii.get("thumburl"):
            dropped["meta"] += 1
            continue
        em = ii.get("extmetadata", {})
        lic = (em.get("LicenseShortName") or {}).get("value", "")
        if not FREE.match(lic):
            dropped["licence"] += 1
            continue
        artist = html.unescape(re.sub(r"<[^>]+>", "", (em.get("Artist") or {}).get("value", ""))).strip()
        near = min(((km(c["la"], c["lo"], d["la"], d["lo"]), d) for d in regl if abs(d["la"] - c["la"]) < 0.1 and abs(d["lo"] - c["lo"]) < 0.1), default=None, key=lambda t: t[0])
        rec = {
            "id": c["id"], "n": c["n"], "la": c["la"], "lo": c["lo"], "iso": c["iso"], "c": c["c"], "ce": c["ce"],
            "ct": max(cont[c["iso"]], key=cont[c["iso"]].get) if c["iso"] in cont else None,
            "img": ii["thumburl"].split("?")[0], "page": ii.get("descriptionurl"), "a": artist[:90] or None, "lic": lic, "licurl": (em.get("LicenseUrl") or {}).get("value"),
        }
        if near and near[0] < 3:
            d = near[1]
            rec["reg"] = {k: d.get(k) for k in ("id", "h", "y", "t", "v", "mw", "r", "ow", "rn", "p", "s", "ci") if d.get(k) not in (None, [], "")}
        out.append(rec)
        if len(out) >= KEEP:
            break
    (ROOT / "public/data/photos.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rep = {"candidats": len(cands), "retenus": len(out), "ecartes": dropped, "pays": len({o["iso"] for o in out}),
           "rapproches_registre": sum(1 for o in out if "reg" in o), "licences": {}}
    for o in out:
        rep["licences"][o["lic"]] = rep["licences"].get(o["lic"], 0) + 1
    (ROOT / "data/photos_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
