# Theme gallery

Vessel's **Themes ▸ Browse the gallery** lists a starter set of themes that
ships with the app, plus the community's themes from
[`themes.json`](themes.json) in this folder. Vessel fetches this file only when
someone opens the gallery.

## Sharing a theme

In Vessel, open **Themes ▸ Browse the gallery ▸ Share one of yours…**, choose
the theme and press **Submit…**. A GitHub issue opens with the theme filled in;
add a screenshot and submit it. You need a free GitHub account.

Only the theme travels: its font, size, colours and layout. No songs,
pictures or anything about your church beyond the name you type in.

## Adding a submitted theme (for maintainers)

Copy the theme's JSON from the issue into `themes` in `themes.json`:

```json
{
  "theme": { "id": "grace-church-clean", "name": "Clean", "font": "Avenir Next", "...": "..." },
  "author": "Grace Church",
  "description": "Lyrics over dark motion backgrounds",
  "tags": ["Lyrics"],
  "backdrop": "linear-gradient(135deg, #1d3557, #457b9d)"
}
```

- `id` must be unique in the file: letters, numbers and hyphens.
- `tags` come from: Lyrics, Lower third, Scripture, Stream, Large print,
  Seasonal, Youth.
- `backdrop` is the preview card's background: a CSS linear or radial gradient
  or a colour.

Vessel checks every entry when it reads the file (colours, sizes, fonts and the
backdrop), so a mistake leaves that theme out rather than breaking the gallery.
