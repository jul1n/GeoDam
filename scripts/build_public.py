"""Generate crawlable bilingual pages without rebuilding the game. No runtime dependencies."""
import argparse, hashlib, html, json, re
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text(encoding="utf-8"))
def main():
    parser=argparse.ArgumentParser();parser.add_argument("--limit",type=int);parser.add_argument("--output");parser.add_argument("--production",action="store_true")
    args=parser.parse_args();out=Path(args.output) if args.output else ROOT/"public"
    site=load("public/site.json");base=site["url"].rstrip("/")+"/"
    if args.production and not(site.get("productionReady") and site.get("publisher") and site.get("contact")):
        raise SystemExit("Configure site.json publisher, contact, URL and productionReady before production deployment.")
    if not base.startswith("https://"):raise SystemExit("site URL must use HTTPS")
    files=[ROOT/"public/data/dams.json",*sorted((ROOT/"public/data/country").glob("*.json"))]
    all_dams={}
    for f in files:
        for d in json.loads(f.read_text(encoding="utf-8")):all_dams.setdefault(d["id"],d)
    dams=list(all_dams.values())
    if args.limit is not None:dams=dams[:args.limit]
    countries=load("public/data/countries.json");stats=load("public/data/stats.json")
    glossary=(ROOT/"public/js/pages.js").read_text(encoding="utf-8")
    terms=re.findall(r'\["([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)"\]',glossary)
    urls=[]
    def esc(s):return html.escape(str(s),quote=True)
    def safe_id(id):
        from urllib.parse import quote
        if "/" in str(id) or "\\" in str(id) or str(id) in (".",".."):raise ValueError("Unsafe dam id")
        return quote(str(id),safe="")
    def write_page(lang,path,title,desc,body):
        route=lang+"/"+path.strip("/")+"/" if path else lang+"/"
        target=out/route/"index.html";target.parent.mkdir(parents=True,exist_ok=True)
        depth=len(Path(route).parts);prefix="../"*depth
        canonical=base+route
        counterpart=("en" if lang=="fr" else "fr")+"/"+path.strip("/")+"/" if path else ("en" if lang=="fr" else "fr")+"/"
        labels=["Jouer","Le registre","Glossaire","À propos"] if lang=="fr" else ["Play","The register","Glossary","About"]
        nav='<nav aria-label="'+("Navigation" if lang=="fr" else "Navigation")+'">'+''.join('<a href="'+prefix+href+'">'+label+'</a> ' for href,label in zip(["index.html",lang+"/registre/",lang+"/glossaire/",lang+"/a-propos/"],labels))+'</nav>'
        meta='<link rel="canonical" href="'+esc(canonical)+'"><link rel="alternate" hreflang="'+lang+'" href="'+esc(canonical)+'"><link rel="alternate" hreflang="'+("en" if lang=="fr" else "fr")+'" href="'+esc(base+counterpart)+'">'
        meta+='<meta property="og:type" content="website"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(desc)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(base+"icons/icon-512.png")+'"><meta name="twitter:card" content="summary">'
        target.write_text('<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' · GéoDam</title><meta name="description" content="'+esc(desc)+'">'+meta+'<link rel="stylesheet" href="'+prefix+'css/style.css"><link rel="icon" href="'+prefix+'icons/favicon-64.png"></head><body><a class="skip" href="#content">'+("Aller au contenu" if lang=="fr" else "Skip to content")+'</a><header class="top"><div class="top-in"><a class="logo" href="'+prefix+'index.html">GéoDam</a>'+nav+'<a href="'+esc(base+counterpart)+'">'+("English" if lang=="fr" else "Français")+'</a></div></header><main id="content"><h1>'+esc(title)+'</h1>'+body+'</main><footer><p>ICOLD · World Register of Dams 2025</p><p>'+esc(site.get("publisher") or ("Prototype — éditeur à renseigner" if lang=="fr" else "Prototype — publisher not configured"))+'</p></footer></body></html>',encoding="utf-8")
        urls.append(canonical)
    for lang in ["fr","en"]:
        fr=lang=="fr"
        write_page(lang,"","Découvrir les barrages du monde" if fr else "Discover the dams of the world","Jeu de géographie et découverte des barrages." if fr else "A geography game to explore dams.",
            '<p>'+("Jouez, apprenez et documentez des propositions de localisation." if fr else "Play, learn and document location proposals.")+'</p><p><a href="../index.html">'+("Commencer une partie" if fr else "Start a game")+'</a></p>')
        country_links='<ul>'+''.join('<li><a href="../pays/'+c["iso"]+'/">'+esc(c["fr"] if fr else c["en"])+'</a> ('+str(c["n"])+')</li>' for c in countries)+'</ul>'
        write_page(lang,"registre","Le registre en chiffres" if fr else "The register in figures","Explorez les extraits publics du registre ICOLD." if fr else "Explore public extracts of the ICOLD register.",
            '<p>'+str(stats["total"])+' '+("barrages dans le registre ; " if fr else "dams in the register; ")+str(stats["geo"])+' '+("géolocalisés." if fr else "geolocated.")+'</p><p>'+("Ces fiches décrivent un extrait public, pas l’intégralité du registre. Six décimales ne garantissent pas une précision métrique." if fr else "These pages describe a public extract, not the complete register. Six decimal places do not guarantee metre-level accuracy.")+'</p>'+country_links)
        write_page(lang,"glossaire","Glossaire des barrages" if fr else "Dam glossary","Vocabulaire technique français et anglais." if fr else "Technical vocabulary in French and English.",
            '<dl class="terms">'+''.join('<div><dt>'+esc(x[0 if fr else 1])+'</dt><dd>'+esc(x[2 if fr else 3])+'</dd></div>' for x in terms)+'</dl>')
        contact=site.get("contact")
        write_page(lang,"a-propos","À propos et confidentialité" if fr else "About and privacy","Sources, éditeur et protection des données." if fr else "Sources, publisher and data protection.",
            '<p>'+("Données : ICOLD, registre 2025. Les propositions sont soumises à une revue humaine et ne modifient jamais automatiquement les données officielles." if fr else "Data: ICOLD, 2025 register. Proposals require human review and never automatically alter official data.")+'</p><p>'+("Scores et contributions : identifiant de connexion pseudonymisé, purgé après 90 jours. Profil local exportable. Les cartes et photos appellent Esri et Wikimedia." if fr else "Scores and contributions: pseudonymous connection identifier purged after 90 days. Exportable local profile. Maps and photos contact Esri and Wikimedia.")+'</p><p>'+esc(contact or ("Contact de l’éditeur à renseigner avant publication complète." if fr else "Publisher contact must be configured before full publication."))+'</p>')
        for c in countries:
            cd=[d for d in dams if d["iso"]==c["iso"]]
            body='<ul>'+''.join('<li><a href="../../barrages/'+safe_id(d["id"])+'/">'+esc(d["n"])+'</a></li>' for d in cd)+'</ul>'
            write_page(lang,"pays/"+c["iso"],("Barrages : " if fr else "Dams: ")+(c["fr"] if fr else c["en"]),("Fiches de barrages et découverte géographique." if fr else "Dam pages and geographical discovery."),body)
        for d in dams:
            fields=[("Pays" if fr else "Country",d.get("c" if fr else "ce")),("Cours d’eau" if fr else "River",d.get("r")),("Hauteur" if fr else "Height",str(d["h"])+" m" if d.get("h") is not None else None),("Année" if fr else "Year",d.get("y")),("Coordonnées" if fr else "Coordinates",str(d.get("la"))+", "+str(d.get("lo")))]
            body='<dl class="kv">'+''.join('<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>' for k,v in fields if v is not None)+'</dl><p>'+("Source : registre ICOLD 2025 ; extrait public, position à vérifier selon la précision de la source." if fr else "Source: ICOLD 2025 register; public extract, location subject to source accuracy.")+'</p><p><a href="../../pays/'+esc(d["iso"])+'/">'+("Autres barrages du pays" if fr else "More dams in this country")+'</a></p>'
            write_page(lang,"barrages/"+safe_id(d["id"]),d["n"],d["n"]+" · "+str(d.get("c" if fr else "ce",""))+" · ICOLD 2025",body)
    out.mkdir(parents=True,exist_ok=True)
    # Split sitemap for installations with more than 50,000 URLs.
    sitemap_names=[]
    for i in range(0,len(urls),45000):
        name="sitemap-"+str(i//45000)+".xml";sitemap_names.append(name)
        (out/name).write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+esc(u)+'</loc></url>' for u in urls[i:i+45000])+'</urlset>',encoding="utf-8")
    (out/"sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<sitemap><loc>'+esc(base+n)+'</loc></sitemap>' for n in sitemap_names)+'</sitemapindex>',encoding="utf-8")
    (out/"robots.txt").write_text("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: "+base+"sitemap.xml\n",encoding="utf-8")
    manifest={"version":site["datasetVersion"],"sourceEdition":"ICOLD WRD 2025","publicDams":len(all_dams),"worldPool":len(load("public/data/dams.json")),"files":{}}
    for f in sorted((ROOT/"public/data").rglob("*.json")):
        if f.name=="version.json":continue
        manifest["files"][str(f.relative_to(ROOT/"public")).replace("\\","/")]={"bytes":f.stat().st_size,"sha256":hashlib.sha256(f.read_bytes()).hexdigest()}
    (ROOT/"public/data/version.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Generated",len(urls),"indexable pages;",len(terms),"glossary terms;",len(all_dams),"public dams.")
if __name__=="__main__":main()
