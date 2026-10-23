// File ▸ Export: a presentation or a whole service as a PDF of the slides, a
// lyrics sheet, pictures of the slides, or plain text. The operator window
// gathers the songs (as the screen would show them); the main process saves
// text directly and draws the rest in a hidden print page.
import type { Background, Deck, SlideView } from './types';

export type ExportFormat = 'pdf-slides' | 'pdf-lyrics' | 'images' | 'text';

export interface LyricSection {
  name: string;
  color?: string;
  /** Each slide's words, in order. */
  slides: string[];
}

export interface ExportSong {
  kind: 'song';
  name: string;
  /** The CCLI line ("“Title” Words and music by … CCLI Licence #…"), or empty. */
  copyright: string;
  /** Every slide in play order, each with the background the screen would show behind it. */
  slides: SlideView[];
  /** Each group once, in the order they first come up. */
  sections: LyricSection[];
  /** Group names in play order ("Verse 1, Chorus, Verse 2, Chorus"). */
  order: string[];
}

export interface ExportHeader {
  kind: 'header';
  name: string;
}

export type ExportEntry = ExportSong | ExportHeader;

export interface ExportOptions {
  /** Slides PDF: slides on each page. */
  perPage: 1 | 2 | 4 | 6;
  /** Slides PDF and pictures: the slide's group and number under it. */
  captions: boolean;
  /** Slides PDF and pictures: show backgrounds (otherwise slides are black behind the words). */
  backgrounds: boolean;
  paper: 'a4' | 'letter';
  /** Lyrics sheet: columns per page, and whether each song starts a new page. */
  columns: 1 | 2;
  songPerPage: boolean;
  /** Lyrics sheet and text: the CCLI line under each song. */
  copyright: boolean;
  /** Lyrics sheet and text: the order of the groups ("Verse 1, Chorus…"). */
  order: boolean;
  imageFormat: 'png' | 'jpeg';
  /** Pictures: width in pixels; the height follows the slide's shape. */
  imageWidth: number;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  perPage: 4,
  captions: true,
  backgrounds: true,
  paper: 'a4',
  columns: 1,
  songPerPage: false,
  copyright: true,
  order: true,
  imageFormat: 'png',
  imageWidth: 1920
};

export interface ExportJob {
  format: ExportFormat;
  /** The presentation's or service's name: the file (or folder) name and the PDF's heading. */
  title: string;
  entries: ExportEntry[];
  options: ExportOptions;
  /** Slide size in pixels. */
  width: number;
  height: number;
}

/** What an export saved; null from the main process means it was cancelled. */
export interface ExportResult {
  path: string;
  files: number;
}

/**
 * The background behind each slide, as the screen would show it: a slide's own
 * background stays up for the slides after it until another one replaces it.
 */
export function withCarriedBackgrounds(slides: SlideView[]): SlideView[] {
  let current: Background | undefined;
  return slides.map((s) => {
    if (s.background) current = s.background;
    return current && !s.background ? { ...s, background: current } : s;
  });
}

/** A song ready to export: its slides in play order and its words by group. */
export function exportSong(deck: Deck, copyright: string): ExportSong {
  const slides = deck.slides.filter((s) => s.enabled || deck.slides.every((x) => !x.enabled));
  const sections: LyricSection[] = [];
  const seen = new Map<string, LyricSection>();
  const order: string[] = [];
  let last: string | null = null;
  for (const s of slides) {
    const name = s.groupName || s.label || 'Slide';
    if (s.groupId !== last) order.push(name);
    last = s.groupId;
    if (seen.has(s.groupId)) continue;
    // Each group's words once, in that group's own slide order.
    const group = deck.groups.find((g) => g.id === s.groupId);
    const section: LyricSection = { name, color: s.groupColor, slides: (group?.slides ?? [s]).map((x) => x.text.trim()).filter(Boolean) };
    seen.set(s.groupId, section);
    sections.push(section);
  }
  return { kind: 'song', name: deck.name || 'Untitled', copyright, slides: withCarriedBackgrounds(slides), sections, order };
}

/** Group names in order, with repeats in a row counted ("Chorus ×2"). */
export function orderLine(order: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < order.length; ) {
    let n = 1;
    while (order[i + n] === order[i]) n++;
    out.push(n > 1 ? `${order[i]} ×${n}` : order[i]);
    i += n;
  }
  return out.join(', ');
}

/** Whether the order says anything the sections don't (a repeat, or a different order). */
export const orderIsWorthShowing = (song: ExportSong): boolean => song.order.length !== song.sections.length;

/** The words of a presentation or service as plain text. */
export function exportText(job: Pick<ExportJob, 'title' | 'entries' | 'options'>): string {
  const songs = job.entries.filter((e) => e.kind === 'song').length;
  const blocks: string[] = [];
  if (songs > 1 || job.entries.some((e) => e.kind === 'header')) blocks.push(`${job.title}\n${'='.repeat(Math.min(60, job.title.length))}`);
  for (const e of job.entries) {
    if (e.kind === 'header') {
      blocks.push(`--- ${e.name} ---`);
      continue;
    }
    const lines = [e.name, '-'.repeat(Math.min(60, e.name.length))];
    if (job.options.order && orderIsWorthShowing(e)) lines.push(`Order: ${orderLine(e.order)}`);
    for (const s of e.sections) lines.push('', `[${s.name}]`, ...s.slides.flatMap((t, i) => (i ? ['', t] : [t])));
    if (job.options.copyright && e.copyright) lines.push('', e.copyright);
    blocks.push(lines.join('\n'));
  }
  return `${blocks.join('\n\n\n')}\n`;
}

/** Picture file names: "03 Amazing Grace/02 Verse 1.png" for a service, "02 Verse 1.png" for one song. */
export function imageNames(job: Pick<ExportJob, 'entries' | 'options'>): string[][] {
  const songs = job.entries.filter((e): e is ExportSong => e.kind === 'song');
  const pad = (n: number, of: number): string => String(n).padStart(String(of).length < 2 ? 2 : String(of).length, '0');
  const clean = (s: string): string => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Slide';
  const ext = job.options.imageFormat === 'jpeg' ? 'jpg' : 'png';
  return songs.map((song, si) =>
    song.slides.map((s, i) => {
      const file = `${pad(i + 1, song.slides.length)} ${clean(s.groupName || s.label || 'Slide')}.${ext}`;
      return songs.length > 1 ? `${pad(si + 1, songs.length)} ${clean(song.name)}/${file}` : file;
    })
  );
}

export const FORMAT_EXTENSION: Record<ExportFormat, string | null> = { 'pdf-slides': 'pdf', 'pdf-lyrics': 'pdf', images: null, text: 'txt' };
