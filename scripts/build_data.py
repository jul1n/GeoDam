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
    d.loc[(d.year < 1000) | (d.year > 2026), "year"] = np.nan  # dates fantaisistes / barrages « en projet »

    usable = d.geo_ok & ~d.coarse & ~d.isolated & ~d.generic & (d.h >= 15)
    rep["jouables_h>=15m"] = int(usable.sum())
    p = d[usable].copy()

    # notoriété : grands barrages en tête (sert au barrage du jour et au niveau de difficulté)
    p["fame"] = (np.log1p(p.h.fillna(0)) * 1.0 + np.log1p(p.vol.fillna(0)) * 0.7
                 + np.log1p(p.mw.fillna(0)) * 0.5 + p.URL.notna() * 1.0)
    p = p.sort_values("fame", ascending=False)
    # équilibrage : max 700 barrages par pays (sinon Chine + USA = 40 % du jeu), puis les 9 000 plus notoires
    p = p[p.groupby("iso").cumcount() < 700].head(9000).reset_index(drop=True)
    p["tier"] = np.where(p.index < 2500, 3, 2)  # 3 = célèbre (barrage du jour, mode facile)

    def purposes(v):  # codes ICOLD, traduits côté front (FR/EN)
        if not isinstance(v, str):
            return []
        return [c for c in re.split(r"[^A-Z]", v.upper()) if c in PURPOSES][:3]

    def title(s):
        return s.title() if s else s

    def clean(v):
        return None if (v is None or (isinstance(v, float) and math.isnan(v))) else v

    dams = []
    for _, r in p.iterrows():
        t = str(r["Type"]).split("/")[0] if isinstance(r["Type"], str) else None
        dams.append({
            "id": str(r["Dam Code"]),
            "n": title(r["name"]),
            "c": str(r["French Country Name"]).strip(),
            "ce": str(r["Country Name"]).strip(),
            "iso": r["iso"],
            "ct": r["Continent"],
            "la": round(float(r.lat), 4),
            "lo": round(float(r.lon), 4),
            "y": None if pd.isna(r.year) else int(r.year),
            "h": None if pd.isna(r.h) else int(round(r.h)),
            "v": None if pd.isna(r.vol) else round(float(r.vol), 1),
            "mw": None if pd.isna(r.mw) else int(round(r.mw)),
            "r": title(r["River"]) if isinstance(r["River"], str) else None,
            "ci": title(r["City"]) if isinstance(r["City"], str) else None,
            "p": purposes(r["Purposes"]),
            "t": t if t in TYPES else None,
            "f": int(r.tier),
        })
    out = ROOT / "public" / "data"
    out.mkdir(parents=True, exist_ok=True)
    (out / "dams.json").write_text(json.dumps(dams, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rep["pool_final"] = len(dams)
    rep["par_tier"] = {int(k): int(v) for k, v in p.tier.value_counts().items()}
    rep["top_pays"] = p["French Country Name"].value_counts().head(10).to_dict()
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "qa_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    print("dams.json:", round((out / "dams.json").stat().st_size / 1e6, 2), "Mo")


if __name__ == "__main__":
    main()
