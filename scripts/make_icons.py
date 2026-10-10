"""Génère les icônes PWA (palette CIGB : marine #111a4c, bleu #5e70d0, orange #ee813c)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
NAVY, BLUE, ORANGE, WHITE = "#111a4c", "#5e70d0", "#ee813c", "#ffffff"


def icon(size, maskable=False):
    S = 4  # suréchantillonnage pour lisser les bords
    n = size * S
    im = Image.new("RGBA", (n, n), NAVY if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not maskable:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=NAVY)
    k = 0.62 if maskable else 0.78  # zone de sécurité pour le masque
    w = n * k
    x0, y0 = (n - w) / 2, (n - w) / 2
    u = lambda fx, fy: (x0 + fx * w, y0 + fy * w)
    # corps du barrage (trapèze) + eau amont + crête orange
    d.polygon([u(.12, .22), u(.88, .22), u(.74, .92), u(.26, .92)], fill=WHITE)
    d.polygon([u(.12, .22), u(.30, .22), u(.38, .92), u(.26, .92)], fill=BLUE)
    d.rectangle([*u(.08, .16), *u(.92, .26)], fill=ORANGE)
    for i in range(3):  # lignes d'eau
        y = .42 + i * .16
        d.line([u(.30 + i * .03, y), u(.70 - i * .03, y)], fill=BLUE, width=int(n * .018))
    return im.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for s in (192, 512):
    icon(s).save(OUT / f"icon-{s}.png")
    icon(s, True).save(OUT / f"maskable-{s}.png")
icon(180, True).save(OUT / "apple-touch-icon.png")
icon(64).save(OUT / "favicon-64.png")
print("ok")
