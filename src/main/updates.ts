import { app, dialog, net, shell, type BrowserWindow } from 'electron';
import { createWriteStream, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { compareVersions, githubRepo, installerFor, parseRelease, shortNotes, type Release, type ReleaseAsset } from '../shared/updates';
import { getSettings, updateSettings } from './settings';

/** Where releases are published: package.json's "repository" (read from the app itself, so builds can differ). */
const repo = ((): string | null => {
  try {
    return githubRepo(JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).repository);
  } catch {
    return null;
  }
})();
let checking = false;

/** Vessel's public repository ("owner/name"), or null until it's set. */
export const vesselRepo = (): string | null => repo;

async function latestRelease(): Promise<Release | null> {
  const res = await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': `Vessel/${app.getVersion()}` },
    signal: AbortSignal.timeout(15_000)
  });
  if (res.status === 404) return null; // Nothing published yet.
  if (!res.ok) throw new Error(`the update server answered ${res.status}`);
  return parseRelease(await res.json());
}

/** Download the installer into Downloads, showing progress on the dock or taskbar icon. */
async function download(asset: ReleaseAsset, win: BrowserWindow | null): Promise<string> {
  const target = join(app.getPath('downloads'), asset.name);
  const res = await net.fetch(asset.url, { headers: { 'user-agent': `Vessel/${app.getVersion()}` } });
  if (!res.ok || !res.body) throw new Error(`the download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size;
  let received = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (total) win?.setProgressBar(received / total);
  });
  try {
    await pipeline(body, createWriteStream(target));
  } catch (err) {
    await rm(target, { force: true });
    throw err;
  } finally {
    win?.setProgressBar(-1);
  }
  return target;
}

/** A newer Vessel found by a background check, waiting for the operator (the toolbar's Update button). */
let available: Release | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** The version the toolbar's Update button offers, or null. */
export const availableUpdate = (): string | null => available?.version ?? null;

function announce(win: BrowserWindow | null, release: Release | null): void {
  available = release;
  win?.webContents.send('updates:available', release?.version ?? null);
}

/** Offer a release: download and install it now, later, or skip it. Only ever opened by the operator. */
async function offer(win: BrowserWindow | null, release: Release): Promise<void> {
  const say = (message: string, detail?: string): Promise<unknown> =>
    win ? dialog.showMessageBox(win, { type: 'info', message, detail, buttons: ['OK'] }) : dialog.showMessageBox({ type: 'info', message, detail, buttons: ['OK'] });
  const current = app.getVersion();
  const installer = installerFor(release, process.platform, process.arch);
  const options = {
    type: 'info' as const,
    message: `Vessel ${release.version} is available`,
    detail: `You have ${current}.${release.notes ? `\n\n${shortNotes(release.notes)}` : ''}`,
    buttons: [installer ? 'Download and Install' : 'Open Download Page', 'Later', 'Skip This Version'],
    defaultId: 0,
    cancelId: 1
  };
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  if (response === 2) {
    await updateSettings({ skippedVersion: release.version });
    announce(win, null);
  }
  if (response !== 0) return;
  if (!installer) {
    await shell.openExternal(release.page);
    return;
  }
  let file: string;
  try {
    file = await download(installer, win);
  } catch (err) {
    await say('The update couldn’t be downloaded.', `${(err as Error).message}. You can download it from ${release.page}`);
    return;
  }
  if (process.platform === 'win32') {
    // The installer replaces Vessel, so Vessel closes (asking about unsaved songs first) once it has started.
    const error = await shell.openPath(file);
    if (error) await say('The installer couldn’t be started.', `${error}\n\nIt’s in your Downloads folder: ${file}`);
    else app.quit();
  } else {
    await shell.openPath(file);
    await say(
      'Install the update',
      `The new version has opened in Finder. Quit Vessel, then drag Vessel into Applications and choose Replace.\n\nThe file is in your Downloads folder.`
    );
  }
}

/**
 * Look for a newer Vessel. In the background it never opens anything: a new
 * version (one the operator hasn't skipped) lights up the toolbar's Update
 * button instead. From the Help menu it always says what it found.
 */
export async function checkForUpdates(win: BrowserWindow | null, manual: boolean): Promise<void> {
  const say = (message: string, detail?: string): Promise<unknown> =>
    win ? dialog.showMessageBox(win, { type: 'info', message, detail, buttons: ['OK'] }) : dialog.showMessageBox({ type: 'info', message, detail, buttons: ['OK'] });
  if (!repo) {
    if (manual) await say('Update checks aren’t set up in this copy of Vessel.', 'Ask whoever gave you Vessel for the latest version.');
    return;
  }
  if (checking) return;
  checking = true;
  let release: Release | null;
  try {
    await updateSettings({ lastUpdateCheck: Date.now() });
    release = await latestRelease();
  } catch (err) {
    if (manual) await say('Couldn’t check for updates.', `${(err as Error).message}. Check the internet connection and try again.`);
    return;
  } finally {
    checking = false;
  }
  const current = app.getVersion();
  if (!release || compareVersions(release.version, current) <= 0) {
    announce(win, null);
    if (manual) await say('Vessel is up to date.', `You have the latest version, ${current}.`);
    return;
  }
  if (manual) return offer(win, release);
  announce(win, (await getSettings()).skippedVersion === release.version ? null : release);
}

/** The toolbar's Update button: offer what the background check found (or look again). */
export async function installUpdate(win: BrowserWindow | null): Promise<void> {
  if (available) await offer(win, available);
  else await checkForUpdates(win, true);
}

const EVERY = 4 * 60 * 60_000;

/** Check quietly soon after start-up and every few hours while Vessel is open, unless turned off in Preferences. */
export function startUpdateChecks(win: () => BrowserWindow | null): void {
  if (!repo || !app.isPackaged || timer) return;
  const quietly = async (): Promise<void> => {
    if ((await getSettings()).checkUpdates === false) return;
    await checkForUpdates(win(), false).catch(() => undefined);
  };
  setTimeout(() => void quietly(), 10_000);
  timer = setInterval(() => void quietly(), EVERY);
}
