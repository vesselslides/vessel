// Bible references as people type them: "John 3:16", "jn 3 16-18", "1 Cor 13:4-7",
// "Psalm 23", "Rom 8:28, 31-39", "Gen 1:1-2:3", "Isa 40:28-31; 41:10".
import { CANON, normalizeBookName } from './books';
import type { Bible } from './formats';

export interface VerseRef {
  /** Index into bible.books. */
  book: number;
  chapter: number;
  verse: number;
}

export interface Verse extends VerseRef {
  text: string;
}

export interface Passage {
  /** "John 3:16–18" */
  label: string;
  verses: Verse[];
}

/** Which of the Bible's books a typed name means, or -1. */
export function findBook(bible: Bible, typed: string): number {
  const q = normalizeBookName(typed);
  if (!q) return -1;
  const names = bible.books.map((b) => {
    const canon = CANON[b.number - 1];
    return { own: normalizeBookName(b.name), english: canon ? normalizeBookName(canon.name) : '', abbreviations: canon?.abbreviations ?? [] };
  });
  // Exact names and known abbreviations first, then the first book whose name starts with what was typed.
  const exact = names.findIndex((n) => n.own === q || n.english === q || n.abbreviations.includes(q));
  if (exact >= 0) return exact;
  const prefix = names.findIndex((n) => n.own.startsWith(q) || n.english.startsWith(q));
  if (prefix >= 0 || q.length < 3) return prefix;
  // "Revelations", "Psalm": a little past the end of a name still counts.
  return names.findIndex((n) => (n.own.length >= 3 && q.startsWith(n.own)) || (n.english.length >= 3 && q.startsWith(n.english)));
}

const chapterCount = (bible: Bible, book: number): number => bible.books[book].chapters.length;
const verseCountIn = (bible: Bible, book: number, chapter: number): number => bible.books[book].chapters[chapter - 1]?.length ?? 0;

interface Span {
  from: VerseRef;
  to: VerseRef;
  /** Typed as whole chapters ("Psalm 23"), so labelled that way. */
  whole?: boolean;
}

/**
 * Read one reference (or several separated by ";"). Book names may be left out
 * after the first ("Isa 40:31; 41:10"). Returns null when the text isn't a
 * reference, or a message when it is one this Bible doesn't have.
 */
export function parseReference(bible: Bible, input: string): { spans: Span[] } | { error: string } | null {
  const spans: Span[] = [];
  let book = -1;
  let lastChapter = 0;
  for (const part of input.split(';').map((p) => p.trim()).filter(Boolean)) {
    // Book name (may start with a number), then the numbers.
    const m = /^((?:[1-3]|i{1,3}|1st|2nd|3rd|first|second|third)?\s*\.?\s*[\p{L}][\p{L}\s.']*?)?\s*(\d.*)?$/iu.exec(part);
    if (!m) return null;
    const [, name, numbers] = m;
    if (name?.trim()) {
      const found = findBook(bible, name);
      if (found < 0) return spans.length || /\d/.test(part) ? { error: `No book called “${name.trim()}” in ${bible.abbreviation}.` } : null;
      book = found;
      lastChapter = 0;
    }
    if (book < 0) return null;
    if (!numbers) {
      // A whole book is too much to show; take its first chapter.
      spans.push({ from: { book, chapter: 1, verse: 1 }, to: { book, chapter: 1, verse: verseCountIn(bible, book, 1) }, whole: true });
      continue;
    }
    // "3:16-18, 20", "3 16", "3.16", "23", "3-4", "1:1-2:3"
    const cleaned = numbers.replace(/[–—]/g, '-').replace(/\s*([:.,-])\s*/g, '$1').trim();
    const single = chapterCount(bible, book) === 1;
    let chapter = lastChapter;
    // After "3:16", a bare number in the list is another verse ("3:16, 18"); after "5" it's another chapter.
    let verseList = false;
    for (const piece of cleaned.split(',')) {
      const r = /^(\d+)(?:[:. ](\d+))?(?:-(\d+)(?:[:.](\d+))?)?$/.exec(piece.trim());
      if (!r) return { error: `“${part}” isn’t a reference Vessel understands. Try John 3:16-18.` };
      const [, a, b, c, d] = r.map((x) => (x === undefined ? undefined : Number(x))) as [unknown, number, number?, number?, number?];
      let from: VerseRef;
      let to: VerseRef;
      let whole = false;
      if (b !== undefined) {
        // chapter:verse[-verse | -chapter:verse]
        chapter = a;
        from = { book, chapter, verse: b };
        to = d !== undefined ? { book, chapter: c!, verse: d } : { book, chapter, verse: c ?? b };
        if (d !== undefined) chapter = c!;
        verseList = true;
      } else if (verseList) {
        from = { book, chapter, verse: a };
        to = { book, chapter, verse: c ?? a };
      } else if (single) {
        // One-chapter books (Jude, Philemon): "Jude 3" is verse 3.
        chapter = 1;
        verseList = true;
        from = { book, chapter: 1, verse: a };
        to = { book, chapter: 1, verse: c ?? a };
      } else {
        // Whole chapters: "Psalm 23", "Matthew 5-7".
        from = { book, chapter: a, verse: 1 };
        const last = c ?? a;
        to = { book, chapter: last, verse: verseCountIn(bible, book, last) };
        chapter = last;
        whole = true;
      }
      if (from.chapter < 1 || from.chapter > chapterCount(bible, book)) return { error: `${bible.books[book].name} has ${chapterCount(bible, book)} chapters.` };
      if (to.chapter > chapterCount(bible, book)) to = { book, chapter: chapterCount(bible, book), verse: verseCountIn(bible, book, chapterCount(bible, book)) };
      if (to.verse > verseCountIn(bible, book, to.chapter)) to = { ...to, verse: verseCountIn(bible, book, to.chapter) };
      if (from.verse > verseCountIn(bible, book, from.chapter)) return { error: `${bible.books[book].name} ${from.chapter} has ${verseCountIn(bible, book, from.chapter)} verses.` };
      if (to.chapter < from.chapter || (to.chapter === from.chapter && to.verse < from.verse)) to = { ...from };
      spans.push({ from, to, whole });
      lastChapter = chapter;
    }
  }
  return spans.length ? { spans } : null;
}

/** The verses a span covers, in order (verses missing from the translation are left out). */
function versesOf(bible: Bible, span: Span): Verse[] {
  const out: Verse[] = [];
  const { book } = span.from;
  for (let c = span.from.chapter; c <= span.to.chapter; c++) {
    const verses = bible.books[book].chapters[c - 1] ?? [];
    const first = c === span.from.chapter ? span.from.verse : 1;
    const last = c === span.to.chapter ? span.to.verse : verses.length;
    for (let v = first; v <= last; v++) if (verses[v - 1]) out.push({ book, chapter: c, verse: v, text: verses[v - 1] });
  }
  return out;
}

/** "Psalms" reads as "Psalm 23" for one psalm. */
function bookLabel(bible: Bible, book: number, oneChapter: boolean): string {
  const b = bible.books[book];
  return oneChapter && b.number === 19 && /^psalms$/i.test(b.name) ? 'Psalm' : b.name;
}

/** A label for verses, in the usual style: "John 3:16–18, 20", "Genesis 1:1–2:3", "Psalm 23". */
export function labelFor(bible: Bible, spans: Span[]): string {
  const parts: string[] = [];
  let lastBook = -1;
  let lastChapter = 0;
  for (const { from, to, whole } of spans) {
    const wholeChapters = !!whole;
    const sameChapter = from.chapter === to.chapter;
    const single = chapterCount(bible, from.book) === 1;
    let text: string;
    if (wholeChapters && !single) text = sameChapter ? `${from.chapter}` : `${from.chapter}–${to.chapter}`;
    else if (sameChapter) text = `${single ? '' : `${from.chapter}:`}${from.verse}${to.verse !== from.verse ? `–${to.verse}` : ''}`;
    else text = `${from.chapter}:${from.verse}–${to.chapter}:${to.verse}`;
    if (from.book !== lastBook) {
      parts.push(`${parts.length ? '; ' : ''}${bookLabel(bible, from.book, sameChapter)} ${text}`);
    } else if (sameChapter && from.chapter === lastChapter && !wholeChapters) {
      // Same chapter: "John 3:16, 18".
      parts.push(`, ${text.replace(/^\d+:/, '')}`);
    } else parts.push(`; ${text}`);
    lastBook = from.book;
    lastChapter = to.chapter;
  }
  return parts.join('');
}

/** Look up a typed reference. Null when the text isn't a reference at all. */
export function lookUp(bible: Bible, input: string): Passage | { error: string } | null {
  const parsed = parseReference(bible, input);
  if (!parsed || 'error' in parsed) return parsed;
  const verses = parsed.spans.flatMap((s) => versesOf(bible, s));
  if (!verses.length) return { error: 'Those verses aren’t in this translation.' };
  return { label: labelFor(bible, parsed.spans), verses };
}

export interface SearchHit extends Verse {
  label: string;
}

/** Verses containing every word typed (in any order), up to `limit`. */
export function searchBible(bible: Bible, query: string, limit = 100): { hits: SearchHit[]; more: boolean } {
  const words = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length > 1);
  const hits: SearchHit[] = [];
  if (!words.length) return { hits, more: false };
  const phrase = query.trim().toLowerCase();
  const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const exact: SearchHit[] = [];
  let more = false;
  bible.books.forEach((b, book) =>
    b.chapters.forEach((verses, ci) =>
      verses.forEach((text, vi) => {
        if (!text) return;
        const t = fold(text);
        if (!words.every((w) => t.includes(w))) return;
        const hit = { book, chapter: ci + 1, verse: vi + 1, text, label: `${b.name} ${chapterCount(bible, book) === 1 ? '' : `${ci + 1}:`}${vi + 1}` };
        // Verses with the words as typed, together, come first.
        (t.includes(fold(phrase)) ? exact : hits).push(hit);
      })
    )
  );
  const all = [...exact, ...hits];
  more = all.length > limit;
  return { hits: all.slice(0, limit), more };
}
