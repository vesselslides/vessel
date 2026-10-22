// CCLI: a song's copyright details (kept in the .pro file the way ProPresenter
// keeps them), the copyright line shown on screen, and the usage report a
// licensed church sends to CCLI.
import { create } from '@bufbuild/protobuf';
import { Presentation_CCLISchema, type Presentation } from './gen/presentation_pb';

export interface SongInfo {
  title: string;
  /** Writers, as CCLI lists them ("Words and music by"). */
  authors: string;
  publisher: string;
  /** 0 when unknown. */
  year: number;
  /** CCLI song number; 0 when unknown. */
  songNumber: number;
  /** Show the copyright line on screen for this song (ProPresenter's CCLI "display"). */
  display: boolean;
}

export type CopyrightPosition = 'off' | 'first' | 'last' | 'both' | 'all';

export function songInfoOf(p: Presentation): SongInfo {
  const c = p.ccli;
  return {
    title: c?.songTitle || p.name,
    authors: c?.author || c?.artistCredits || '',
    publisher: c?.publisher ?? '',
    year: c?.copyrightYear ?? 0,
    songNumber: c?.songNumber ?? 0,
    display: c?.display ?? false
  };
}

/** Whether a song has anything worth putting on a copyright line. */
export const hasCopyrightDetails = (info: SongInfo): boolean => !!(info.authors || info.publisher || info.year || info.songNumber);

/** Scripture (marked the way ProPresenter marks it) isn't a song: no copyright line, not reported. */
export const isScripture = (p: Presentation): boolean => !!p.bibleReference;

export function withSongInfo(p: Presentation, info: SongInfo): Presentation {
  const previous = p.ccli;
  return {
    ...p,
    ccli: create(Presentation_CCLISchema, {
      songTitle: info.title.trim(),
      author: info.authors.trim(),
      artistCredits: previous?.artistCredits ?? '',
      publisher: info.publisher.trim(),
      copyrightYear: Math.max(0, Math.round(info.year) || 0),
      songNumber: Math.max(0, Math.round(info.songNumber) || 0),
      display: info.display,
      album: previous?.album ?? '',
      artwork: previous?.artwork ?? new Uint8Array()
    })
  };
}

/** "“Title” · Words and music by … · © 2020 Publisher · CCLI Song # 123 · CCLI Licence # 456" */
export function copyrightLine(info: SongInfo, licence: string): string {
  const parts = [`“${info.title}”`];
  if (info.authors) parts.push(`Words and music by ${info.authors}`);
  if (info.year || info.publisher) parts.push(`© ${[info.year || '', info.publisher].filter(Boolean).join(' ')}`);
  if (info.songNumber) parts.push(`CCLI Song # ${info.songNumber}`);
  if (licence.trim()) parts.push(`CCLI Licence # ${licence.trim()}`);
  return parts.join(' · ');
}

/** Whether the slide at `index` of `count` carries the copyright line. */
export function showsCopyright(position: CopyrightPosition, index: number, count: number): boolean {
  if (position === 'off' || count <= 0) return false;
  if (position === 'all') return true;
  const first = index === 0;
  const last = index === count - 1;
  return position === 'both' ? first || last : position === 'first' ? first : last;
}

// ---- Usage log and report ------------------------------------------------------

/** One song shown on one day (with the audience output on). */
export interface UsageEntry {
  /** Local date, YYYY-MM-DD. */
  date: string;
  title: string;
  songNumber: number;
  authors: string;
  publisher: string;
  path?: string;
}

export const localDate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The same song counts once a day, however many times it's shown. */
export const usageKey = (e: Pick<UsageEntry, 'date' | 'title' | 'songNumber'>): string => `${e.date}|${e.songNumber || e.title.trim().toLowerCase()}`;

export interface ReportRow {
  title: string;
  songNumber: number;
  authors: string;
  publisher: string;
  /** Days it was used in the range. */
  uses: number;
  lastUsed: string;
}

/** Songs used between two dates (inclusive), most used first; songs without a CCLI number are listed apart. */
export function usageReport(log: UsageEntry[], from: string, to: string): { songs: ReportRow[]; missingNumbers: ReportRow[] } {
  const rows = new Map<string, ReportRow>();
  const seen = new Set<string>();
  for (const e of log) {
    if (e.date < from || e.date > to || seen.has(usageKey(e))) continue;
    seen.add(usageKey(e));
    const key = e.songNumber ? `#${e.songNumber}` : e.title.trim().toLowerCase();
    const row = rows.get(key) ?? { title: e.title, songNumber: e.songNumber, authors: e.authors, publisher: e.publisher, uses: 0, lastUsed: e.date };
    row.uses++;
    if (e.date >= row.lastUsed) {
      row.lastUsed = e.date;
      // The latest details win (a number filled in later, a corrected title).
      Object.assign(row, { title: e.title, authors: e.authors || row.authors, publisher: e.publisher || row.publisher });
    }
    rows.set(key, row);
  }
  const all = [...rows.values()].sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title));
  return { songs: all.filter((r) => r.songNumber), missingNumbers: all.filter((r) => !r.songNumber) };
}

const csvCell = (v: string | number): string => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The report as CSV, for a spreadsheet or for typing into CCLI's reporting. */
export function reportCsv(rows: ReportRow[], from: string, to: string, licence: string): string {
  const head = [`CCLI usage report ${from} to ${to}${licence ? `, licence ${licence}` : ''}`];
  const lines = [['CCLI Song #', 'Title', 'Authors', 'Publisher', 'Times used', 'Last used'], ...rows.map((r) => [r.songNumber || '', r.title, r.authors, r.publisher, r.uses, r.lastUsed])];
  return [...head, ...lines.map((l) => l.map(csvCell).join(','))].join('\n') + '\n';
}

/** Tab-separated, which pastes into a spreadsheet as columns. */
export function reportTsv(rows: ReportRow[]): string {
  return [['CCLI Song #', 'Title', 'Authors', 'Times used'], ...rows.map((r) => [String(r.songNumber || ''), r.title, r.authors, String(r.uses)])].map((l) => l.join('\t')).join('\n');
}
