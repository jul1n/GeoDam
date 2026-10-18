---
# gstack: design-md-format=spec
name: GéoDam
description: Un jeu de géo clair et vif, avec la rigueur d'un plan de génie civil, au service d'un vrai registre.
colors:
  primary: "#111a4c"
  on-primary: "#ffffff"
  brand: "#5365bd"
  on-brand: "#ffffff"
  accent: "#ee813c"
  on-accent: "#111a4c"
  success: "#76b861"
  success-ink: "#2f6b1f"
  surface: "#ffffff"
  background: "#f3f3f3"
  text: "#111a4c"
  text-muted: "#4a5270"
  line: "#d9dce8"
  warning: "#7a3a07"
  error: "#8a1c14"
typography:
  display:
    fontFamily: "Bricolage Grotesque"
    fontWeight: 700
    fontSize: "clamp(2rem, 4.5vw, 3.4rem)"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Source Sans 3"
    fontSize: 1rem
    lineHeight: 1.55
  label:
    fontFamily: "Source Sans 3"
    fontSize: 0.8rem
    fontWeight: 600
    letterSpacing: 0.04em
  mono:
    fontFamily: "JetBrains Mono"
    fontFeature: tnum
rounded:
  control: 6px
  panel: 10px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: 44px
  button-secondary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.control}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# DESIGN.md : GéoDam

Généré par /design-consultation le 2026-10-18. Aperçu de référence : `.gstack/tmp/geodam-design-preview.html` (non versionné ; à regénérer si besoin).

## Atmosphère
Un jeu de géo clair et vif pour la communauté ICOLD. Le ton est joueur, l'exécution est rigoureuse : données alignées, textes précis, peu de décoration. Le thème clair vient de la scène d'usage (ingénieurs et curieux, de jour, au bureau ou sur téléphone). Une variante sombre n'est pas dans le périmètre.

## Couleur (approche restreinte)
Marine, bleu et orange viennent de la charte ICOLD déjà en place (`public/css/style.css`). L'orange signale seulement l'action de contribution et la réponse ; le texte dessus est marine, jamais blanc (2,6:1 contre 6,8:1). Le vert signifie « validé ». Le texte secondaire est teinté marine, jamais un gris neutre. Contrastes du texte courant : au moins 4,5:1.

## Typographie
- Titres : Bricolage Grotesque. Texte et interface : Source Sans 3. Données (coordonnées, codes de barrage, distances) : JetBrains Mono avec chiffres alignés.
- Statut : **à vérifier avant l'intégration.** Licence SIL OFL et familles variables relevées dans des sources secondaires (Fontsource, annuaires), pas sur les pages officielles Google Fonts. Confirmer la licence, les poids et les accents français.
- Chargement : polices auto-hébergées (woff2 dans `public/fonts`, mises en cache par le service worker). Pas de CDN : cohérent avec l'IP hachée et la PWA hors ligne.

## Rayons et espacement
Rayons hiérarchisés : 6 px (champs, boutons), 10 px (panneaux), pleine rondeur seulement pour les pastilles. Fin du 16 px uniforme. Base 8 px, 4 px dans les tableaux serrés du registre.

## Signature : les anneaux de précision
Des cercles concentriques de 1, 5 et 25 km autour de la réponse. Ce sont de vraies échelles de précision, les mêmes que celles demandées en contribution (`accuracy_km`). À utiliser avec parcimonie : à la révélation et sur la carte, jamais en fond décoratif.

## Mouvement
Un seul moment signature : à la révélation, un anneau s'étend du clic jusqu'au vrai barrage (environ 600 ms, ease-out depuis un état déjà visible). Le reste se limite aux transitions utilitaires. `prefers-reduced-motion` coupe tout.

## Accessibilité
Cibles tactiles de 44 px, focus visible de 3 px, lien visité distinct, cartes toujours doublées d'une alternative (liste ou tableau) avec le même contenu.

## À éviter
Dégradés violets, grilles de trois cartes identiques, cartes empilées comme mise en page, emoji décoratifs, icônes dans des pastilles de couleur, rayon de 16 px partout, blanc sur orange, dégradé de teinte comme seul porteur d'information.

## Journal des décisions
- 2026-10-18 : charte ICOLD conservée et relevée (titres expressifs, données en mono, rayons hiérarchisés, anneaux de précision). Voix de design externes non lancées (Codex non installé, choix utilisateur).
