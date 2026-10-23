// Playlists with media in the app: saving one for a service, and opening one
// (its songs into the library, its media into the media bin).
import { app, dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExportResult } from '../shared/exports';
import type { Service } from '../shared/pro/service';
import type { OpenedFile } from '../shared/types';
import { safeFileName } from '../shared/vesselFile';
import { log } from './log';
import { addToMediaFolderNamed } from './media';
import { unbundlePlaylist, writePlaylistBundle } from './playlistBundle';
import { getSettings } from './settings';

/** Ask where, then save the service with its songs and media. Null if cancelled. */
export async function exportPlaylistBundle(win: BrowserWindow | null, service: Service): Promise<(ExportResult & { missing: string[] }) | null> {
  const opts = {
    title: 'Export playlist with media',
    defaultPath: join(app.getPath('documents'), `${safeFileName(service.name, 'Playlist')}.proPlaylist`),
    filters: [{ name: 'Playlist', extensions: ['proPlaylist'] }]
  };
  const picked = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (picked.canceled || !picked.filePath) return null;
  const { files, missing } = await writePlaylistBundle(picked.filePath, service);
  log.info(`Exported a playlist with media: ${files} files${missing.length ? `, ${missing.length} missing` : ''}`);
  return { path: picked.filePath, files, missing };
}

/**
 * Read a playlist file to import it. One with songs and media inside has them
 * copied in first (media into the media bin), and comes back pointing at them.
 */
export async function readPlaylistFile(path: string): Promise<OpenedFile> {
  const s = await getSettings();
  const unbundled = await unbundlePlaylist(path, join(app.getPath('temp'), `vessel-playlist-${randomUUID()}`), {
    libraryFolder: s.libraryFolder,
    mediaRoot: join(dirname(s.libraryFolder), 'Media')
  });
  if (!unbundled) return { path, bytes: new Uint8Array(await readFile(path)) };
  if (unbundled.media.length) await addToMediaFolderNamed(unbundled.media, unbundled.name);
  log.info(`Opened a playlist with media: ${unbundled.songs} songs, ${unbundled.media.length} media`);
  return { path, bytes: unbundled.bytes };
}
