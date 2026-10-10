"""Nettoie le registre mondial des barrages (ICOLD) et produit public/data/dams.json.

Usage : python -I scripts/build_data.py <world_register_dams_2025.xlsx>
Sorties : public/data/dams.json (pool jouable) + data/qa_report.json (rapport qualité)
"""
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "world_register_dams_2025.xlsx"

PURPOSES = {"H": "Hydroélectricité", "I": "Irrigation", "S": "Eau potable", "C": "Protection crues",
            "R": "Loisirs", "N": "Navigation", "F": "Pisciculture"}
TYPES = {"TE": "Terre", "ER": "Enrochement", "PG": "Poids", "VA": "Voûte", "MV": "Voûtes multiples",
         "CB": "Contreforts"}
# noms trop génériques pour être devinables
GENERIC = re.compile(r"(\b(NO|N°|NUMBER|NR)\.?\s*\d+|\bDAM\s*\d+\b|\bPOND\b|\bTANK\b|\bSITE\b|\bUNNAMED\b|"
                     r"\bPROJECT\b|^\d+$|\bTAILINGS?\b|\bSTRUCTURE\b)", re.I)


def haversine(lat1, lon1, lat2, lon2):
    p = np.pi / 180
    a = (np.sin((lat2 - lat1) * p / 2) ** 2
         + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * np.arcsin(np.sqrt(a))


def decimals(x):
    s = f"{x:.7f}".rstrip("0")
    return len(s.split(".")[1]) if "." in s else 0


def main():
    d = pd.read_excel(SRC)
    d = d.loc[:, ~d.columns.str.startswith("Unnamed")]
    d.columns = [re.sub(r"[^\x00-\x7F]", "", c).strip() for c in d.columns]  # retire le « � » des en-têtes
    col = {c: c for c in d.columns}
    lat_c = next(c for c in col if c.startswith("Latitude"))
    lon_c = next(c for c in col if c.startswith("Longitude"))
    vol_c = next(c for c in col if c.startswith("Vol Reservoir"))
    rep = {"total": len(d)}

    d["lat"], d["lon"] = pd.to_numeric(d[lat_c], errors="coerce"), pd.to_numeric(d[lon_c], errors="coerce")
    g = d["lat"].notna() & d["lon"].notna()
    rep["avec_coordonnees"] = int(g.sum())
    bad_range = g & ((d.lat.abs() > 90) | (d.lon.abs() > 180) | ((d.lat == 0) & (d.lon == 0)))
    rep["hors_plage_ou_0_0"] = int(bad_range.sum())
    d["geo_ok"] = g & ~bad_range

    # précision : coordonnées entières = approximation > 50 km
    dec = d[["lat", "lon"]].where(d.geo_ok).map(lambda x: decimals(x) if pd.notna(x) else np.nan)
    d["coarse"] = d.geo_ok & (dec.max(axis=1) == 0)
    rep["coordonnees_entieres_imprecises"] = int(d.coarse.sum())

    # cohérence géographique : distance au 3e plus proche voisin du même pays
    d["iso"] = d["Reservoir ISO 3166"].fillna(d["Zone ISO 3166"])
    d["isolated"] = False
    for iso, grp in d[d.geo_ok].groupby("iso"):
        if len(grp) < 4:
            continue
        la, lo = grp.lat.to_numpy(), grp.lon.to_numpy()
        dist = haversine(la[:, None], lo[:, None], la[None, :], lo[None, :])
        dist.sort(axis=1)
        k3 = dist[:, 3]  # 0 = soi-même
        d.loc[grp.index[k3 > 1500], "isolated"] = True
    rep["isoles_suspects(>1500km du 3e voisin)"] = int(d.isolated.sum())

    # lat/lon inversées ? (point isolé qui redevient « normal » une fois inversé) -> on exclut simplement
    d["name"] = d["Dam Name"].astype(str).str.strip()
    d["generic"] = d.name.str.contains(GENERIC)
    rep["noms_generiques"] = int(d.generic.sum())

    d["h"] = pd.to_numeric(d["Height(m)"], errors="coerce")
    d["vol"] = pd.to_numeric(d[vol_c], errors="coerce") / 1000  # 1000 m3 -> hm3
    d["mw"] = pd.to_numeric(d["Elec. Power (MW)"], errors="coerce")
    d["year"] = pd.to_numeric(d["Year"], errors="coerce")
    num = lambda prefix: pd.to_numeric(d[next(c for c in d.columns if c.startswith(prefix))], errors="coerce")
    d["len"], d["el"], d["ca"] = num("Length (m)"), num("Elevation"), num("Catchment")
    d.loc[(d.year < 1000) | (d.year > 2026), "year"] = np.nan  # dates fantaisistes / barrages « en projet »

    d["ckey"] = d["iso"].astype(str).str.split("/").str[0]  # barrage transfrontalier -> 1er pays
    base = d.geo_ok & ~d.coarse & ~d.isolated & ~d.generic
    rep["jouables_h>=15m"] = int((base & (d.h >= 15)).sum())

    def with_fame(df):
        df = df.copy()
        # notoriété : grands barrages en tête (barrage du jour, niveau de difficulté)
        df["fame"] = (np.log1p(df.h.fillna(0)) * 1.0 + np.log1p(df.vol.fillna(0)) * 0.7
                      + np.log1p(df.mw.fillna(0)) * 0.5 + df.URL.notna() * 1.0)
        return df.sort_values("fame", ascending=False)

    def purposes(v):  # codes ICOLD, traduits côté front (FR/EN)
        if not isinstance(v, str):
            return []
        return [c for c in re.split(r"[^A-Z]", v.upper()) if c in PURPOSES][:3]

    def title(s):
        return s.title() if s else s

    def txt(v):
        v = str(v).strip() if isinstance(v, str) else None
        return v[:60].title() if v else None

    def records(df):
        out = []
        for _, r in df.iterrows():
            t = str(r["Type"]).split("/")[0] if isinstance(r["Type"], str) else None
            out.append({
                "id": str(r["Dam Code"]), "n": title(r["name"]),
                "c": str(r["French Country Name"]).strip(), "ce": str(r["Country Name"]).strip(),
                "iso": r["ckey"], "ct": r["Continent"],
                "la": round(float(r.lat), 4), "lo": round(float(r.lon), 4),
                "y": None if pd.isna(r.year) else int(r.year),
                "h": None if pd.isna(r.h) else int(round(r.h)),
                "v": None if pd.isna(r.vol) else round(float(r.vol), 1),
                "mw": None if pd.isna(r.mw) else int(round(r.mw)),
                "r": title(r["River"]) if isinstance(r["River"], str) else None,
                "ci": title(r["City"]) if isinstance(r["City"], str) else None,
                "s": title(r["St/Pr"]) if isinstance(r["St/Pr"], str) else None,
                "p": purposes(r["Purposes"]), "t": t if t in TYPES else None, "f": int(r.tier),
                "ow": txt(r["Owner/Operator"]), "rn": txt(r["Reservoir Name"]),
                "len": None if pd.isna(r["len"]) else int(round(r["len"])),
                "el": None if pd.isna(r.el) else int(round(r.el)),
                "ca": None if pd.isna(r.ca) else int(round(r.ca)),
            })
        return out

    dump = lambda path, obj: path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    out = ROOT / "public" / "data"
    (out / "country").mkdir(parents=True, exist_ok=True)
    for old in (out / "country").glob("*.json"):
        old.unlink()

    # ---- pool « monde » : 700 max par pays (sinon Chine + USA = 40 % du jeu), 9 000 plus notoires ----
    p = with_fame(d[base & (d.h >= 15)])
    p = p[p.groupby("ckey").cumcount() < 700].head(9000).reset_index(drop=True)
    p["tier"] = np.where(p.index < 2500, 3, 2)  # 3 = célèbre
    world = records(p)
    dump(out / "dams.json", world)
    rep["pool_monde"] = len(world)

    # ---- pools par pays : AUCUNE limite (Chine, États-Unis complets) ----
    countries = []
    for ck, g in d[base].groupby("ckey"):
        sel = g[g.h >= 15]
        if len(sel) < 40:                      # petits pays : on descend le seuil à 10 m
            sel = g[g.h >= 10]
        if len(sel) < 20:
            continue
        sel = with_fame(sel).reset_index(drop=True)
        top = int(min(max(8, len(sel) * 0.25), 300))  # « célèbres » : 25 % (max 300) -> barrage du jour
        sel["tier"] = np.where(sel.index < top, 3, 2)
        recs = records(sel)
        dump(out / "country" / f"{ck}.json", recs)
        def cname(col):  # nom propre du pays (pas « Argentine/Paraguay » d'un barrage frontalier)
            names = g[col].dropna().astype(str).str.strip()
            solo = names[~names.str.contains("/")]
            return (solo if len(solo) else names).value_counts().index[0]
        countries.append({"iso": ck, "fr": cname("French Country Name"), "en": cname("Country Name"), "n": len(recs)})
    countries.sort(key=lambda c: -c["n"])
    dump(out / "countries.json", countries)
    rep["pays_jouables"] = len(countries)
    rep["pays_top"] = {c["en"]: c["n"] for c in countries[:8]}

    # ---- mission cartographe : barrages sans coordonnées, assez documentés pour être localisés ----
    miss = d[~d.geo_ok & ~d.generic & (d.h >= 8) & (d.River.notna() | d.City.notna() | d["St/Pr"].notna())].copy()
    miss = with_fame(miss)
    miss = miss[miss.groupby("ckey").cumcount() < 150].head(6000).reset_index(drop=True)
    miss["tier"] = 2
    miss["lat"], miss["lon"] = 0.0, 0.0
    mrecs = records(miss)
    for m in mrecs:
        m.pop("la"); m.pop("lo"); m.pop("f")
    dump(out / "missing.json", mrecs)
    # emprise de chaque pays (tous barrages géolocalisés non suspects) : cadrage de la carte en mission cartographe
    bounds = {}
    for ck, g in d[d.geo_ok & ~d.isolated].groupby("ckey"):
        bounds[ck] = [round(float(g.lat.min()), 2), round(float(g.lon.min()), 2), round(float(g.lat.max()), 2), round(float(g.lon.max()), 2)]
    dump(out / "bounds.json", bounds)
    rep["a_localiser_total"] = int((~d.geo_ok).sum())
    rep["a_localiser_pool_mission"] = len(mrecs)

    # ---- « le registre en chiffres » ----
    pct = lambda ser: round(float(ser.notna().mean()) * 100, 1)
    purp = d["Purposes"].dropna().astype(str).str.upper().str.findall(r"[A-Z]").explode()
    fields = {"Hauteur": d.h, "Année": d.year, "Cours d'eau": d.River, "Type": d.Type, "Usages": d.Purposes,
              "Volume du réservoir": d.vol, "Propriétaire": d["Owner/Operator"], "Altitude": d.el,
              "Puissance (MW)": d.mw, "Coordonnées GPS": d.lat.where(d.geo_ok)}
    dec = (d.year // 10 * 10).dropna().astype(int)
    dec = dec[(dec >= 1800) & (dec <= 2020)].value_counts().sort_index()
    tall = d.sort_values("h", ascending=False).head(10)
    big = d.sort_values("vol", ascending=False).head(10)
    stats = {
        "total": int(len(d)), "geo": int(d.geo_ok.sum()), "pays": int(d.ckey.nunique()),
        "completude": {k: pct(v) for k, v in fields.items()},
        "usages": {c: int((purp == c).sum()) for c in PURPOSES},
        "types": {k: int((d.Type.astype(str).str.split("/").str[0] == k).sum()) for k in TYPES},
        "decennies": {int(k): int(v) for k, v in dec.items()},
        "top_pays": [{"fr": n, "n": int(c)} for n, c in d["French Country Name"].value_counts().head(10).items()],
        "top_pays_en": [{"en": n, "n": int(c)} for n, c in d["Country Name"].value_counts().head(10).items()],
        "plus_hauts": [{"n": title(r["name"]), "c": r["French Country Name"], "ce": r["Country Name"], "h": int(r.h)} for _, r in tall.iterrows()],
        "plus_gros": [{"n": title(r["name"]), "c": r["French Country Name"], "ce": r["Country Name"], "v": round(float(r.vol), 1)} for _, r in big.iterrows()],
    }
    dump(out / "stats.json", stats)

    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "qa_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    sizes = sorted(((f.stat().st_size, f.name) for f in (out / "country").glob("*.json")), reverse=True)[:3]
    print("dams.json:", round((out / "dams.json").stat().st_size / 1e6, 2), "Mo ; plus gros pays:", sizes)


if __name__ == "__main__":
    main()
