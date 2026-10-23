// The theme gallery: themes made by churches for churches. A starter set ships
// with Vessel; once Vessel's public repository is set (package.json
// "repository"), the gallery also lists the community's themes from
// gallery/themes.json there, and "Submit to the gallery" opens a prefilled
// GitHub issue for a theme to be added.
import { cleanTheme, type Theme } from './theme';

export interface GalleryEntry {
  theme: Theme;
  /** Who made it, e.g. a church's name. */
  author: string;
  description: string;
  tags: string[];
  /** A CSS background for the preview card, standing in for a motion background. */
  backdrop: string;
  /** Starter themes ship with Vessel; community ones come from the online list. */
  source: 'starter' | 'community';
}

export const GALLERY_INDEX = 'gallery/themes.json';
export const GALLERY_TAGS = ['Lyrics', 'Lower third', 'Scripture', 'Stream', 'Large print', 'Seasonal', 'Youth'] as const;

const base = { builtIn: false, bold: false, italic: false, uppercase: false, shadow: true, outlineWidth: 0, outlineColor: '#000000', bar: null } satisfies Partial<Theme>;
const full = { x: 0.06, y: 0.1, width: 0.88, height: 0.8 };

export const STARTER_GALLERY: GalleryEntry[] = [
  {
    theme: { ...base, id: 'gallery-sunday-morning', name: 'Sunday Morning', font: 'Avenir Next', bold: true, sizePt: 78, color: '#ffffff', align: 'center', valign: 'middle', box: full },
    author: 'Vessel',
    description: 'Clean, friendly lyrics that sit well over most motion backgrounds.',
    tags: ['Lyrics'],
    backdrop: 'linear-gradient(135deg, #1d3557, #457b9d 60%, #a8dadc)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-hymnal', name: 'Hymnal', font: 'Georgia', sizePt: 72, color: '#f7f0dc', align: 'center', valign: 'middle', box: full },
    author: 'Vessel',
    description: 'A warm serif for hymns and liturgy.',
    tags: ['Lyrics'],
    backdrop: 'linear-gradient(160deg, #3d2b1f, #7f5539 55%, #b08968)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-big-bold', name: 'Big & Bold', font: 'Impact', sizePt: 104, color: '#ffffff', align: 'center', valign: 'middle', box: full, uppercase: true, shadow: false, outlineWidth: 3 },
    author: 'Vessel',
    description: 'Large capitals with an outline: readable from the back of a big room.',
    tags: ['Lyrics', 'Youth'],
    backdrop: 'linear-gradient(135deg, #240046, #7b2cbf 50%, #e0aaff)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-modern-lower-third', name: 'Modern Lower Third', font: 'Helvetica Neue', bold: true, sizePt: 56, color: '#ffffff', align: 'left', valign: 'middle', box: { x: 0.05, y: 0.74, width: 0.9, height: 0.2 }, shadow: false, bar: { color: '#000000', opacity: 0.55 } },
    author: 'Vessel',
    description: 'Lyrics in a bar along the bottom, leaving the picture above clear.',
    tags: ['Lower third'],
    backdrop: 'linear-gradient(180deg, #2b2d42, #8d99ae 70%, #edf2f4)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-stream-caption', name: 'Stream Caption', font: 'Arial', bold: true, sizePt: 52, color: '#ffffff', align: 'center', valign: 'middle', box: { x: 0.08, y: 0.79, width: 0.84, height: 0.16 }, shadow: false, bar: { color: '#102a43', opacity: 0.85 } },
    author: 'Vessel',
    description: 'Small captions for the livestream picture, over the camera.',
    tags: ['Stream', 'Lower third'],
    backdrop: 'linear-gradient(135deg, #344e41, #588157 55%, #a3b18a)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-scripture-reading', name: 'Scripture Reading', font: 'Georgia', sizePt: 58, color: '#fdf6e3', align: 'left', valign: 'top', box: { x: 0.08, y: 0.1, width: 0.84, height: 0.78 } },
    author: 'Vessel',
    description: 'Longer passages, left-aligned like a page, with room for many lines.',
    tags: ['Scripture'],
    backdrop: 'linear-gradient(150deg, #22223b, #4a4e69 60%, #9a8c98)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-high-contrast', name: 'High Contrast', font: 'Verdana', bold: true, sizePt: 92, color: '#ffeb3b', align: 'center', valign: 'middle', box: full, shadow: false, bar: { color: '#000000', opacity: 0.9 } },
    author: 'Vessel',
    description: 'Large yellow words on solid black, for people who find small text hard to read.',
    tags: ['Large print', 'Lyrics'],
    backdrop: 'linear-gradient(135deg, #111, #333)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-top-line', name: 'Top Line', font: 'Helvetica Neue', sizePt: 60, color: '#ffffff', align: 'center', valign: 'top', box: { x: 0.06, y: 0.05, width: 0.88, height: 0.3 } },
    author: 'Vessel',
    description: 'Words at the top, for rooms where heads block the bottom of the screen.',
    tags: ['Lyrics'],
    backdrop: 'linear-gradient(180deg, #03045e, #0077b6 50%, #90e0ef)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-youth-night', name: 'Youth Night', font: 'Futura', bold: true, sizePt: 90, color: '#ffd23f', align: 'center', valign: 'middle', box: full, uppercase: true },
    author: 'Vessel',
    description: 'Bright capitals with energy.',
    tags: ['Youth'],
    backdrop: 'linear-gradient(135deg, #ff006e, #8338ec 50%, #3a86ff)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-christmas-gold', name: 'Christmas Gold', font: 'Georgia', italic: true, sizePt: 78, color: '#f3d27a', align: 'center', valign: 'middle', box: full },
    author: 'Vessel',
    description: 'Gold serif lettering for carol services.',
    tags: ['Seasonal'],
    backdrop: 'linear-gradient(160deg, #1b4332, #081c15 55%, #6a040f)',
    source: 'starter'
  },
  {
    theme: { ...base, id: 'gallery-easter-dawn', name: 'Easter Dawn', font: 'Palatino', sizePt: 76, color: '#fffaf0', align: 'center', valign: 'middle', box: full },
    author: 'Vessel',
    description: 'Soft and bright for Easter morning.',
    tags: ['Seasonal'],
    backdrop: 'linear-gradient(180deg, #ffafcc, #ffc8dd 40%, #fde4cf)',
    source: 'starter'
  }
];

const CSS_BACKDROP = /^(linear|radial)-gradient\([#\w\s,.%()-]{1,300}\)$|^#[0-9a-f]{3,8}$/i;

/** The online list, checked: entries with a usable theme only; anything odd left out. */
export function readGalleryIndex(raw: unknown): GalleryEntry[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { themes?: unknown }).themes) ? (raw as { themes: unknown[] }).themes : [];
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const out: GalleryEntry[] = [];
  for (const item of list.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<Record<keyof GalleryEntry, unknown>>;
    const theme = cleanTheme(e.theme);
    if (!theme || out.some((x) => x.theme.id === theme.id)) continue;
    const backdrop = str(e.backdrop, 320);
    out.push({
      theme: { ...theme, builtIn: false },
      author: str(e.author, 80) || 'Anonymous',
      description: str(e.description, 300),
      tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 30)).slice(0, 6) : [],
      backdrop: CSS_BACKDROP.test(backdrop) && !/url\s*\(/i.test(backdrop) ? backdrop : 'linear-gradient(135deg, #1f2937, #4b5563)',
      source: 'community'
    });
  }
  return out;
}

/** Starter themes first, then community ones not already listed. */
export const mergeGallery = (starter: GalleryEntry[], community: GalleryEntry[]): GalleryEntry[] => [
  ...starter,
  ...community.filter((c) => !starter.some((s) => s.theme.id === c.theme.id))
];

/** The web page that proposes a theme for the gallery: a GitHub issue with the theme filled in. */
export function submitUrl(repo: string, entry: { theme: Theme; author: string; description: string }): string {
  const { builtIn: _b, ...theme } = entry.theme;
  const body = [
    'A theme for the Vessel gallery.',
    '',
    `**Name:** ${theme.name}`,
    `**Made by:** ${entry.author || '(please add)'}`,
    `**What it's for:** ${entry.description || '(please add)'}`,
    '',
    'Please attach a screenshot of it on screen if you can.',
    '',
    '```json',
    JSON.stringify(theme, null, 2),
    '```'
  ].join('\n');
  const q = new URLSearchParams({ title: `Theme: ${theme.name}`, body, labels: 'theme' });
  return `https://github.com/${repo}/issues/new?${q.toString()}`;
}

/** Whether a gallery theme is already among yours (the same look under the same name). */
export const isInLibrary = (entry: GalleryEntry, mine: Theme[]): boolean => mine.some((t) => t.id === entry.theme.id || t.name === entry.theme.name);
