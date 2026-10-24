# Vessel Slides logo

The mark is a play button made of two pieces: a gold **V** along its back and
lower edge, and the play tip. Every file here is drawn from the same shapes;
the letters are outlines, so nothing depends on a font being installed.

## Which file

| Layout | Use it for | Files |
|---|---|---|
| **Horizontal** | Website header, email signatures, documents, wide banners | `vessel-slides-horizontal-*` |
| **Horizontal, two lines** | Narrower headers, presentation title slides | `vessel-slides-horizontal-two-line-*` |
| **Stacked** | Square and portrait spaces: posters, social profile pages, merch | `vessel-slides-stacked-*` |
| **Stacked, small caps** | Tall, narrow spaces; app splash screens | `vessel-slides-stacked-caps-*` |
| **Wordmark** | Where the mark already appears nearby, or space is very wide and short | `vessel-slides-wordmark-*` |
| **Symbol** | Avatars, stickers, watermarks, anywhere the name is already known | `vessel-slides-symbol-*` |

Each comes in four colourways:

| Colourway | Background | Notes |
|---|---|---|
| `color` | White or light | The main version: gold V, navy tip and "Vessel", gold "Slides" |
| `reverse` | Navy or dark | White tip and "Vessel", light gold "Slides" |
| `navy` | White or light, one colour only | Single-colour printing, embroidery, stamps |
| `white` | Dark or photos, one colour only | Over photography or video; single-colour on dark |

`svg/` holds the master files (any size, any program that takes SVG).
`png/` holds transparent PNGs for Word, Google Slides, Canva and social media.

## App and website icons (`icon/`)

| File | Use |
|---|---|
| `vessel-app-icon.svg`, `vessel-app-icon-1024.png` | The app icon (Mac and Windows build from `build/icon.png`) |
| `favicon.svg` | Website favicon: its tip turns white in dark browsers |
| `favicon-32.png`, `favicon-48.png` | Fallback favicons for older browsers |
| `favicon-512.png` | Web app manifest, high-resolution favicon |
| `apple-touch-icon.png` (180 × 180) | iPhone and iPad home screen |

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Colours

| Name | Hex | Use |
|---|---|---|
| Gold light | `#D9B97A` | Start of the V's gradient (left) |
| Gold deep | `#A77D43` | End of the V's gradient (right); "Slides" on light backgrounds |
| Navy | `#16202B` | Tip and "Vessel" on light backgrounds; dark backgrounds |
| White | `#FFFFFF` | Tip and "Vessel" on dark backgrounds |

Where a gradient can't be used (embroidery, vinyl, one-colour print), the V is
solid gold deep `#A77D43`, or use the `navy` or `white` files.

## Typeface

**Sora** (SemiBold for "Vessel", Regular for "Slides"), by the Sora Project
Authors, under the SIL Open Font License 1.1. It's free to use in the logo and
on the website: [fonts.google.com/specimen/Sora](https://fonts.google.com/specimen/Sora).

## Clear space and size

- **Clear space:** keep empty space around the logo of at least a quarter of the
  mark's height on every side. The files already include it.
- **Minimum size:** horizontal logo 120 px (25 mm) wide; stacked 64 px (15 mm)
  wide; symbol 16 px. Below that, use the symbol or the app icon.

## Don't

- Stretch, squash, rotate or re-angle the mark.
- Re-colour the pieces outside the colourways above, or swap the V and tip colours.
- Put the `color` version on dark or busy backgrounds; use `reverse` or `white`.
- Re-type the name in another font; use the files.
- Add shadows, outlines or effects.
