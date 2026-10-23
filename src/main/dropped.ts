// Files dropped onto the window, sorted by kind: songs and documents become
// presentations, pictures and videos go to the media bin, playlists become
// service playlists, and Bible files are added to the Bible.
import { stat } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import { DEFAULT_IMPORT_OPTIONS, isDocumentPath, type ImportOptions } from '../shared/import';
import { binKindOf } from '../shared/media';
import type { DroppedFiles, OpenedFile } from '../shared/types';
import { VESSEL_EXTENSION } from '../shared/vesselFile';
import { openVesselFile } from './vesselFiles';
import { readPlaylistFile } from './playlistBundles';
import { addBible } from './bibles';
import { importDocumentFile } from './importDocs';
import { importLegacyFile } from './legacy';
import { addToMediaBin } from './media';

const MAX_FILES = 200;
const BIBLE_EXTENSIONS = new Set(['.xml', '.zip', '.osis', '.usfx', '.zef']);

export async function openDropped(paths: unknown, opts: Partial<ImportOptions>, read: (path: string) => Promise<OpenedFile>, mediaFolder?: string | null): Promise<DroppedFiles> {
  const result: DroppedFiles = { presentations: [], playlists: [], media: null, bibles: [], vessel: [], errors: [] };
  // Only real files the user dropped: absolute paths that exist and aren't folders.
  const files: string[] = [];
  for (const p of Array.isArray(paths) ? paths.slice(0, MAX_FILES) : []) {
    if (typeof p !== 'string' || !isAbsolute(p)) continue;
    try {
      if ((await stat(p)).isFile()) files.push(p);
      else result.errors.push(`${baseName(p)}: folders can’t be dropped; drop the files inside it.`);
    } catch {
      result.errors.push(`${baseName(p)}: not found.`);
    }
  }
  const options = { ...DEFAULT_IMPORT_OPTIONS, ...opts };
  const media: string[] = [];
  for (const path of files) {
    const ext = extname(path).toLowerCase();
    try {
      if (ext === '.pro') result.presentations.push(await read(path));
      else if (/^\.pro[56]x?$/.test(ext)) result.presentations.push(await importLegacyFile(path));
      else if (ext === '.proplaylist') result.playlists.push(await readPlaylistFile(path));
      else if (ext === `.${VESSEL_EXTENSION}`) {
        const preview = await openVesselFile(null, path);
        if (preview) result.vessel.push(preview);
      }
      else if (binKindOf(path)) media.push(path);
      else if (isDocumentPath(path)) result.presentations.push(await importDocumentFile(path, options));
      else if (BIBLE_EXTENSIONS.has(ext)) result.bibles.push(await addBible(path));
      else result.errors.push(`${baseName(path)}: Vessel doesn’t know what to do with this kind of file.`);
    } catch (err) {
      result.errors.push(`${baseName(path)}: ${(err as Error).message}`);
    }
  }
  if (media.length) {
    result.mediaPlaced = {};
    result.media = await addToMediaBin(media, mediaFolder, result.mediaPlaced);
  }
  return result;
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
