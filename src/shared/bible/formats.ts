// Bibles downloaded as XML, read into one shape. Understands the formats free
// Bible sites and other worship apps use:
//  - Zefania XML  <XMLBIBLE><BIBLEBOOK bnumber><CHAPTER cnumber><VERS vnumber>
//  - OSIS         <osis><osisText><div type="book"><chapter><verse osisID>, or verse milestones
//  - USFX         <usfx><book id="GEN"><c id="1"/><v id="1"/>…<ve/>
//  - OpenSong     <bible><b n="Genesis"><c n="1"><v n="1">
//  - "Holy Bible XML" (Beblia) <bible translation><testament><book number><chapter number><verse number>
import type { XNode } from '../pro/legacy';
import { parseXml } from '../pro/legacy';
import { CANON, canonBook } from './books';

export interface BibleBook {
  /** Canonical number (1–66), or 0 for books outside it (apocrypha). */
  number: number;
  name: string;
  /** chapters[c - 1][v - 1] is the text of verse v; '' where a verse is missing. */
  chapters: string[][];
}

export interface Bible {
  name: string;
  /** Short name shown after references, e.g. "KJV". */
  abbreviation: string;
  language: string;
  format: 'Zefania' | 'OSIS' | 'USFX' | 'OpenSong' | 'Holy Bible XML';
  books: BibleBook[];
  /** The credit an openly licensed translation asks for, shown with it. */
  credit?: string;
}

/** "JUAN" → "Juan", "1 JUAN" → "1 Juan": names written all in capitals, in normal case (others are left alone). */
export function tidyBookName(name: string, language = ''): string {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (!letters || letters !== letters.toLocaleUpperCase(language || undefined) || letters === letters.toLocaleLowerCase(language || undefined)) return name;
  return name.toLocaleLowerCase(language || undefined).replace(/(^|[\s.-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toLocaleUpperCase(language || undefined));
}

const kid = (n: XNode | undefined, tag: string): XNode | undefined => n?.children.find((c) => c.tag.toLowerCase() === tag);
const kids = (n: XNode | undefined, tag: string): XNode[] => n?.children.filter((c) => c.tag.toLowerCase() === tag) ?? [];
const attr = (n: XNode, ...names: string[]): string | undefined => {
  for (const name of names) {
    const hit = Object.keys(n.attrs).find((k) => k.toLowerCase() === name);
    if (hit && n.attrs[hit] !== '') return n.attrs[hit];
  }
  return undefined;
};
const decodeEntities = (s: string): string =>
  s.replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));
// ¶ marks paragraphs in some KJV files; it isn't part of the verse.
const tidy = (s: string): string => decodeEntities(s).replace(/¶/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

/** Line and paragraph markup: a space stands in for the break. Other markup (words, quotes, italics) joins as written. */
const BREAKS = new Set(['br', 'lb', 'l', 'lg', 'p', 'q1', 'q2', 'b']);

/** Text inside a node, leaving out footnotes, cross references and the like. */
function textIn(node: XNode, skip: Set<string>): string {
  let out = '';
  for (const c of node.children) {
    const tag = c.tag.toLowerCase();
    if (c.tag === '#text') out += c.text;
    else if (skip.has(tag)) continue;
    else if (BREAKS.has(tag)) out += ` ${textIn(c, skip)} `;
    else out += textIn(c, skip);
  }
  return out;
}

function setVerse(book: BibleBook, chapter: number, verse: number, text: string): void {
  if (!(chapter >= 1) || !(verse >= 1)) return;
  while (book.chapters.length < chapter) book.chapters.push([]);
  const ch = book.chapters[chapter - 1];
  while (ch.length < verse) ch.push('');
  const t = tidy(text);
  ch[verse - 1] = ch[verse - 1] ? `${ch[verse - 1]} ${t}` : t;
}

/** Book number from a file's own number, id or name. */
function numberFor(number: string | undefined, idOrName: string | undefined, order: number, total: number): number {
  const n = Number(number);
  if (Number.isInteger(n) && n >= 1) return n <= 66 ? n : 0;
  const byId = idOrName ? canonBook(idOrName) : undefined;
  if (byId) return byId.number;
  // A file with exactly the 66 books in order (OpenSong) can be numbered by position.
  return total === 66 ? order + 1 : 0;
}

const nameFor = (number: number, given: string | undefined): string => given?.trim() || CANON[number - 1]?.name || 'Unknown book';

// ---- Zefania ------------------------------------------------------------------

const ZEFANIA_SKIP = new Set(['note', 'xref']);

function zefania(root: XNode): Bible {
  const info = kid(root, 'information');
  const books = kids(root, 'biblebook');
  const bible: Bible = {
    name: attr(root, 'biblename') ?? (info && kid(info, 'title')?.text) ?? '',
    abbreviation: (info && (kid(info, 'identifier')?.text || kid(info, 'shortname')?.text)) ?? '',
    language: (info && kid(info, 'language')?.text) ?? '',
    format: 'Zefania',
    books: []
  };
  books.forEach((b, i) => {
    const number = numberFor(attr(b, 'bnumber'), attr(b, 'bsname', 'bname'), i, books.length);
    const book: BibleBook = { number, name: nameFor(number, attr(b, 'bname')), chapters: [] };
    for (const c of kids(b, 'chapter')) {
      const chapter = Number(attr(c, 'cnumber'));
      for (const v of kids(c, 'vers')) setVerse(book, chapter, Number(attr(v, 'vnumber')), textIn(v, ZEFANIA_SKIP));
    }
    bible.books.push(book);
  });
  return bible;
}

// ---- OpenSong and Holy Bible XML ---------------------------------------------------

function openSong(root: XNode): Bible {
  const books = kids(root, 'b');
  const bible: Bible = { name: attr(root, 'n', 'name') ?? '', abbreviation: '', language: '', format: 'OpenSong', books: [] };
  books.forEach((b, i) => {
    const number = numberFor(undefined, attr(b, 'n'), i, books.length);
    const book: BibleBook = { number, name: nameFor(number, attr(b, 'n')), chapters: [] };
    for (const c of kids(b, 'c')) for (const v of kids(c, 'v')) setVerse(book, Number(attr(c, 'n')), Number(attr(v, 'n')), textIn(v, new Set()));
    bible.books.push(book);
  });
  return bible;
}

function holyBibleXml(root: XNode): Bible {
  const books = [...kids(root, 'testament').flatMap((t) => kids(t, 'book')), ...kids(root, 'book')];
  const bible: Bible = {
    name: attr(root, 'translation', 'name') ?? '',
    abbreviation: attr(root, 'abbreviation', 'abbr', 'id') ?? '',
    language: attr(root, 'language', 'lang') ?? '',
    format: 'Holy Bible XML',
    books: []
  };
  books.forEach((b, i) => {
    const number = numberFor(attr(b, 'number'), attr(b, 'name'), i, books.length);
    const book: BibleBook = { number, name: nameFor(number, attr(b, 'name')), chapters: [] };
    for (const c of kids(b, 'chapter')) for (const v of kids(c, 'verse')) setVerse(book, Number(attr(c, 'number')), Number(attr(v, 'number')), textIn(v, new Set()));
    bible.books.push(book);
  });
  return bible;
}

// ---- OSIS and USFX: walked in document order (verses can be milestones) ----------

const OSIS_SKIP = new Set(['note', 'title', 'header', 'rdg', 'milestone', 'catchword', 'figure']);

function osis(root: XNode): Bible {
  const text = kid(root, 'osistext') ?? root;
  const work = kid(kid(text, 'header'), 'work');
  const bible: Bible = {
    name: (work && kid(work, 'title')?.text) ?? '',
    abbreviation: attr(text, 'osisidwork') ?? '',
    language: attr(text, 'xml:lang') ?? (work && kid(work, 'language')?.text) ?? '',
    format: 'OSIS',
    books: []
  };
  let book: BibleBook | undefined;
  let current: { chapter: number; verse: number } | null = null;
  let buffer = '';
  const flush = (): void => {
    if (book && current && buffer.trim()) setVerse(book, current.chapter, current.verse, buffer);
    buffer = '';
  };
  const startVerse = (id: string): void => {
    flush();
    const parts = id.split(/\s+/)[0].split('.');
    current = { chapter: Number(parts[1]), verse: Number(parts[2]) };
  };
  const walk = (node: XNode): void => {
    for (const c of node.children) {
      if (c.tag === '#text') {
        if (current) buffer += c.text;
        continue;
      }
      const tag = c.tag.toLowerCase();
      if (tag === 'div' && attr(c, 'type') === 'book') {
        flush();
        current = null;
        const id = attr(c, 'osisid') ?? '';
        const canon = canonBook(id);
        book = { number: canon?.number ?? 0, name: canon?.name ?? id, chapters: [] };
        bible.books.push(book);
        walk(c);
        flush();
        current = null;
        continue;
      }
      if (tag === 'verse') {
        const sID = attr(c, 'sid');
        const eID = attr(c, 'eid');
        const id = attr(c, 'osisid');
        if (eID) {
          flush();
          current = null;
        } else if (sID || (id && !c.children.length)) startVerse(id ?? sID!);
        else if (id) {
          startVerse(id);
          walk(c);
          flush();
          current = null;
        }
        continue;
      }
      if (OSIS_SKIP.has(tag)) continue;
      // Words inside markup (<w>, <q>, <transChange>…) belong to the verse; line breaks become spaces.
      const gap = BREAKS.has(tag) && current ? ' ' : '';
      buffer += gap;
      walk(c);
      if (current) buffer += gap;
    }
  };
  walk(text);
  flush();
  return bible;
}

const USFX_SKIP = new Set(['f', 'x', 'fe', 'h', 'toc', 's', 'id', 'ide', 'rem', 'cl', 'd', 'ms', 'mt', 'mt1', 'mt2', 'imt', 'ip', 'is', 'periph', 'languagecode', 'cp', 'ca', 'va', 'vp']);

function usfx(root: XNode): Bible {
  const bible: Bible = { name: '', abbreviation: '', language: kid(root, 'languagecode')?.text ?? '', format: 'USFX', books: [] };
  let book: BibleBook | undefined;
  let chapter = 0;
  let verse = 0;
  let buffer = '';
  const flush = (): void => {
    if (book && verse && buffer.trim()) setVerse(book, chapter, verse, buffer);
    buffer = '';
  };
  const walk = (node: XNode): void => {
    for (const c of node.children) {
      if (c.tag === '#text') {
        if (verse) buffer += c.text;
        continue;
      }
      const tag = c.tag.toLowerCase();
      if (tag === 'book') {
        flush();
        const canon = canonBook(attr(c, 'id') ?? '');
        const name = tidy(kids(c, 'h')[0]?.text ?? '') || canon?.name || attr(c, 'id') || '';
        book = { number: canon?.number ?? 0, name, chapters: [] };
        bible.books.push(book);
        chapter = 0;
        verse = 0;
        walk(c);
        flush();
        verse = 0;
      } else if (tag === 'c') {
        flush();
        chapter = Number(attr(c, 'id'));
        verse = 0;
      } else if (tag === 'v') {
        flush();
        verse = Number.parseInt(attr(c, 'id') ?? '', 10) || 0;
      } else if (tag === 've') {
        flush();
        verse = 0;
      } else if (!USFX_SKIP.has(tag)) {
        const gap = BREAKS.has(tag) && verse ? ' ' : '';
        buffer += gap;
        walk(c);
        if (verse) buffer += gap;
      }
    }
  };
  walk(root);
  flush();
  return bible;
}

// ---- Detection --------------------------------------------------------------------

/** Read a Bible from XML text. `fileName` names it when the file doesn't. */
export function parseBibleXml(xml: string, fileName: string): Bible {
  const root = parseXml(xml, { trim: false }).find((n) => !n.tag.startsWith('?') && !n.tag.startsWith('!') && n.tag !== '#text');
  if (!root) throw new Error('This file has no XML in it.');
  const tag = root.tag.toLowerCase();
  let bible: Bible;
  if (tag === 'xmlbible') bible = zefania(root);
  else if (tag === 'osis' || tag === 'osistext') bible = osis(root);
  else if (tag === 'usfx') bible = usfx(root);
  else if (tag === 'bible' && kids(root, 'b').length) bible = openSong(root);
  else if (tag === 'bible' && (kids(root, 'testament').length || kids(root, 'book').length)) bible = holyBibleXml(root);
  else throw new Error('This isn’t a Bible format Vessel knows. It reads Zefania, OSIS, USFX, OpenSong and “Holy Bible XML” files.');

  bible.books = bible.books.filter((b) => b.chapters.some((c) => c.some(Boolean)));
  if (!bible.books.length) throw new Error('No verses were found in this file.');
  const base = fileName.replace(/\.[^.]+$/, '');
  bible.name = tidy(bible.name) || base;
  // "World English Bible (WEB)": the short name in brackets is the abbreviation.
  const bracketed = /^(.+?)\s*\(([A-Z0-9]{2,8})\)$/.exec(bible.name);
  if (bracketed && !tidy(bible.abbreviation)) [bible.name, bible.abbreviation] = [bracketed[1], bracketed[2]];
  bible.abbreviation = tidy(bible.abbreviation) || abbreviate(bible.name);
  return bible;
}

/** "King James Version" → "KJV"; a short name stays as it is. */
function abbreviate(name: string): string {
  const paren = /\(([A-Z0-9]{2,8})\)/.exec(name)?.[1];
  if (paren) return paren;
  if (name.length <= 8 && !/\s/.test(name)) return name.toUpperCase();
  const initials = name
    .split(/[\s_-]+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|in)$/i.test(w))
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials.slice(0, 6) || name.slice(0, 6);
}

export const verseCount = (bible: Bible): number => bible.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.filter(Boolean).length, 0), 0);
