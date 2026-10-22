import { app, dialog, type BrowserWindow } from 'electron';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { applyRestore, BACKUP_EXTENSION, unpackBackup, writeBackup } from './backupArchive';
import { loadMediaBin } from './media';
import { getSettings, updateSettings } from './settings';

const today = (): string => new Date().toISOString().slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** File ▸ Back Up…: pick where to save, whether to include media files, and write the backup. */
export async function backUp(win: BrowserWindow | null): Promise<void> {
  const settings = await getSettings();
  const bin = await loadMediaBin();
  const media = [...bin.map((m) => m.path), ...(settings.logoPath ? [settings.logoPath] : [])];
  const box = {
    type: 'question' as const,
    message: 'Back up Vessel',
    detail:
      'The backup holds your songs, playlists, themes, Bibles, media bin, CCLI log and settings, in one file you can keep safe or open on another computer with File ▸ Restore from Backup.',
    checkboxLabel: `Include the media files too (${plural(media.length, 'picture, video or audio file', 'pictures, videos and audio files')}; the backup can get large)`,
    checkboxChecked: false,
    buttons: ['Choose Where to Save…', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  };
  const choice = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box);
  if (choice.response !== 0) return;
  const save = {
    title: 'Save the backup',
    defaultPath: join(app.getPath('documents'), `Vessel Backup ${today()}.${BACKUP_EXTENSION}`),
    filters: [{ name: 'Vessel backup', extensions: [BACKUP_EXTENSION] }]
  };
  const target = win ? await dialog.showSaveDialog(win, save) : await dialog.showSaveDialog(save);
  if (target.canceled || !target.filePath) return;
  win?.setProgressBar(2); // Indeterminate while it's written.
  try {
    const manifest = await writeBackup(target.filePath, {
      dataFolder: app.getPath('userData'),
      libraryFolder: settings.libraryFolder,
      playlistFolder: settings.playlistFolder,
      media: choice.checkboxChecked ? media : [],
      appVersion: app.getVersion()
    });
    const c = manifest.counts;
    const done = {
      type: 'info' as const,
      message: 'Backup saved',
      detail: `${plural(c.songs, 'song')}, ${plural(c.playlists, 'playlist')}, ${plural(c.bibles, 'Bible')}${c.media ? ` and ${plural(c.media, 'media file')}` : ''}, with your themes and settings.${
        settings.extraFolders.length ? '\n\nSongs in your other library folders aren’t included; they stay where they are.' : ''
      }`,
      buttons: ['OK']
    };
    if (win) await dialog.showMessageBox(win, done);
    else await dialog.showMessageBox(done);
  } catch (err) {
    dialog.showErrorBox('The backup couldn’t be saved', (err as Error).message);
  } finally {
    win?.setProgressBar(-1);
  }
}

/** File ▸ Restore from Backup…: unpack a backup, put it in place, and restart to load it. */
export async function restore(win: BrowserWindow | null): Promise<void> {
  const open = { title: 'Restore from a backup', properties: ['openFile' as const], filters: [{ name: 'Vessel backup', extensions: [BACKUP_EXTENSION] }] };
  const picked = win ? await dialog.showOpenDialog(win, open) : await dialog.showOpenDialog(open);
  const file = picked.filePaths[0];
  if (picked.canceled || !file) return;
  const staging = await mkdtemp(join(app.getPath('temp'), 'vessel-restore-'));
  win?.setProgressBar(2);
  try {
    const manifest = await unpackBackup(file, staging);
    const c = manifest.counts;
    const confirm = {
      type: 'question' as const,
      message: `Restore the backup from ${new Date(manifest.created).toLocaleString()}?`,
      detail: `It has ${plural(c.songs, 'song')}, ${plural(c.playlists, 'playlist')}, ${plural(c.bibles, 'Bible')}${c.media ? ` and ${plural(c.media, 'media file')}` : ''}.\n\nThey’re added to what’s here: if you have a different song or playlist with the same name, both are kept. Themes and settings come from the backup; your screens and folders stay as they are.\n\nVessel restarts afterwards.`,
      buttons: ['Restore', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    };
    win?.setProgressBar(-1);
    const answer = win ? await dialog.showMessageBox(win, confirm) : await dialog.showMessageBox(confirm);
    if (answer.response !== 0) return;
    win?.setProgressBar(2);
    const settings = await getSettings();
    const report = await applyRestore(staging, manifest, {
      dataFolder: app.getPath('userData'),
      libraryFolder: settings.libraryFolder,
      playlistFolder: settings.playlistFolder,
      // Beside the library (normally Documents/Vessel).
      mediaFolder: join(dirname(settings.libraryFolder), 'Media', 'Restored'),
      settings
    });
    await updateSettings(report.settings);
    win?.setProgressBar(-1);
    const done = {
      type: 'info' as const,
      message: 'Backup restored',
      detail: `Added ${plural(report.songs, 'song')}, ${plural(report.playlists, 'playlist')}, ${plural(report.bibles, 'Bible')}${report.media ? ` and ${plural(report.media, 'media file')}` : ''}.${
        report.renamed.length ? `\n\nKept beside yours with “(backup)” in the name: ${report.renamed.slice(0, 8).join(', ')}${report.renamed.length > 8 ? '…' : ''}` : ''
      }${c.media ? '' : '\n\nMedia files weren’t in this backup. If any can’t be found, use Find… to point Vessel at them.'}\n\nVessel will now restart.`,
      buttons: ['Restart Vessel']
    };
    if (win) await dialog.showMessageBox(win, done);
    else await dialog.showMessageBox(done);
    app.relaunch();
    app.quit();
  } catch (err) {
    dialog.showErrorBox('The backup couldn’t be restored', (err as Error).message);
  } finally {
    win?.setProgressBar(-1);
    await rm(staging, { recursive: true, force: true });
  }
}
