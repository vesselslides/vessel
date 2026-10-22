// ProPresenter stores fonts by PostScript name ("Futura-Bold",
// "HelveticaNeue-CondensedBlack"); CSS selects by family plus weight/style.

const WEIGHTS: Array<[RegExp, number]> = [
  [/(hairline|thin)$/i, 100],
  [/(extra|ultra)light$/i, 200],
  [/light$/i, 300],
  [/(regular|roman|book|normal|plain)$/i, 400],
  [/medium$/i, 500],
  [/(semi|demi)bold$/i, 600],
  [/(extra|ultra)bold$/i, 800],
  [/bold$/i, 700],
  [/(heavy)$/i, 800],
  [/(black|ultra)$/i, 900]
];

export interface CssFont {
  /** A CSS font-family list, most specific first, ending in a generic family. */
  family: string;
  weight: number;
  italic: boolean;
}

/** "HelveticaNeue" → "Helvetica Neue". */
const spaced = (name: string): string => name.replace(/([a-z])([A-Z])/g, '$1 $2');

const quote = (name: string): string => `"${name.replace(/"/g, '')}"`;

export function cssFont(name: string, bold = false, italic = false): CssFont {
  const trimmed = name.trim() || 'Helvetica';
  const dash = trimmed.lastIndexOf('-');
  let family = trimmed;
  let weight = bold ? 700 : 400;
  let isItalic = italic;
  if (dash > 0) {
    let face = trimmed.slice(dash + 1);
    if (/(italic|oblique)$/i.test(face)) {
      isItalic = true;
      face = face.replace(/(italic|oblique)$/i, '');
    }
    // Width words describe the face, not the weight ("CondensedBold").
    const weightWord = face.replace(/^(condensed|compressed|narrow|extended|expanded)/i, '');
    const match = WEIGHTS.find(([re]) => re.test(weightWord));
    if (match || face === '' || /^(condensed|compressed|narrow|extended|expanded)/i.test(face)) {
      family = trimmed.slice(0, dash);
      if (match) weight = Math.max(match[1], bold ? 700 : 0);
    }
  }
  const names = [...new Set([trimmed, spaced(family), family])];
  const generic = /serif|georgia|times|garamond|baskerville|palatino|cambria/i.test(family) && !/sans/i.test(family) ? 'serif' : 'sans-serif';
  return { family: [...names.map(quote), 'system-ui', generic].join(', '), weight, italic: isItalic };
}
