// What the importer reads, and the choices offered before importing.
import type { LyricsOptions } from './lyrics';

/** PowerPoint, Keynote and Google Slides: a slideshow shown as made (clicks too), slides to edit in Vessel, or only the words. */
export type SlidesImport = 'slideshow' | 'slides' | 'lyrics';

export interface ImportOptions extends LyricsOptions {
  pptxAs: SlidesImport;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { pptxAs: 'slideshow', linesPerSlide: 0, removeChords: true, keepChords: true };

/** Stored import choices, with anything missing filled in. Before slideshows, "pptxLook" was 'slides' or 'lyrics'. */
export function importOptionsFrom(stored: unknown): ImportOptions {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const { pptxLook, ...rest } = raw;
  const opts = { ...DEFAULT_IMPORT_OPTIONS, ...rest } as ImportOptions;
  if (!['slideshow', 'slides', 'lyrics'].includes(rest.pptxAs as string)) opts.pptxAs = pptxLook === 'lyrics' ? 'lyrics' : 'slideshow';
  return opts;
}

export const SLIDES_IMPORTS: Array<{ id: SlidesImport; label: string; hint: string }> = [
  { id: 'slideshow', label: 'Slideshow, as it was made', hint: 'Every slide as it looks, with its click animations and speaker notes. Fix it in PowerPoint or Keynote and import it again.' },
  { id: 'slides', label: 'Vessel slides, to edit here', hint: 'Each slide’s look, without animations, to change in Edit.' },
  { id: 'lyrics', label: 'Only the words, as a song', hint: 'The words only, shown with a theme like any other song.' }
];

/** What happens to chords in imported or pasted lyrics: kept for the band (off the words), left out, or shown as words. */
export type ChordChoice = 'keep' | 'remove' | 'show';

export const CHORD_CHOICES: Array<{ id: ChordChoice; label: string }> = [
  { id: 'keep', label: 'Keep them for the band (stage screen and chord charts)' },
  { id: 'remove', label: 'Leave them out' },
  { id: 'show', label: 'Show them as words on the slides' }
];

export const chordChoice = (o: Pick<LyricsOptions, 'removeChords' | 'keepChords'>): ChordChoice => (o.keepChords !== false ? 'keep' : o.removeChords ? 'remove' : 'show');

export const withChordChoice = <T extends LyricsOptions>(o: T, choice: ChordChoice): T => ({ ...o, keepChords: choice === 'keep', removeChords: choice !== 'show' });

export interface DocumentImportReport {
  source: 'PowerPoint' | 'Keynote' | 'Word' | 'OpenDocument' | 'RTF' | 'text';
  /** 'lyrics': plain words, shown with the default theme. */
  look: 'slideshow' | 'slides' | 'lyrics';
  slides: number;
  groups: number;
  /** Sections sung again, gathered into a "Song order" arrangement. */
  repeats: number;
  pictures: number;
  hiddenSlides: number;
  /** Slides that came with speaker notes (PowerPoint, kept as the presenter's notes). */
  speakerNotes: number;
  removedChordLines: number;
  /** Chords kept on the words for the band, and the key they look to be in. */
  chords: number;
  key?: string;
  ccli: boolean;
  skipped: Record<string, number>;
  /** Slideshows: clicks across all slides, and effects shown in place without their motion. */
  clicks?: number;
  stillEffects?: number;
}

const SOURCES: Record<string, DocumentImportReport['source']> = {
  pptx: 'PowerPoint',
  ppsx: 'PowerPoint',
  // Converted to .pptx first, by Keynote, PowerPoint or LibreOffice on this computer.
  ppt: 'PowerPoint',
  pps: 'PowerPoint',
  key: 'Keynote',
  odp: 'PowerPoint',
  docx: 'Word',
  odt: 'OpenDocument',
  rtf: 'RTF',
  txt: 'text',
  text: 'text',
  md: 'text',
  cho: 'text',
  chopro: 'text',
  chordpro: 'text',
  crd: 'text'
};

export const DOCUMENT_EXTENSIONS = Object.keys(SOURCES);

/** Formats people will try, with what to do instead. */
export const UNSUPPORTED_DOCUMENTS: Record<string, string> = {
  doc: 'This is an older Word file. Open it in Word and choose File ▸ Save As ▸ Word Document (.docx), then import that.',
  pages: 'Pages files can’t be read directly. In Pages choose File ▸ Export To ▸ Word, then import the .docx.',
};

/** Presentations Vessel reads by having another app on the computer save them as .pptx. */
export const CONVERTED_SLIDES = ['ppt', 'pps', 'key', 'odp'];

/** The kinds of document the Import window offers, with the files each picker shows (and older ones it explains). */
export type DocumentKind = 'powerpoint' | 'word' | 'text';

export const DOCUMENT_KINDS: Record<DocumentKind, { title: string; filter: string; extensions: string[] }> = {
  powerpoint: { title: 'Import PowerPoint, Keynote or Google Slides', filter: 'Presentations (.pptx, .ppt, .key)', extensions: ['pptx', 'ppsx', 'ppt', 'pps', 'key', 'odp'] },
  word: { title: 'Import a Word document', filter: 'Word and OpenDocument (.docx, .odt, .rtf)', extensions: ['docx', 'odt', 'rtf', 'doc', 'pages'] },
  text: { title: 'Import text or chord sheets', filter: 'Text and ChordPro (.txt, .cho)', extensions: ['txt', 'text', 'md', 'cho', 'chopro', 'chordpro', 'crd'] }
};

export const extensionOf = (path: string): string => path.split('.').pop()?.toLowerCase() ?? '';
export const sourceOf = (path: string): DocumentImportReport['source'] | undefined => SOURCES[extensionOf(path)];
export const isDocumentPath = (path: string): boolean => sourceOf(path) !== undefined || extensionOf(path) in UNSUPPORTED_DOCUMENTS;
