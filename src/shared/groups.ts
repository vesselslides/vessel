// Section names a church uses (Verse, Chorus, Bridge…), each with its colour
// and jump key. New songs and imports colour their groups from this list, and
// the show's letter keys follow it. Editable in Preferences ▸ Groups.

export interface GroupDefinition {
  name: string;
  /** #rrggbb */
  color: string;
  /** A single letter (A–Z) that jumps to this group during a show, if any. */
  key?: string;
}

/** A family's colour, a little lighter for each number, so Verse 1 and Verse 2 can be told apart. */
function shade(hex: string, step: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * Math.min(0.5, step * 0.09));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** A family: the plain name ("Verse") and numbered ones ("Verse 1"…), sharing a letter. */
function family(name: string, color: string, key: string, count = 0): GroupDefinition[] {
  return [{ name, color, key }, ...Array.from({ length: count }, (_v, i) => ({ name: `${name} ${i + 1}`, color: shade(color, i), key }))];
}

/** Like ProPresenter's: numbered verses, choruses and bridges, then the other common sections. */
export const DEFAULT_GROUPS: GroupDefinition[] = [
  ...family('Verse', '#216ed9', 'V', 6),
  ...family('Pre-Chorus', '#f28c1f', 'P', 3),
  ...family('Chorus', '#d12e52', 'C', 4),
  ...family('Bridge', '#8c45c7', 'B', 4),
  { name: 'Intro', color: '#2ea66b', key: 'I' },
  { name: 'Outro', color: '#2ea66b', key: 'E' },
  { name: 'Ending', color: '#2ea66b', key: 'E' },
  { name: 'Tag', color: '#d9b31a', key: 'T' },
  { name: 'Refrain', color: '#d12e52', key: 'R' },
  { name: 'Interlude', color: '#737380', key: 'N' },
  { name: 'Vamp', color: '#1f9e9e', key: 'A' },
  { name: 'Turnaround', color: '#1f9e9e', key: 'U' }
];

/** Colour for a group that matches nothing in the list. */
export const OTHER_GROUP_COLOR = '#737380';

let definitions: GroupDefinition[] = DEFAULT_GROUPS;

/** Use a church's own list (from settings); an empty or missing list means the defaults. */
export function setGroupDefinitions(list: GroupDefinition[] | undefined): void {
  definitions = list && list.length ? list.map(cleanGroup).filter((g): g is GroupDefinition => !!g) : DEFAULT_GROUPS;
}

export const groupDefinitions = (): GroupDefinition[] => definitions;

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The definition a group name belongs to. An exact name wins ("Verse 2");
 * otherwise the longest name it starts with, where a numbered definition only
 * matches its own number ("Verse 10" isn't "Verse 1", but "Verse 7" is
 * "Verse"), and "PRE CHORUS" is "Pre-Chorus".
 */
export function groupDefinitionFor(name: string): GroupDefinition | undefined {
  const n = squash(name);
  if (!n) return undefined;
  const exact = definitions.find((d) => squash(d.name) === n);
  if (exact) return exact;
  return [...definitions]
    .sort((a, b) => squash(b.name).length - squash(a.name).length)
    .find((d) => {
      const k = squash(d.name);
      if (!k || !n.startsWith(k)) return false;
      return /[a-z]$/.test(k) || !/^\d/.test(n.slice(k.length));
    });
}

/** A stored definition made safe: a name, a #rrggbb colour, an optional single letter. */
export function cleanGroup(raw: Partial<GroupDefinition> | undefined): GroupDefinition | null {
  const name = String(raw?.name ?? '').trim().slice(0, 40);
  if (!name) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(raw?.color)) ? String(raw!.color).toLowerCase() : OTHER_GROUP_COLOR;
  const key = String(raw?.key ?? '').trim().toUpperCase().slice(0, 1);
  return { name, color, ...(/^[A-Z]$/.test(key) ? { key } : {}) };
}
