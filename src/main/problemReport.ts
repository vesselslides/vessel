// Help ▸ Report a Problem: one zip with what someone needs to work out what
// went wrong: Vessel's logs for the past week, a technical summary, and (on a
// Mac) the system's crash reports for Vessel from the past week. No songs,
// lyrics, Bible text, file paths, passwords, PINs or Planning Center secret.
import { app, dialog, screen, shell, type BrowserWindow } from 'electron';
import { zipSync } from 'fflate';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { listBibles } from './bibles';
import { listLibrary } from './library';
import { log, logFolder } from './log';
import { loadMediaBin } from './media';
import { getSettings } from './settings';

const WEEK = 7 * 24 * 60 * 60_000;

/** Which features are in use, as yes/no and simple values (never paths, PINs or tokens). */
async function summary(): Promise<string> {
  const s = await getSettings();
  const [songs, bibles, media] = await Promise.all([listLibrary().catch(() => []), listBibles().catch(() => []), loadMediaBin().catch(() => [])]);
  const displays = screen.getAllDisplays().map((d, i) => `  ${i + 1}. ${d.size.width}×${d.size.height} at ${d.scaleFactor}x${d.internal ? ', built-in' : ''}${d.id === screen.getPrimaryDisplay().id ? ', main' : ''}`);
  const yes = (v: unknown): string => (v ? 'yes' : 'no');
  const lines = [
    `Vessel ${app.getVersion()}`,
    `Made: ${new Date().toISOString()}`,
    `System: ${process.platform} ${process.getSystemVersion()} (${process.arch})`,
    `Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, Node ${process.versions.node}`,
    `Packaged app: ${yes(app.isPackaged)}`,
    `Memory in use: ${Math.round(process.memoryUsage().rss / 1048576)} MB`,
    '',
    'Displays:',
    ...displays,
    '',
    `Songs in the library: ${songs.length} (extra library folders: ${s.extraFolders.length})`,
    `Bibles: ${bibles.length}`,
    `Media bin items: ${media.length}`,
    '',
    'Settings in use:',
    `  Audience screen chosen: ${yes(s.outputDisplayId != null)}, stage display: ${yes(s.stageDisplayId != null)}, stream output: ${s.streamOutput ?? 'off'}`,
    `  NDI output: ${yes(s.ndi?.enabled)}, MIDI: ${yes(s.midi?.enabled)}, remote control: ${yes(s.remoteEnabled)}`,
    `  Autosave: ${yes(s.autosave !== false)}, appearance: ${s.appearance ?? 'dark'}, slide size: ${s.slideSize ? `${s.slideSize.width}×${s.slideSize.height}` : '1920×1080'}`,
    `  Fade: ${s.transitionMs ?? 500} ms, copy media: ${yes(s.copyMedia)}, update checks: ${yes(s.checkUpdates !== false)}`,
    '',
    'GPU:',
    ...Object.entries(app.getGPUFeatureStatus()).map(([k, v]) => `  ${k}: ${v}`)
  ];
  return lines.join('\n');
}

/** The Mac's crash reports for Vessel (or Electron, while developing) from the past week. */
function macCrashReports(): Record<string, Uint8Array> {
  if (process.platform !== 'darwin') return {};
  const dir = join(homedir(), 'Library', 'Logs', 'DiagnosticReports');
  const out: Record<string, Uint8Array> = {};
  try {
    for (const name of readdirSync(dir)) {
      if (!/^(Vessel|Electron)[-_].*\.(ips|crash)$/.test(name)) continue;
      const path = join(dir, name);
      if (Date.now() - statSync(path).mtimeMs > WEEK) continue;
      // macOS already writes the user's folder as /Users/USER; mask any other paths too.
      out[`crash-reports/${name}`] = new TextEncoder().encode(readFileSync(path, 'utf8').replace(/\/Users\/(?!USER\b)[^/"]+/g, '/Users/USER'));
    }
  } catch {
    // No permission to read them: the report goes without.
  }
  return out;
}

function logs(): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  try {
    for (const name of readdirSync(logFolder())) if (/^vessel-.*\.log$/.test(name)) out[`logs/${name}`] = readFileSync(join(logFolder(), name));
  } catch {
    // No logs yet.
  }
  return out;
}

/** Ask, then save the report where the person chooses and show it in Finder or Explorer. */
export async function saveProblemReport(win: BrowserWindow | null): Promise<string | null> {
  const box = {
    type: 'info' as const,
    message: 'Report a problem',
    detail:
      'Vessel will save one file with its log from the past week and technical details about this computer (and, on a Mac, its crash reports). It has no songs, lyrics, Bible text, file names, passwords or PINs.\n\nSend the file to whoever looks after Vessel, with a sentence about what happened.',
    buttons: ['Save Report…', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  };
  const answer = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box);
  if (answer.response !== 0) return null;
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
  const save = {
    title: 'Save the problem report',
    defaultPath: join(app.getPath('desktop'), `Vessel problem report ${stamp}.zip`),
    filters: [{ name: 'Zip file', extensions: ['zip'] }]
  };
  const target = win ? await dialog.showSaveDialog(win, save) : await dialog.showSaveDialog(save);
  if (target.canceled || !target.filePath) return null;
  log.info('Problem report saved');
  const files: Record<string, Uint8Array> = {
    'about-this-computer.txt': new TextEncoder().encode(await summary()),
    ...logs(),
    ...macCrashReports()
  };
  writeFileSync(target.filePath, zipSync(files, { level: 6 }));
  if (existsSync(target.filePath)) shell.showItemInFolder(target.filePath);
  return target.filePath;
}
