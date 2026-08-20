# VelaChess logo kit

Core mark: flat Moon White pawn (#F4F6FA) with one Lunar Yellow North Star (#F1E67A) on Deep Navy (#0B1020).
The pawn is neutral. The star carries the meaning.

## Contents

logo/ horizontal and stacked lockups — dark-bg, light-bg, monochrome
mark/ icon only — full colour, on-navy tile, monochrome, micro (pawn only)
favicon/ favicon.svg, PNG set, favicon.ico, apple-touch-icon, android/maskable
social/ og-image.svg (1200x630)

## Rules

- Below ~24px use the micro mark (`velachess-micro-*.svg`): star dropped, pawn only.
- Clear space on all sides = height of the pawn base. Minimum icon size 20px.
- Never recolour the pawn, never add a gradient, never add a second star.
- The product accent is **Vela Indigo #5B6CFF** (`--primary` in
  `styles/globals.css`, Brand Guide v3). It belongs to the interface, not to
  the mark — a pawn tinted with the accent is exactly the divergence the rule
  above prevents. A tile _behind_ the mark may carry it; the pawn stays Moon
  White on top.
- Wordmark text in these SVGs is set in Space Grotesk 700 for reference. **Convert to
  outlines before release** — the released wordmark is fixed artwork, not live text.
- Maskable icon keeps the mark inside the safe 80% circle; other icons use the tile as drawn.

## HTML

```html
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#0B1020" />
<meta property="og:image" content="/og-image.png" />
```
