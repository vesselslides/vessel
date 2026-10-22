// Import PowerPoint, Word, OpenDocument, RTF and text files as presentations.
import { app } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { docxToText, odtToText, rtfDocumentToText, textFileToText, type DocumentText } from '../shared/import/documents';
import { extensionOf, sourceOf, UNSUPPORTED_DOCUMENTS, type DocumentImportReport, type ImportOptions } from '../shared/import';
import { lyricsToPresentation } from '../shared/import/lyrics';
import { convertPptx } from '../shared/import/pptx';
import { serializePresentation } from '../shared/pro/presentation';
import type { OpenedFile } from '../shared/types';

const safe = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '_') || 'Imported';

/** A new folder under Documents/Vessel/Imported Media, so pictures from two files never mix. */
function newMediaFolder(name: string): string {
  const base = join(app.getPath('documents'), 'Vessel', 'Imported Media', safe(name));
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base} ${n}`;
  return dir;
}

const READERS: Record<string, (bytes: Uint8Array) => DocumentText> = {
  docx: docxToText,
  odt: odtToText,
  rtf: rtfDocumentToText
};

export async function importDocumentFile(path: string, opts: ImportOptions): Promise<OpenedFile> {
  const ext = extensionOf(path);
  if (UNSUPPORTED_DOCUMENTS[ext]) throw new Error(UNSUPPORTED_DOCUMENTS[ext]);
  const source = sourceOf(path);
  if (!source) throw new Error('Vessel can’t import this kind of file.');
  const name = basename(path, extname(path));
  const bytes = new Uint8Array(await readFile(path));

  if (source === 'PowerPoint') {
    let folder: string | null = null;
    const saved = new Map<string, string>();
    const { presentation, report } = convertPptx(bytes, name, {
      look: opts.pptxLook,
      lyrics: opts,
      saveMedia: (zipPath, data) => {
        const known = saved.get(zipPath);
        if (known) return known;
        folder ??= newMediaFolder(name);
        mkdirSync(folder, { recursive: true });
        const target = join(folder, safe(basename(zipPath)));
        writeFileSync(target, data);
        saved.set(zipPath, target);
        return target;
      }
    });
    const documentReport: DocumentImportReport = {
      source,
      look: opts.pptxLook,
      slides: report.slides,
      groups: report.groups,
      repeats: report.lyrics?.repeats ?? 0,
      pictures: report.pictures,
      hiddenSlides: report.hiddenSlides,
      removedChordLines: report.lyrics?.removedChordLines ?? 0,
      ccli: report.lyrics?.ccli ?? false,
      skipped: report.skipped
    };
    return { path, bytes: serializePresentation(presentation), documentReport };
  }

  const doc = (READERS[ext] ?? textFileToText)(bytes);
  if (!doc.text.trim()) throw new Error('There are no words in this file.');
  const { presentation, report } = lyricsToPresentation(name, doc.text, opts, doc.title);
  if (!report.slides) throw new Error('No lyrics were found in this file.');
  const documentReport: DocumentImportReport = {
    source,
    look: 'lyrics',
    slides: report.slides,
    groups: report.groups,
    repeats: report.repeats,
    pictures: 0,
    hiddenSlides: 0,
    removedChordLines: report.removedChordLines,
    ccli: report.ccli,
    skipped: {}
  };
  return { path, bytes: serializePresentation(presentation), documentReport };
}
