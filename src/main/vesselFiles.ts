// Vessel files in the app: the save and open dialogs, the unpacked files
// waiting for a choice, and adding to the library, themes and media bin.
import { app, dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { safeFileName, VESSEL_EXTENSION, type VesselChoice, type VesselExportRequest, type VesselManifest, type VesselPreview, type VesselReport } from '../shared/vesselFile';
import { listLibrary } from './library';
import { log } from './log';
import { addToMediaFolderNamed, loadMediaBin } from './media';
import { songIndex } from './songIndex';
import { getSettings } from './settings';
import { loadThemes, saveThemes } from './themes';
import { addFromUnpacked, clearUnpacked, previewOf, unpackVesselFile, writeVesselFile } from './vesselFile';

const staged = new Map<string, { dir: string; manifest: VesselManifest }>();

/** Ask where to save, then write the Vessel file. Null if cancelled. */
export async function exportVesselFile(win: BrowserWindow | null, req: VesselExportRequest): Promise<{ path: string; missing: string[] } | null> {
  const save = {
    title: 'Save as a Vessel file',
    defaultPath: join(app.getPath('documents'), `${safeFileName(req.title, 'Vessel file')}.${VESSEL_EXTENSION}`),
    filters: [{ name: 'Vessel file', extensions: [VESSEL_EXTENSION] }]
  };
  const target = win ? await dialog.showSaveDialog(win, save) : await dialog.showSaveDialog(save);
  if (target.canceled || !target.filePath) return null;
  const { manifest, missing } = await writeVesselFile(target.filePath, req, `Vessel ${app.getVersion()}`);
  log.info(`Vessel file saved: ${manifest.kind}, ${manifest.presentations.length} presentations, ${manifest.playlists.length} playlists, ${manifest.themes.length} themes, ${manifest.media.length} media${missing.length ? `, ${missing.length} missing` : ''}`);
  return { path: target.filePath, missing };
}

/** Pick a Vessel file (when no path is given), unpack it and say what's inside. */
export async function openVesselFile(win: BrowserWindow | null, path?: string): Promise<VesselPreview | null> {
  let file = path;
  if (!file) {
    const open = { title: 'Open a Vessel file', properties: ['openFile' as const], filters: [{ name: 'Vessel file', extensions: [VESSEL_EXTENSION] }] };
    const picked = win ? await dialog.showOpenDialog(win, open) : await dialog.showOpenDialog(open);
    if (picked.canceled || !picked.filePaths[0]) return null;
    file = picked.filePaths[0];
  }
  const token = randomUUID();
  const dir = join(app.getPath('temp'), `vessel-open-${token}`);
  try {
    const manifest = await unpackVesselFile(file, dir);
    staged.set(token, { dir, manifest });
    const library = await listLibrary();
    const themes = (await loadThemes()).custom;
    log.info(`Vessel file opened: ${manifest.kind}, ${manifest.presentations.length} presentations, ${manifest.themes.length} themes, ${manifest.media.length} media`);
    return await previewOf(token, basename(file), dir, manifest, { songNames: library.map((l) => l.name), themes, songs: songIndex(library.map((l) => l.path)) });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

/** Add the chosen parts of an opened Vessel file, then forget the unpacked copy. */
export async function addFromVesselFile(choice: VesselChoice): Promise<VesselReport> {
  const entry = staged.get(choice.token);
  if (!entry) throw new Error('That Vessel file is no longer open; open it again.');
  const s = await getSettings();
  const library = await loadThemes();
  const songs = songIndex((await listLibrary()).map((l) => l.path));
  const existingMedia = (await loadMediaBin()).map((m) => m.path);
  const title = safeFileName(entry.manifest.title, 'Vessel file');
  const report = await addFromUnpacked(entry.dir, entry.manifest, choice, {
    libraryFolder: s.libraryFolder,
    playlistFolder: s.playlistFolder,
    mediaFolder: join(dirname(s.libraryFolder), 'Media', title),
    themes: library.custom,
    songs,
    existingMedia
  });
  if (report.themes) await saveThemes({ ...library, custom: report.themesAfter });
  // The media goes into the media bin, in a folder named after the file.
  if (report.mediaAdded.length) await addToMediaFolderNamed(report.mediaAdded, title);
  await discardVesselFile(choice.token);
  log.info(`Added from a Vessel file: ${report.presentations} presentations, ${report.playlists} playlists, ${report.themes} themes, ${report.media} media, ${report.skipped} already here`);
  const { themesAfter: _t, mediaAdded: _m, ...rest } = report;
  return rest;
}

export async function discardVesselFile(token: string): Promise<void> {
  const entry = staged.get(token);
  staged.delete(token);
  if (entry) await rm(entry.dir, { recursive: true, force: true });
}

/** At start-up: unpacked Vessel files left from last time are removed. */
export const clearOldVesselFiles = (): Promise<void> => clearUnpacked(app.getPath('temp'));
