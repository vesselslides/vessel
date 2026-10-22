// Lower thirds: a name and a second line in the lower left of the audience
// screen ("Pastor Sam · Lead Pastor"), staying up while the slides change.

export interface LowerThird {
  title: string;
  /** The second, smaller line; may be empty. */
  subtitle: string;
  /** The bar down the left side, #rrggbb. */
  color: string;
}

export interface SavedLowerThird extends LowerThird {
  id: string;
}

export const DEFAULT_LOWER_THIRD_COLOR = '#e0a526';

const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** A lower third typed by the operator, tidied; null when there's no title. */
export function cleanLowerThird(raw: Partial<LowerThird>): LowerThird | null {
  const title = String(raw.title ?? '').trim().slice(0, 120);
  if (!title) return null;
  return { title, subtitle: String(raw.subtitle ?? '').trim().slice(0, 160), color: isHex(raw.color) ? raw.color : DEFAULT_LOWER_THIRD_COLOR };
}

export const sameLowerThird = (a: LowerThird | null | undefined, b: LowerThird | null | undefined): boolean =>
  !!a && !!b && a.title === b.title && a.subtitle === b.subtitle && a.color === b.color;

/** Saved lower thirds as stored, with anything unusable left out. */
export function normalizeLowerThirds(raw: unknown): SavedLowerThird[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const clean = r && typeof r.id === 'string' ? cleanLowerThird(r) : null;
    return clean ? [{ id: r.id as string, ...clean }] : [];
  });
}

/** Keep this lower third at the top of the saved list (once, matched by its words), most recent first. */
export function rememberLowerThird(list: SavedLowerThird[], item: LowerThird, limit = 40): SavedLowerThird[] {
  const same = (s: SavedLowerThird): boolean => s.title === item.title && s.subtitle === item.subtitle;
  const existing = list.find(same);
  return [{ id: existing?.id ?? crypto.randomUUID(), ...item }, ...list.filter((s) => !same(s))].slice(0, limit);
}
