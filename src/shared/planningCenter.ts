// Planning Center Services: reading service plans (JSON:API responses) and
// turning a plan into a Vessel service playlist. The network side lives in the
// main process (main/planningCenter.ts), which holds the church's token.
import { planLyrics } from './pro/edit';
import { tidyLyrics } from './import/lyrics';
import type { LibraryItem } from './types';

export interface PcoServiceType {
  id: string;
  name: string;
}

export interface PcoPlan {
  id: string;
  /** The plan's own title ("Harvest Sunday"), often empty. */
  title: string;
  /** How Planning Center writes the date ("October 26, 2026"). */
  dates: string;
  sortDate: string;
  items: number;
}

export interface PcoItem {
  id: string;
  kind: 'song' | 'header' | 'other';
  title: string;
  /** For songs: the song's details and the arrangement chosen for this plan. */
  song?: {
    title: string;
    author: string;
    copyright: string;
    ccli: number;
    arrangement: string;
    /** Lyrics as Planning Center keeps them ("VERSE 1" lines between sections). */
    lyrics: string;
    /** Section order, e.g. ["Verse 1", "Chorus", "Verse 2", "Chorus"]. */
    sequence: string[];
  };
}

interface Resource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (json: unknown): Resource[] => {
  const data = (json as { data?: unknown })?.data;
  return Array.isArray(data) ? (data.filter((r) => r && typeof r.id === 'string') as Resource[]) : [];
};

export function parseServiceTypes(json: unknown): PcoServiceType[] {
  return list(json).map((r) => ({ id: r.id, name: str(r.attributes?.name) || 'Services' }));
}

export function parsePlans(json: unknown): PcoPlan[] {
  return list(json).map((r) => ({
    id: r.id,
    title: str(r.attributes?.title),
    dates: str(r.attributes?.dates),
    sortDate: str(r.attributes?.sort_date),
    items: Number(r.attributes?.items_count) || 0
  }));
}

/** The plan's name for a playlist: its title and date, e.g. "Harvest Sunday · October 26, 2026". */
export const planName = (p: PcoPlan): string => [p.title, p.dates].filter(Boolean).join(' · ') || 'Planning Center plan';

/** A plan's items with their songs and arrangements (from ?include=song,arrangement), in order. */
export function parsePlanItems(json: unknown): PcoItem[] {
  const included = new Map<string, Resource>();
  const extra = (json as { included?: unknown })?.included;
  if (Array.isArray(extra)) for (const r of extra as Resource[]) if (r && r.id) included.set(`${r.type}:${r.id}`, r);
  const related = (r: Resource, name: string, type: string): Resource | undefined => {
    const ref = r.relationships?.[name]?.data;
    return ref ? included.get(`${type}:${ref.id}`) : undefined;
  };
  return list(json)
    .map((r) => ({ r, sequence: Number(r.attributes?.sequence) || 0 }))
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ r }): PcoItem => {
      const type = str(r.attributes?.item_type);
      const title = str(r.attributes?.title).trim();
      if (type === 'header') return { id: r.id, kind: 'header', title };
      if (type !== 'song') return { id: r.id, kind: 'other', title };
      const song = related(r, 'song', 'Song');
      const arrangement = related(r, 'arrangement', 'Arrangement');
      const sequence = arrangement?.attributes?.sequence;
      return {
        id: r.id,
        kind: 'song',
        title,
        song: {
          title: str(song?.attributes?.title).trim() || title,
          author: str(song?.attributes?.author).trim(),
          copyright: str(song?.attributes?.copyright).trim(),
          ccli: Number(song?.attributes?.ccli_number) || 0,
          arrangement: str(arrangement?.attributes?.name).trim(),
          lyrics: str(arrangement?.attributes?.lyrics),
          sequence: Array.isArray(sequence) ? sequence.filter((s): s is string => typeof s === 'string') : []
        }
      };
    });
}

/** A title for matching: lower case, no accents, punctuation or "(Live)"-style notes. */
export function songKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((live|acoustic|radio version|reprise|demo)[^)]*\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The library song for a plan song, matched by title; null if there's none. */
export function findLibrarySong(item: PcoItem, library: LibraryItem[]): LibraryItem | null {
  const keys = [item.song?.title, item.title].filter((t): t is string => !!t).map(songKey);
  for (const key of keys) {
    const hit = library.find((l) => songKey(l.name) === key);
    if (hit) return hit;
  }
  return null;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Planning Center lyrics as Vessel song text: section labels become [Groups],
 * and when the arrangement has a section order, the groups are sung in it.
 */
export function lyricsToSongText(lyrics: string, sequence: string[] = []): string {
  const tidy = tidyLyrics(lyrics).text;
  if (!sequence.length) return tidy;
  const plan = planLyrics(tidy);
  const order = sequence.map((name) => plan.groups.findIndex((g) => sameName(g.name, name)));
  // Only follow the order when every section in it is in the lyrics.
  if (order.some((i) => i < 0)) return tidy;
  const written = new Set<number>();
  const blocks = order.map((i) => {
    const g = plan.groups[i];
    if (written.has(i)) return `[${g.name}]`;
    written.add(i);
    return [`[${g.name}]`, g.slides.join('\n\n')].join('\n');
  });
  // Sections that aren't in the order still come along, at the end.
  plan.groups.forEach((g, i) => !written.has(i) && g.slides.length && blocks.push([g.name ? `[${g.name}]` : '', g.slides.join('\n\n')].filter(Boolean).join('\n')));
  return blocks.join('\n\n');
}

/** "© 2006 sixsteps Music" → { year: 2006, publisher: "sixsteps Music" }. */
export function parseCopyright(copyright: string): { year: number; publisher: string } {
  const year = Number(/\b(1[89]\d\d|20\d\d)\b/.exec(copyright)?.[1]) || 0;
  const publisher = copyright
    .replace(/©|\(c\)|copyright/gi, '')
    .replace(/\b(1[89]\d\d|20\d\d)\b/, '')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim();
  return { year, publisher };
}
