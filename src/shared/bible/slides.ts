// A passage as slides: the verses in the theme's style, and the reference
// ("John 3:16–18 KJV") in a smaller line under them.
import { Graphics_Text_VerticalAlignment } from '../gen/graphics_pb';
import { create } from '@bufbuild/protobuf';
import { Presentation_BibleReferenceSchema, type Presentation } from '../gen/presentation_pb';
import { applyTheme, resizePresentation } from '../pro/edit';
import { createPresentation, SLIDE_HEIGHT, SLIDE_WIDTH, slideOfCue, textElement } from '../pro/presentation';
import { plainTextToRtf } from '../pro/rtf';
import { themeRtfStyle, type Theme } from '../theme';
import type { Passage, Verse } from './reference';

export interface ScriptureOptions {
  /** Verses on each slide; 0 fills each slide up to about 300 characters. */
  versesPerSlide: number;
  verseNumbers: boolean;
  reference: 'every' | 'last' | 'none';
}

export const DEFAULT_SCRIPTURE_OPTIONS: ScriptureOptions = { versesPerSlide: 1, verseNumbers: true, reference: 'every' };

const FILL_CHARACTERS = 300;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (n: number): string => String(n).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);

/** Verses grouped onto slides. A verse is never split; a long one gets a slide of its own. */
export function slideVerses(verses: Verse[], versesPerSlide: number): Verse[][] {
  const slides: Verse[][] = [];
  let current: Verse[] = [];
  let length = 0;
  for (const v of verses) {
    const full = versesPerSlide > 0 ? current.length >= versesPerSlide : current.length > 0 && length + v.text.length > FILL_CHARACTERS;
    // A new chapter starts a new slide, so verse numbers never run on from the last chapter.
    if (current.length && (full || v.chapter !== current[0].chapter)) {
      slides.push(current);
      current = [];
      length = 0;
    }
    current.push(v);
    length += v.text.length;
  }
  if (current.length) slides.push(current);
  return slides;
}

export function verseText(verses: Verse[], numbers: boolean): string {
  return verses.map((v) => (numbers ? `${superscript(v.verse)}${v.text}` : v.text)).join(' ');
}

/** The reference for one slide: the passage's label, or just that slide's verses for a long passage. */
function slideLabel(passage: Passage, verses: Verse[], bookName: string, oneChapterBook: boolean): string {
  if (verses.length === passage.verses.length) return passage.label;
  const first = verses[0];
  const last = verses[verses.length - 1];
  const ch = oneChapterBook ? '' : `${first.chapter}:`;
  return `${bookName} ${ch}${first.verse}${last.verse !== first.verse ? `–${last.verse}` : ''}`;
}

export function passageToPresentation(
  passage: Passage,
  translation: { abbreviation: string; bookNames: (book: number) => string; oneChapter: (book: number) => boolean; credit?: string },
  theme: Theme,
  opts: ScriptureOptions,
  /** Slide size for the new presentation (Preferences ▸ Screens); 1920×1080 when not given. */
  size?: { width: number; height: number }
): Presentation {
  const slides = slideVerses(passage.verses, opts.versesPerSlide);
  const title = `${passage.label} (${translation.abbreviation})`;
  let presentation = createPresentation(title, [{ group: passage.label, slides: slides.map((s) => verseText(s, opts.verseNumbers)) }]);
  if (size) presentation = resizePresentation(presentation, size.width, size.height);
  presentation = applyTheme(presentation, theme);
  // Marked as scripture the way ProPresenter marks it (so it isn't reported to CCLI as a song).
  const first = passage.verses[0];
  presentation.bibleReference = create(Presentation_BibleReferenceSchema, {
    bookIndex: first ? first.book : 0,
    bookName: first ? translation.bookNames(first.book) : '',
    translationName: translation.abbreviation,
    translationInternalAbbreviation: translation.abbreviation
  });
  // An openly licensed translation's credit travels with the passage.
  if (translation.credit) presentation.notes = translation.credit;
  if (opts.reference === 'none') return presentation;

  // The reference sits along the bottom of the theme's text area, in its font at about half size.
  const box = theme.box;
  const lineHeight = 0.08;
  presentation.cues.forEach((cue, i) => {
    if (opts.reference === 'last' && i !== presentation.cues.length - 1) return;
    const slide = slideOfCue(cue);
    if (!slide) return;
    const width = slide.size?.width || SLIDE_WIDTH;
    const height = slide.size?.height || SLIDE_HEIGHT;
    const verses = slides[i];
    const label = slides.length > 1 && verses ? slideLabel(passage, verses, translation.bookNames(verses[0].book), translation.oneChapter(verses[0].book)) : passage.label;
    const verseBox = slide.elements[0]?.element;
    if (verseBox?.bounds?.size) verseBox.bounds.size.height = Math.max(0.2, box.height - lineHeight) * height;
    const style = themeRtfStyle(theme, height);
    const element = textElement(
      plainTextToRtf(`${label} ${translation.abbreviation}`, { ...style, sizePt: Math.round(style.sizePt * 0.5 * 10) / 10, align: theme.align === 'center' ? 'center' : 'right', bold: false }),
      { x: box.x * width, y: (box.y + box.height - lineHeight) * height, width: box.width * width, height: lineHeight * height },
      'Reference'
    );
    if (element.element?.text) element.element.text.verticalAlignment = Graphics_Text_VerticalAlignment.BOTTOM;
    slide.elements.push(element);
  });
  return presentation;
}
