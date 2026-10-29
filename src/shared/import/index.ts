// What the importer reads, and the choices offered before importing.
import type { LyricsOptions } from './lyrics';

export interface ImportOptions extends LyricsOptions {
  /** PowerPoint: keep each slide's look, or take only the words and use a theme. */
  pptxLook: 'slides' | 'lyrics';
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { pptxLook: 'slides', linesPerSlide: 0, removeChords: true };

export interface DocumentImportReport {
  source: 'PowerPoint' | 'Word' | 'OpenDocument' | 'RTF' | 'text';
  /** 'lyrics': plain words, shown with the default theme. */
  look: 'slides' | 'lyrics';
  slides: number;
  groups: number;
  /** Sections sung again, gathered into a "Song order" arrangement. */
  repeats: number;
  pictures: number;
  hiddenSlides: number;
  /** Slides that came with speaker notes (PowerPoint, kept as the presenter's notes). */
  speakerNotes: number;
  removedChordLines: number;
  ccli: boolean;
  skipped: Record<string, number>;
}

const SOURCES: Record<string, DocumentImportReport['source']> = {
  pptx: 'PowerPoint',
  ppsx: 'PowerPoint',
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
  ppt: 'This is an older PowerPoint file. Open it in PowerPoint and choose File ▸ Save As ▸ PowerPoint Presentation (.pptx), then import that.',
  pps: 'This is an older PowerPoint file. Open it in PowerPoint and save it as a .pptx, then import that.',
  doc: 'This is an older Word file. Open it in Word and choose File ▸ Save As ▸ Word Document (.docx), then import that.',
  key: 'Keynote files can’t be read directly. In Keynote choose File ▸ Export To ▸ PowerPoint, then import the .pptx.',
  pages: 'Pages files can’t be read directly. In Pages choose File ▸ Export To ▸ Word, then import the .docx.',
  odp: 'OpenDocument presentations can’t be read yet. Save it as PowerPoint (.pptx) and import that.'
};

/** The kinds of document the Import window offers, with the files each picker shows (and older ones it explains). */
export type DocumentKind = 'powerpoint' | 'word' | 'text';

export const DOCUMENT_KINDS: Record<DocumentKind, { title: string; filter: string; extensions: string[] }> = {
  powerpoint: { title: 'Import PowerPoint or Slides', filter: 'PowerPoint (.pptx)', extensions: ['pptx', 'ppsx', 'ppt', 'pps', 'key', 'odp'] },
  word: { title: 'Import a Word document', filter: 'Word and OpenDocument (.docx, .odt, .rtf)', extensions: ['docx', 'odt', 'rtf', 'doc', 'pages'] },
  text: { title: 'Import text or chord sheets', filter: 'Text and ChordPro (.txt, .cho)', extensions: ['txt', 'text', 'md', 'cho', 'chopro', 'chordpro', 'crd'] }
};

export const extensionOf = (path: string): string => path.split('.').pop()?.toLowerCase() ?? '';
export const sourceOf = (path: string): DocumentImportReport['source'] | undefined => SOURCES[extensionOf(path)];
export const isDocumentPath = (path: string): boolean => sourceOf(path) !== undefined || extensionOf(path) in UNSUPPORTED_DOCUMENTS;
