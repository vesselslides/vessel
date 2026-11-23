// The closest free look-alike for fonts churches often get in presentations
// but may not have on the projection computer. Each stand-in is on Google
// Fonts, so Vessel can download it.
const LOOK_ALIKES: Array<[RegExp, string]> = [
  [/^gotham/i, 'Montserrat'],
  [/^proxima ?nova/i, 'Figtree'],
  [/^helvetica/i, 'Inter'],
  [/^arial/i, 'Arimo'],
  [/^calibri/i, 'Carlito'],
  [/^cambria/i, 'Caladea'],
  [/^segoe/i, 'Open Sans'],
  [/^futura/i, 'Jost'],
  [/^avenir/i, 'Nunito Sans'],
  [/^gill ?sans/i, 'Lato'],
  [/^myriad/i, 'Source Sans 3'],
  [/^brandon/i, 'Josefin Sans'],
  [/^(adobe )?garamond/i, 'EB Garamond'],
  [/^bebas/i, 'Bebas Neue'],
  [/^didot/i, 'Playfair Display'],
  [/^century gothic/i, 'Questrial'],
  [/^franklin gothic/i, 'Libre Franklin'],
  [/^trade gothic/i, 'Archivo Narrow'],
  [/^din/i, 'Barlow'],
  [/^circular/i, 'DM Sans'],
  [/^sofia pro/i, 'Nunito'],
  [/^museo sans/i, 'Mulish'],
  [/^(sf pro|san francisco)/i, 'Inter'],
  [/^times/i, 'Tinos'],
  [/^georgia/i, 'Gelasio'],
  [/^verdana/i, 'DejaVu Sans'],
  [/^(trebuchet)/i, 'Fira Sans'],
  [/^impact/i, 'Anton'],
  [/^(courier)/i, 'Cousine']
];

/** The closest free font to `name`, if one is known ("Gotham Bold" → Montserrat). */
export function lookAlikeFor(name: string): string | undefined {
  const n = name.trim().replace(/[-_]/g, ' ');
  return LOOK_ALIKES.find(([re]) => re.test(n))?.[1];
}

/** The family part of a name the slides use ("Montserrat SemiBold" → "Montserrat"), for looking it up as a free font. */
export function freeFamilyOf(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b(thin|hairline|extra ?light|ultra ?light|light|regular|book|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy|italic|oblique)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
