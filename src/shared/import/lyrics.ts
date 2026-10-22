// Lyrics from a text file, a Word document or the text of PowerPoint slides,
// turned into a song: section labels ("Verse 1", "[Chorus]") become groups,
// repeated sections become an arrangement, and chord lines and CCLI/copyright
// lines are taken out of the slides.
import { create } from '@bufbuild/protobuf';
import { Presentation_CCLISchema, type Presentation } from '../gen/presentation_pb';
import { addArrangement, selectArrangement } from '../pro/edit';
import { createPresentation, uuidOf } from '../pro/presentation';

export interface LyricsOptions {
  /** Split each verse into slides of this many lines; 0 keeps verses whole. */
  linesPerSlide: number;
  /** Leave out lines that are only chords ("G  D/F#  Em  C") and [G] chords inside lines. */
  removeChords: boolean;
}

export const DEFAULT_LYRICS_OPTIONS: LyricsOptions = { linesPerSlide: 0, removeChords: true };

export interface Label {
  name: string;
  /** "Chorus x2" → 2. */
  times: number;
  /** "Repeat chorus", "Chorus x2": points back at an earlier section. */
  repeat: boolean;
}

/** A block of lines, optionally under a section label. */
export interface Stanza {
  label?: Label;
  lines: string[];
}

export interface LyricsReport {
  slides: number;
  groups: number;
  /** Sections that come round again (they share one group in a "Song order" arrangement). */
  repeats: number;
  removedChordLines: number;
  /** A CCLI number or copyright line was found and moved into the song's details. */
  ccli: boolean;
}

const SECTION =
  /^(verse|chorus|pre[- ]?chorus|bridge|tag|intro|outro|ending|interlude|refrain|hook|coda|vamp|turnaround|instrumental|channel|post[- ]?chorus)\s*(\d+[a-z]?)?$/i;

const tidyName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/^(pre|post)[- ]?chorus/, (_m, p: string) => `${p}-chorus`)
    .replace(/^([a-z-]+)(\d)/, '$1 $2')
    .replace(/(^|[\s-])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());

/** A line that names a section ("Verse 1:", "[Chorus]", "Repeat chorus", "Bridge x2"), or null. */
export function parseLabel(line: string): Label | null {
  let t = line.trim().replace(/\s*[:：]$/, '');
  if (!t || t.length > 40) return null;
  const bracketed = /^\[(.+)\]$/.exec(t) ?? /^\((.+)\)$/.exec(t);
  if (bracketed) t = bracketed[1].trim();
  let times = 1;
  let repeat = false;
  t = t
    .replace(/\s*\(?\s*(?:[x×]\s*(\d)|(\d)\s*[x×])\s*\)?$/i, (_m, a?: string, b?: string) => {
      times = Number(a ?? b);
      repeat = true;
      return '';
    })
    .replace(/^repeat\s+(?:the\s+)?/i, () => {
      repeat = true;
      return '';
    })
    .replace(/\s*\(?\s*repeat\s*\)?$/i, () => {
      repeat = true;
      return '';
    })
    .replace(/\s*[:.]$/, '')
    .trim();
  if (SECTION.test(t)) return { name: tidyName(t), times, repeat };
  // Anything in square brackets is a label, as in New Song.
  if (/^\[.+\]$/.test(line.trim().replace(/\s*[:：]$/, '')) && t) return { name: t, times, repeat };
  return null;
}

const CHORD = /^\(?[A-G](?:#|b|♯|♭)?(?:maj|min|m|M|sus|dim|aug|add|°|ø|\+)?\d*(?:(?:sus|add|maj|b|#)\d+)*(?:\/[A-G](?:#|b|♯|♭)?)?\)?$/;

/** A line made only of chords (and bar lines), as in a chord chart. */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.some((t) => CHORD.test(t)) && tokens.every((t) => CHORD.test(t) || /^[|/\-–.]+$/.test(t) || /^[x×]\d$/i.test(t));
}

/** "[G]Amazing [D/F#]grace" → "Amazing grace". */
const stripInlineChords = (line: string): string => line.replace(/\[[A-G][^\]\s]{0,8}\]/g, '').replace(/\s{2,}/g, ' ');

const CCLI_NUMBER = /ccli\s*(?:song\s*)?(?:#|no\.?|number)?\s*:?\s*(\d{3,})/i;
const COPYRIGHT = /^\s*(?:©|\(c\)|copyright\b)\s*(.*)$/i;
const AUTHOR = /^\s*(?:words\s*(?:and|&)\s*music|written|lyrics|music|words)\s+by\s*:?\s*(.+)$/i;
const isCcliLine = (line: string): boolean => /^\s*ccli\b/i.test(line) || CCLI_NUMBER.test(line) || COPYRIGHT.test(line) || AUTHOR.test(line);

interface Extracted {
  title?: string;
  stanzas: Stanza[];
  ccli: { songNumber?: number; copyrightYear?: number; publisher?: string; author?: string };
  removedChordLines: number;
}

/** ChordPro directives on their own line: {title: …}, {c: Chorus}, {soc}. */
function chordProDirective(line: string): { title?: string; label?: Label; drop: boolean } | null {
  const m = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line);
  if (!m) return null;
  const [, key, value = ''] = m;
  const k = key.toLowerCase();
  if (k === 'title' || k === 't') return { title: value, drop: true };
  if (k === 'comment' || k === 'c' || k === 'ci' || k === 'comment_italic') return { label: parseLabel(value) ?? (value ? { name: value, times: 1, repeat: false } : undefined), drop: true };
  if (k === 'start_of_chorus' || k === 'soc') return { label: { name: value ? tidyName(value) : 'Chorus', times: 1, repeat: false }, drop: true };
  if (k === 'start_of_verse' || k === 'sov') return { label: { name: value ? tidyName(value) : 'Verse', times: 1, repeat: false }, drop: true };
  if (k === 'start_of_bridge' || k === 'sob') return { label: { name: value ? tidyName(value) : 'Bridge', times: 1, repeat: false }, drop: true };
  return { drop: true };
}

/** Read the sections out of a block of text. Blank lines end a verse; label lines start a section. */
export function extractStanzas(text: string, opts: LyricsOptions = DEFAULT_LYRICS_OPTIONS): Extracted {
  const out: Extracted = { stanzas: [], ccli: {}, removedChordLines: 0 };
  let lines: string[] = [];
  let label: Label | undefined;
  const flush = (): void => {
    if (lines.length) out.stanzas.push({ ...(label ? { label } : {}), lines });
    else if (label) out.stanzas.push({ label, lines: [] });
    lines = [];
    label = undefined;
  };
  // A label waits for the verse that follows it, across blank lines.
  let pending: Label | undefined;
  const seen = new Set<string>();

  for (const raw of text.replace(/\r\n?/g, '\n').replace(/[\t ]/g, ' ').split('\n')) {
    let line = raw.replace(/\s+$/, '');
    const directive = chordProDirective(line);
    if (directive) {
      if (directive.title && !out.title) out.title = directive.title;
      if (directive.label) {
        flush();
        if (pending) out.stanzas.push({ label: pending, lines: [] });
        pending = directive.label;
      }
      continue;
    }
    if (!line.trim()) {
      if (lines.length) flush();
      continue;
    }
    if (isCcliLine(line)) {
      const number = CCLI_NUMBER.exec(line)?.[1];
      if (number) out.ccli.songNumber = Number(number);
      const copyright = COPYRIGHT.exec(line)?.[1];
      if (copyright) {
        const year = /\b(1[89]\d\d|20\d\d)\b/.exec(copyright)?.[1];
        if (year) out.ccli.copyrightYear = Number(year);
        const publisher = copyright.replace(/\b(1[89]\d\d|20\d\d)\b\s*/, '').replace(/^[\s,.-]+/, '').trim();
        if (publisher) out.ccli.publisher = publisher;
      }
      const author = AUTHOR.exec(line)?.[1];
      if (author) out.ccli.author = author.trim();
      continue;
    }
    const found = parseLabel(line);
    if (found) {
      flush();
      if (pending) out.stanzas.push({ label: pending, lines: [] });
      // "Chorus x2" before the chorus's first appearance labels it; afterwards it
      // stands on its own as a repeat. A section label waits for its verse.
      if (found.repeat && seen.has(found.name.toLowerCase())) out.stanzas.push({ label: found, lines: [] });
      else pending = { ...found, repeat: false };
      seen.add(found.name.toLowerCase());
      continue;
    }
    if (opts.removeChords) {
      if (isChordLine(line)) {
        out.removedChordLines++;
        continue;
      }
      line = stripInlineChords(line);
      if (!line.trim()) continue;
    }
    if (!lines.length && pending) {
      label = pending;
      pending = undefined;
    }
    lines.push(line.trim());
  }
  flush();
  if (pending) out.stanzas.push({ label: pending, lines: [] });
  return out;
}

function chunk(lines: string[], size: number): string[] {
  if (size <= 0 || lines.length <= size) return [lines.join('\n')];
  const slides: string[] = [];
  for (let i = 0; i < lines.length; i += size) slides.push(lines.slice(i, i + size).join('\n'));
  return slides;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Groups and the order they are sung in. */
export function arrangeStanzas(stanzas: Stanza[], linesPerSlide: number): { groups: Array<{ name: string; slides: string[] }>; order: number[] } {
  const groups: Array<{ name: string; slides: string[] }> = [];
  const order: number[] = [];
  // The group unlabelled verses are added to: only one just created, never a repeat.
  let open: number | null = null;
  for (const s of stanzas) {
    const slides = s.lines.length ? chunk(s.lines, linesPerSlide) : [];
    if (s.label) {
      const earlier = groups.map((g) => sameName(g.name, s.label!.name)).lastIndexOf(true);
      const identical = earlier >= 0 && slides.length > 0 && groups[earlier].slides.join('\n\n') === slides.join('\n\n');
      if (earlier >= 0 && (!slides.length || identical)) {
        for (let i = 0; i < s.label.times; i++) order.push(earlier);
        open = null;
        continue;
      }
      if (!slides.length) continue;
      groups.push({ name: s.label.name, slides });
      for (let i = 0; i < s.label.times; i++) order.push(groups.length - 1);
      open = groups.length - 1;
      continue;
    }
    if (!slides.length) continue;
    if (open !== null) groups[open].slides.push(...slides);
    else {
      groups.push({ name: '', slides });
      order.push(groups.length - 1);
      open = groups.length - 1;
    }
  }
  return { groups, order };
}

/** Build the song. A "Song order" arrangement is added when a section comes round again. */
export function stanzasToPresentation(name: string, extracted: Extracted, opts: LyricsOptions): { presentation: Presentation; report: LyricsReport } {
  const { groups, order } = arrangeStanzas(extracted.stanzas, opts.linesPerSlide);
  let presentation = createPresentation(name, groups.map((g) => ({ group: g.name, slides: g.slides })));
  const repeats = order.length - new Set(order).size;
  if (repeats > 0) {
    const ids = order.map((i) => uuidOf(presentation.cueGroups[i].group?.uuid));
    const added = addArrangement(presentation, 'Song order', ids);
    presentation = selectArrangement(added.presentation, added.arrangementId);
  }
  const c = extracted.ccli;
  const ccli = c.songNumber !== undefined || c.copyrightYear !== undefined || c.publisher !== undefined || c.author !== undefined;
  if (ccli) {
    presentation.ccli = create(Presentation_CCLISchema, {
      songTitle: name,
      songNumber: c.songNumber ?? 0,
      copyrightYear: c.copyrightYear ?? 0,
      publisher: c.publisher ?? '',
      author: c.author ?? '',
      // Shown on screen when the copyright line is switched on (it's off unless you turn it on).
      display: true
    });
  }
  return {
    presentation,
    report: {
      slides: groups.reduce((n, g) => n + g.slides.length, 0),
      groups: groups.length,
      repeats,
      removedChordLines: extracted.removedChordLines,
      ccli
    }
  };
}

const comparable = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Lyrics typed in a text file or document. `title` is a heading the document
 * marked as its title; otherwise a first line matching the file name is taken
 * as the title and left off the slides.
 */
export function lyricsToPresentation(fileName: string, text: string, opts: LyricsOptions, title?: string): { presentation: Presentation; report: LyricsReport } {
  const extracted = extractStanzas(text, opts);
  const first = extracted.stanzas[0];
  if (!title && first && !first.label && first.lines.length === 1 && extracted.stanzas.length > 1 && comparable(first.lines[0]) === comparable(fileName)) {
    title = first.lines[0];
    extracted.stanzas.shift();
  }
  return stanzasToPresentation((title ?? extracted.title ?? fileName).trim() || fileName, extracted, opts);
}

/**
 * Tidy lyrics pasted into the song text box: chord lines and [G] chords out,
 * "Verse 1:" or "CHORUS" labels as [Verse 1] and [Chorus], CCLI and copyright
 * lines out, and repeats written as a bare [Chorus] in the sung order.
 */
export function tidyLyrics(text: string): { text: string; removedChordLines: number; ccli: Extracted['ccli'] } {
  const extracted = extractStanzas(text, { linesPerSlide: 0, removeChords: true });
  const { groups, order } = arrangeStanzas(extracted.stanzas, 0);
  const written = new Set<number>();
  const blocks = order.map((i) => {
    const g = groups[i];
    const header = g.name ? `[${g.name}]` : '';
    if (written.has(i)) return header;
    written.add(i);
    return [header, g.slides.join('\n\n')].filter(Boolean).join('\n');
  });
  return { text: blocks.filter(Boolean).join('\n\n'), removedChordLines: extracted.removedChordLines, ccli: extracted.ccli };
}
