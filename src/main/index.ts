import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import { AUDIO_EXTENSIONS, binKindOf, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../shared/media';
import { audienceState, INITIAL_LIVE, INITIAL_STAGE, type DisplayInfo, type LiveState, type OpenedFile, type Settings, type StageState } from '../shared/types';
import { importLegacyFile } from './legacy';
import { importDocumentFile } from './importDocs';
import { openDropped } from './dropped';
import { clearUsage, logUsage, saveReport, usageLog } from './ccliLog';
import { setGroupDefinitions } from '../shared/groups';
import { addBible, downloadFreeBible, listBibles, loadBible, removeBible } from './bibles';
import { DEFAULT_IMPORT_OPTIONS, DOCUMENT_EXTENSIONS, DOCUMENT_KINDS, isDocumentPath, UNSUPPORTED_DOCUMENTS, type DocumentKind, type ImportOptions } from '../shared/import';
import { loadThemes, saveThemes } from './themes';
import { insideLibrary, listLibrary, listPlaylists, insidePlaylistFolder, renamePlaylist, saveToLibrary, watchLibrary, writePlaylist } from './library';
import { getSettings, updateSettings } from './settings';
import { migrateFromLumen, type MigrationReport } from './migrate';
import { setupRemote, shutdownRemote } from './remote';
import { setupContextMenu } from './contextMenu';
import { rebuildAppMenu, setupAppMenu } from './appMenu';
import { normalizeStreamLook, normalizeStreamTarget, type StreamLook, type StreamTarget } from '../shared/stream';
import { NdiSender } from './ndi';
import { pcoConnect, pcoDisconnect, pcoPlanItems, pcoPlans, pcoServiceTypes, pcoStatus } from './planningCenter';
import { NDI_SITE, NDI_SIZES, normalizeNdi, type NdiStatus } from '../shared/ndi';
import appIcon from '../../build/icon.png?asset';
import type { ThemeLibrary } from '../shared/theme';
import { addToMediaBin, createMediaFolder, deleteMediaFolder, handleMediaProtocol, loadMediaBin, loadMediaFolders, moveMedia, registerMediaScheme, relinkMediaBin, removeFromMediaBin, renameMediaFolder, setMediaMuted } from './media';
import { findMoved, missingPaths } from './relink';
import { checkForUpdates, checkForUpdatesOnLaunch } from './updates';
import { describe, endRun, log, startRun } from './log';
import { saveProblemReport } from './problemReport';
import { installSamples } from './samples';
import { exportDocument } from './exports';
import { onlineGallery, submitToGallery } from './themeGallery';
import { exportPlaylistBundle, readPlaylistFile } from './playlistBundles';
import { addFromVesselFile, clearOldVesselFiles, discardVesselFile, exportVesselFile, openVesselFile } from './vesselFiles';
import { backUp, restore } from './backup';

let operatorWindow: BrowserWindow | null = null;
let outputWindow: BrowserWindow | null = null;
let stageWindow: BrowserWindow | null = null;
let liveState: LiveState = INITIAL_LIVE;
let stageState: StageState = INITIAL_STAGE;
let unsavedCount = 0;
let migration: MigrationReport | null = null;

const notifyLibrary = (): void => operatorWindow?.webContents.send('library:changed');

// Lets tests and multiple installs run with their own media bin and settings.
if (process.env.VESSEL_USER_DATA) app.setPath('userData', process.env.VESSEL_USER_DATA);
// Tests also keep their songs and media out of the real Documents folder.
if (process.env.VESSEL_DOCUMENTS) app.setPath('documents', process.env.VESSEL_DOCUMENTS);
registerMediaScheme();

// One Vessel at a time: two copies would fight over the same library, settings and screens.
// Opening it again brings the running one forward instead.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
// ---- Files opened from Finder or Explorer (double-clicked, or dropped on Vessel's icon)

const OPENABLE = /\.(pro|pro5|pro5x|pro6|pro6x|proplaylist|vessel)$/i;
let operatorReady = false;
const pendingOpen: string[] = [];

function openExternal(paths: string[]): void {
  const files = paths.filter((p) => OPENABLE.test(p) && isAbsolute(p) && existsSync(p));
  if (!files.length) return;
  log.info(`Opening ${files.length} file(s) from the system`);
  if (operatorWindow && operatorReady) operatorWindow.webContents.send('files:open-external', files);
  else pendingOpen.push(...files);
}

// A Mac sends the files as events, possibly before Vessel is ready.
app.on('open-file', (e, path) => {
  e.preventDefault();
  openExternal([path]);
});

app.on('second-instance', (_e, argv) => {
  // Windows passes a double-clicked file to the copy that's already running.
  openExternal(argv.slice(1));
  if (!operatorWindow) return;
  if (operatorWindow.isMinimized()) operatorWindow.restore();
  operatorWindow.focus();
});

const preload = join(__dirname, '../preload/index.js');

function loadPage(win: BrowserWindow, page: 'index' | 'output' | 'stage' | 'stream' | 'print', hash = ''): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/${page}.html${hash ? `#${hash}` : ''}`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`), hash ? { hash } : undefined);
}

function createOperatorWindow(): void {
  operatorWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Vessel',
    // Windows and Linux show it in the title bar and taskbar; on a Mac the app bundle's icon is used.
    icon: appIcon,
    backgroundColor: '#15161a',
    webPreferences: { preload, sandbox: false, contextIsolation: true }
  });
  loadPage(operatorWindow, 'index');
  operatorWindow.webContents.on('did-finish-load', () => {
    operatorReady = true;
    if (pendingOpen.length) operatorWindow?.webContents.send('files:open-external', pendingOpen.splice(0));
  });
  // A file dropped where nothing handles it would otherwise replace Vessel with that file.
  operatorWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  operatorWindow.on('close', (e) => {
    if (unsavedCount === 0) return;
    const choice = dialog.showMessageBoxSync(operatorWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Quit without saving'],
      defaultId: 0,
      cancelId: 0,
      message: `${unsavedCount} presentation${unsavedCount === 1 ? ' has' : 's have'} unsaved changes.`,
      detail: 'Save with ⌘S / Ctrl+S, or quit and lose the changes.'
    });
    if (choice === 0) e.preventDefault();
    else unsavedCount = 0;
  });
  operatorWindow.on('closed', () => {
    operatorWindow = null;
    outputWindow?.close();
    stageWindow?.close();
    streamWindow?.close();
  });
}

// ---- Screens that heal themselves

const SCREEN_NAMES: Record<string, string> = { output: 'audience screen', stage: 'stage display', stream: 'stream output', ndi: 'NDI output' };
const recentRepairs = new Map<string, number[]>();

/** Send to a window, unless it's gone or its page has crashed (it's being reopened). */
function sendTo(win: BrowserWindow | null, channel: string, data: unknown): void {
  if (win && !win.isDestroyed() && !win.webContents.isCrashed()) win.webContents.send(channel, data);
}

/** Say something in the operator window's status bar. */
const notice = (message: string): void => operatorWindow?.webContents.send('app:notice', message);

/**
 * Watch a screen window: if its page crashes it's reopened, and if it stops
 * responding for a few seconds it's restarted. At most three times a minute,
 * so a screen that keeps failing can't keep Vessel busy.
 */
function keepAlive(win: BrowserWindow, kind: keyof typeof SCREEN_NAMES, reopen: () => void, giveUp: () => void): void {
  const name = SCREEN_NAMES[kind];
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    log.error(`The ${name} stopped (${details.reason}, exit code ${details.exitCode})`);
    const now = Date.now();
    const times = (recentRepairs.get(kind) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= 3) {
      log.error(`The ${name} failed three times in a minute; not reopening it again`);
      notice(`The ${name} keeps stopping, so Vessel has turned it off. Turn it on again from Screens, or restart Vessel.`);
      // A crashed page can show as a blank white screen: take the window away.
      giveUp();
      return;
    }
    recentRepairs.set(kind, [...times, now]);
    notice(`The ${name} stopped working and was reopened.`);
    setTimeout(reopen, 300);
  });
  let stuck: NodeJS.Timeout | null = null;
  win.on('unresponsive', () => {
    log.warn(`The ${name} isn't responding`);
    stuck = setTimeout(() => {
      if (win.isDestroyed()) return;
      log.error(`The ${name} didn't respond for 5 seconds; restarting it`);
      // Its "process gone" handler above then reopens it.
      win.webContents.forcefullyCrashRenderer();
    }, 5000);
  });
  win.on('responsive', () => {
    if (stuck) clearTimeout(stuck);
    stuck = null;
  });
  win.on('closed', () => stuck && clearTimeout(stuck));
}

/** A borderless window covering one display, used for the audience and stage outputs. */
function createScreenWindow(displayId: number, page: 'output' | 'stage' | 'stream', initial: () => [string, unknown]): BrowserWindow | null {
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return null;
  const { x, y, width, height } = display.bounds;
  const secondary = displayId !== screen.getPrimaryDisplay().id;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    // Only go true full screen on a secondary display, so a single-screen
    // setup keeps the operator window reachable.
    fullscreen: !display.internal && secondary,
    alwaysOnTop: secondary,
    // Background videos must start with sound without a click on the output.
    webPreferences: { preload, sandbox: false, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  if (process.platform === 'darwin' && win.isFullScreenable() && !display.internal && secondary) fullScreenSettled.set(win, fullScreenChange(win, 'enter-full-screen'));
  loadPage(win, page);
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('did-finish-load', () => win.webContents.send(...initial()));
  return win;
}

/**
 * A Mac moves a window into or out of full screen with an animation. Closing
 * the window before that has completely finished can crash the app (macOS
 * still sends the window its "finished" notice), so each screen window
 * remembers when its last change will be over.
 */
const fullScreenSettled = new WeakMap<BrowserWindow, Promise<void>>();

/** Resolves once a full-screen change has finished (and a moment more for macOS to tidy up), or after `limit`. */
function fullScreenChange(win: BrowserWindow, event: 'enter-full-screen' | 'leave-full-screen', limit = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      win.removeListener(event as 'enter-full-screen', done);
      win.removeListener('closed', done);
      // Not straight away: other parts of macOS are still handling the same notice.
      setTimeout(resolve, 300);
    };
    const timer = setTimeout(done, limit);
    // (The two events have the same listener type; TypeScript can't pick an overload for the union.)
    win.once(event as 'enter-full-screen', done);
    win.once('closed', done);
  });
}

/**
 * Take a screen window away. Its picture goes black at once; on a Mac a
 * full-screen window then leaves full screen, and only when that has
 * completely finished is it closed.
 */
async function closeScreenWindow(win: BrowserWindow | null): Promise<void> {
  if (!win || win.isDestroyed()) return;
  // Black straight away, so nothing lingers on the screen while it closes.
  sendTo(win, 'live:update', { ...INITIAL_LIVE, blackout: true, transitionMs: 0 });
  if (process.platform === 'darwin') {
    await fullScreenSettled.get(win);
    if (win.isDestroyed()) return;
    if (win.isFullScreen()) {
      const left = fullScreenChange(win, 'leave-full-screen');
      win.setFullScreen(false);
      await left;
    }
  }
  if (!win.isDestroyed()) win.close();
}

/** "display 2 of 3, 1920×1080", for the log (display names can be personal, so they're left out). */
function displayLabel(id: number): string {
  const all = screen.getAllDisplays();
  const i = all.findIndex((d) => d.id === id);
  return i < 0 ? 'a display that’s gone' : `display ${i + 1} of ${all.length}, ${all[i].size.width}×${all[i].size.height}${all[i].internal ? ', built-in' : ''}`;
}

function setOutput(displayId: number | null): void {
  void closeScreenWindow(outputWindow);
  const win = displayId === null ? null : createScreenWindow(displayId, 'output', () => ['live:update', audienceState(liveState)]);
  outputWindow = win;
  log.info(displayId === null ? 'Audience screen off' : win ? `Audience screen on ${displayLabel(displayId)}` : `Audience screen: display ${displayId} not found`);
  if (win)
    keepAlive(
      win,
      'output',
      () => outputWindow === win && setOutput(displayId),
      () => outputWindow === win && (setOutput(null), sendTo(operatorWindow, 'screen:off', 'output'))
    );
  // Only forget the window if it's still the current one: the old window's
  // "closed" can arrive after a new one has replaced it.
  win?.on('closed', () => {
    if (outputWindow === win) outputWindow = null;
  });
}

function setStageOutput(displayId: number | null): void {
  void closeScreenWindow(stageWindow);
  const win = displayId === null ? null : createScreenWindow(displayId, 'stage', () => ['stage:update', stageState]);
  stageWindow = win;
  log.info(displayId === null ? 'Stage display off' : win ? `Stage display on ${displayLabel(displayId)}` : `Stage display: display ${displayId} not found`);
  if (win)
    keepAlive(
      win,
      'stage',
      () => stageWindow === win && setStageOutput(displayId),
      () => stageWindow === win && (setStageOutput(null), sendTo(operatorWindow, 'screen:off', 'stage'))
    );
  win?.on('closed', () => {
    if (stageWindow === win) stageWindow = null;
  });
}

// ---- Stream output: lyrics for streaming software, in a window to capture or on a display.

let streamWindow: BrowserWindow | null = null;
let streamTarget: StreamTarget = null;

async function sendStreamLook(): Promise<void> {
  const s = await getSettings();
  const look = normalizeStreamLook(s.streamLook);
  streamWindow?.webContents.send('stream:look', look);
  // NDI can carry a see-through background, so the key colour isn't needed there.
  const ndiLook: StreamLook = normalizeNdi(s.ndi).transparent ? { ...look, background: 'none', media: false } : look;
  ndiSender?.window?.webContents.send('stream:look', ndiLook);
}

// ---- NDI® output: the stream picture over the network (needs the free NDI Runtime).

let ndiSender: NdiSender | null = null;
let ndiStatus: NdiStatus = { state: 'off' };

function applyNdi(settings: Settings): void {
  ndiSender?.stop();
  ndiSender = null;
  const ndi = normalizeNdi(settings.ndi);
  if (!ndi.enabled) {
    ndiStatus = { state: 'off' };
    return;
  }
  const sender = new NdiSender({
    name: ndi.name,
    ...NDI_SIZES[ndi.resolution],
    seeThrough: ndi.transparent,
    preload,
    load: (win) => {
      // See-through from the first paint, before the look arrives.
      loadPage(win, 'stream', ndi.transparent ? 'see-through' : '');
      win.webContents.on('did-finish-load', () => {
        win.webContents.send('live:update', audienceState(liveState));
        void sendStreamLook();
      });
    }
  });
  ndiStatus = sender.start();
  log.info(ndiStatus.state === 'sending' ? `NDI output on (${ndi.resolution})` : `NDI output not started: ${'message' in ndiStatus ? ndiStatus.message : ndiStatus.state}`);
  if (ndiStatus.state === 'sending') {
    ndiSender = sender;
    const win = sender.window;
    if (win)
      keepAlive(
        win,
        'ndi',
        () => ndiSender === sender && void getSettings().then(applyNdi),
        () => {
          if (ndiSender !== sender) return;
          sender.stop();
          ndiSender = null;
          ndiStatus = { state: 'error', message: 'NDI output kept stopping, so Vessel turned it off. Turn it on again in Preferences ▸ Screens.' };
        }
      );
  } else sender.stop();
}

function setStreamOutput(target: StreamTarget): void {
  const old = streamWindow;
  streamWindow = null;
  void closeScreenWindow(old);
  streamTarget = target;
  if (target === 'window') {
    // An ordinary window, so capture software can find it by name; sized like a 720p picture.
    streamWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      title: 'Vessel Stream Output',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { preload, sandbox: false, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
    });
    streamWindow.setAspectRatio(16 / 9);
    loadPage(streamWindow, 'stream');
    streamWindow.once('ready-to-show', () => streamWindow?.showInactive());
    // Keep the name the capture software looks for.
    streamWindow.on('page-title-updated', (e) => e.preventDefault());
    streamWindow.webContents.on('did-finish-load', () => streamWindow?.webContents.send('live:update', audienceState(liveState)));
  } else if (target !== null) {
    streamWindow = createScreenWindow(target, 'stream', () => ['live:update', audienceState(liveState)]);
    if (!streamWindow) streamTarget = null;
  }
  const win = streamWindow;
  log.info(target === null ? 'Stream output off' : target === 'window' ? 'Stream output in a window' : `Stream output on ${displayLabel(target)}`);
  if (win)
    keepAlive(
      win,
      'stream',
      () => streamWindow === win && setStreamOutput(target),
      () => streamWindow === win && void chooseStreamOutput(null).then(() => sendTo(operatorWindow, 'screen:off', 'stream'))
    );
  win?.webContents.on('did-finish-load', () => void sendStreamLook());
  win?.on('closed', () => {
    // Closed by hand: the stream output is off.
    if (streamWindow !== win) return;
    streamWindow = null;
    streamTarget = null;
    void updateSettings({ streamOutput: null });
    rebuildAppMenu();
  });
  rebuildAppMenu();
}

/** Choose where the stream output shows, and remember it for next time. */
async function chooseStreamOutput(target: StreamTarget): Promise<Settings> {
  setStreamOutput(normalizeStreamTarget(target));
  return updateSettings({ streamOutput: streamTarget });
}

const PRESENTATION_EXTS = new Set(['.pro']);

async function readOpened(path: string): Promise<OpenedFile> {
  return { path, bytes: new Uint8Array(await readFile(path)) };
}

/** Resolve a path stored in a ProPresenter playlist to a file on this machine. */
function resolveDocumentPath(path: string): string | null {
  const candidates = isAbsolute(path)
    ? [path]
    : [join(app.getPath('documents'), path), join(app.getPath('home'), path), join(app.getPath('documents'), 'ProPresenter', path)];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Native menus and dialogs follow Preferences ▸ Appearance (the screens stay black either way). */
function applyAppearance(appearance: Settings['appearance']): void {
  nativeTheme.themeSource = appearance === 'light' ? 'light' : appearance === 'system' ? 'system' : 'dark';
}

function registerIpc(): void {
  ipcMain.handle('files:open', async (_e, kind: 'presentation' | 'playlist' | 'pro') => {
    const result = await dialog.showOpenDialog(operatorWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters:
        kind === 'pro'
          ? [{ name: 'Presentations (.pro, .pro6, .pro6x, .pro5)', extensions: ['pro', 'pro6', 'pro6x', 'pro5', 'pro5x'] }]
          : kind === 'presentation'
          ? [
              { name: 'Presentations and documents', extensions: ['pro', 'pro6', 'pro6x', 'pro5', 'pro5x', ...DOCUMENT_EXTENSIONS] },
              { name: 'Presentations (.pro, .pro5, .pro6)', extensions: ['pro', 'pro6', 'pro6x', 'pro5', 'pro5x'] }
            ]
          : [{ name: 'Playlists', extensions: ['proPlaylist', '*'] }]
    });
    if (result.canceled) return [];
    return Promise.all(
      result.filePaths.map(async (path): Promise<OpenedFile> => {
        try {
          if (kind !== 'playlist' && isDocumentPath(path)) return await importDocumentFile(path, DEFAULT_IMPORT_OPTIONS);
          if (kind === 'playlist') return await readPlaylistFile(path);
          return /\.pro[56]x?$/i.test(path) ? await importLegacyFile(path) : await readOpened(path);
        } catch (err) {
          return { path, bytes: new Uint8Array(), error: (err as Error).message };
        }
      })
    );
  });

  ipcMain.handle('files:import', async (_e, opts: ImportOptions, kind?: DocumentKind) => {
    // One kind (from the Import window's cards) shows only its files; otherwise all of them.
    const only = kind && kind in DOCUMENT_KINDS ? DOCUMENT_KINDS[kind] : null;
    const result = await dialog.showOpenDialog(operatorWindow!, {
      title: only?.title ?? 'Import PowerPoint, Word or text files',
      properties: ['openFile', 'multiSelections'],
      filters: only
        ? [{ name: only.filter, extensions: only.extensions }]
        : [
            { name: 'PowerPoint, Word and text', extensions: [...DOCUMENT_EXTENSIONS, ...Object.keys(UNSUPPORTED_DOCUMENTS)] },
            { name: 'PowerPoint (.pptx)', extensions: ['pptx', 'ppsx'] },
            { name: 'Word and OpenDocument (.docx, .odt, .rtf)', extensions: ['docx', 'odt', 'rtf'] },
            { name: 'Text and ChordPro', extensions: ['txt', 'text', 'md', 'cho', 'chopro', 'chordpro', 'crd'] }
          ]
    });
    if (result.canceled) return [];
    const options = { ...DEFAULT_IMPORT_OPTIONS, ...opts };
    return Promise.all(
      result.filePaths.map(async (path): Promise<OpenedFile> => {
        try {
          return await importDocumentFile(path, options);
        } catch (err) {
          return { path, bytes: new Uint8Array(), error: (err as Error).message };
        }
      })
    );
  });

  ipcMain.handle('ccli:log', (_e, entry) => logUsage(entry ?? {}));
  ipcMain.handle('ccli:usage', () => usageLog());
  ipcMain.handle('ccli:clear', () => clearUsage());
  ipcMain.handle('app:data-folder', () => app.getPath('userData'));
  ipcMain.handle('app:open-data-folder', async () => {
    await shell.openPath(app.getPath('userData'));
  });
  ipcMain.handle('ccli:save-report', (_e, csv: string, name: string) => saveReport(operatorWindow, String(csv), String(name)));
  ipcMain.handle('bibles:list', () => listBibles());
  ipcMain.handle('bibles:download', async (e, id: string) => {
    try {
      let last = 0;
      const added = await downloadFreeBible(String(id), (received, total) => {
        // About ten updates a second is plenty for a progress bar.
        if (Date.now() - last < 100 && received < total) return;
        last = Date.now();
        if (!e.sender.isDestroyed()) e.sender.send('bibles:progress', { id, received, total });
      });
      return { added, list: await listBibles() };
    } catch (err) {
      return { error: (err as Error).message, list: await listBibles() };
    }
  });
  ipcMain.handle('bibles:get', (_e, id: string) => loadBible(String(id)));
  ipcMain.handle('bibles:remove', (_e, id: string) => removeBible(String(id)));
  ipcMain.handle('bibles:add', async () => {
    const result = await dialog.showOpenDialog(operatorWindow!, {
      title: 'Add a Bible (Zefania, OSIS, USFX, OpenSong or Holy Bible XML)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Bible files', extensions: ['xml', 'zip', 'osis', 'usfx', 'zef'] }]
    });
    const added = [];
    const errors: string[] = [];
    for (const path of result.canceled ? [] : result.filePaths) {
      try {
        added.push(await addBible(path));
      } catch (err) {
        errors.push(`${path.split(/[\\/]/).pop()}: ${(err as Error).message}`);
      }
    }
    return { added, errors, list: await listBibles() };
  });

  ipcMain.handle('files:dropped', (_e, paths: unknown, opts: Partial<ImportOptions>, mediaFolder?: string | null) => openDropped(paths, opts ?? {}, readOpened, mediaFolder));

  ipcMain.handle('files:read', async (_e, path: string) => {
    // Only presentation documents referenced by a playlist may be read this way.
    if (!PRESENTATION_EXTS.has(extname(path).toLowerCase())) return null;
    const resolved = resolveDocumentPath(path);
    return resolved ? readOpened(resolved) : null;
  });

  ipcMain.handle('files:save', async (_e, bytes: Uint8Array, suggestedName: string, existingPath?: string) => {
    // Existing files are written in place; new ones go into the library folder.
    if (existingPath && extname(existingPath).toLowerCase() === '.pro') {
      await writeFile(existingPath, bytes);
      return existingPath;
    }
    return saveToLibrary(bytes, suggestedName);
  });

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('app:migration', () => migration);
  ipcMain.handle('settings:update', async (_e, patch: Partial<Settings>) => {
    // Folder settings change only through the dialogs below.
    const { libraryFolder: _l, playlistFolder: _p, extraFolders: _x, remoteEnabled: _r, remotePin: _n, remotePort: _o, ...safe } = patch;
    const next = await updateSettings(safe);
    if (patch.appearance) applyAppearance(next.appearance);
    // Imports made here colour their groups from the church's list.
    if (patch.groups) setGroupDefinitions(next.groups);
    if (patch.streamLook) void sendStreamLook();
    if (patch.ndi) applyNdi(next);
    return next;
  });
  ipcMain.handle('library:add-folder', async () => {
    const result = await dialog.showOpenDialog(operatorWindow!, {
      title: 'Add a folder of presentations',
      properties: ['openDirectory']
    });
    const s = await getSettings();
    if (result.canceled || !result.filePaths[0] || [s.libraryFolder, ...s.extraFolders].includes(result.filePaths[0])) return s;
    const next = await updateSettings({ extraFolders: [...s.extraFolders, result.filePaths[0]] });
    await watchLibrary(notifyLibrary);
    return next;
  });
  ipcMain.handle('library:remove-folder', async (_e, folder: string) => {
    const s = await getSettings();
    const next = await updateSettings({ extraFolders: s.extraFolders.filter((f) => f !== folder) });
    await watchLibrary(notifyLibrary);
    return next;
  });
  ipcMain.handle('library:list', () => listLibrary());
  ipcMain.handle('playlists:list', () => listPlaylists());
  ipcMain.handle('playlists:read', async (_e, path: string) => ((await insidePlaylistFolder(path)) && existsSync(path) ? new Uint8Array(await readFile(path)) : null));
  ipcMain.handle('playlists:write', (_e, bytes: Uint8Array, name: string, path?: string) => writePlaylist(bytes, name, path));
  ipcMain.handle('playlists:rename', (_e, path: string, name: string) => renamePlaylist(path, name));
  ipcMain.handle('files:reveal', (_e, path: string) => {
    // Songs, playlists and media only.
    const ext = extname(path).toLowerCase();
    if (existsSync(path) && (ext === '.pro' || ext === '.proplaylist' || binKindOf(path))) shell.showItemInFolder(path);
  });
  ipcMain.handle('library:trash', async (_e, path: string) => {
    if (!(await insideLibrary(path)) || !existsSync(path)) return false;
    await shell.trashItem(path);
    return true;
  });
  ipcMain.handle('playlists:trash', async (_e, path: string) => {
    if (await insidePlaylistFolder(path)) await shell.trashItem(path);
  });
  ipcMain.on('app:unsaved', (_e, count: number) => {
    unsavedCount = count;
  });

  ipcMain.handle('displays:list', (): DisplayInfo[] => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: d.label || `Display ${i + 1}`,
      bounds: d.bounds,
      primary: d.id === primary
    }));
  });

  ipcMain.handle('media:list', () => loadMediaBin());
  ipcMain.handle('themes:load', () => loadThemes());
  ipcMain.handle('themes:save', (_e, library: ThemeLibrary) => saveThemes(library));
  ipcMain.handle('media:folders', () => loadMediaFolders());
  ipcMain.handle('media:folder-create', (_e, name: string) => createMediaFolder(name));
  ipcMain.handle('media:folder-rename', (_e, id: string, name: string) => renameMediaFolder(String(id), name));
  ipcMain.handle('media:folder-delete', (_e, id: string) => deleteMediaFolder(String(id)));
  ipcMain.handle('media:move', (_e, ids: string[], folder: string | null) => moveMedia(ids, folder ? String(folder) : null));
  ipcMain.handle('media:mute', (_e, id: string, muted: boolean) => setMediaMuted(String(id), !!muted));
  ipcMain.handle('media:import', async (_e, folder?: string | null) => {
    const result = await dialog.showOpenDialog(operatorWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Pictures, videos and audio', extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS] },
        { name: 'Pictures and videos', extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] },
        { name: 'Audio', extensions: AUDIO_EXTENSIONS }
      ]
    });
    return result.canceled ? loadMediaBin() : addToMediaBin(result.filePaths, folder);
  });
  ipcMain.handle('media:remove', (_e, id: string) => removeFromMediaBin(id));
  ipcMain.on('log:renderer', (_e, message: unknown) => log.error(`Operator window: ${String(message ?? '').slice(0, 600)}`));
  ipcMain.handle('app:last-run-unclean', () => lastRunUnclean);
  ipcMain.handle('app:report-problem', () => saveProblemReport(operatorWindow));
  ipcMain.handle('samples:install', () => installSamples());
  ipcMain.handle('vessel:export', (_e, req) => exportVesselFile(operatorWindow, req));
  ipcMain.handle('gallery:online', () => onlineGallery());
  ipcMain.handle('gallery:submit', (_e, entry) => submitToGallery(entry));
  ipcMain.handle('export:bundle', (_e, service) => exportPlaylistBundle(operatorWindow, service));
  ipcMain.handle('export:run', (_e, job) => exportDocument(operatorWindow, job, (w) => loadPage(w, 'print')));
  ipcMain.handle('vessel:open', (_e, path?: string) => openVesselFile(operatorWindow, typeof path === 'string' ? path : undefined));
  ipcMain.handle('vessel:add', (_e, choice) => addFromVesselFile(choice));
  ipcMain.handle('vessel:discard', (_e, token: string) => discardVesselFile(String(token)));
  ipcMain.handle('backup:create', () => backUp(operatorWindow));
  ipcMain.handle('backup:restore', () => restore(operatorWindow));
  ipcMain.handle('updates:check', () => checkForUpdates(operatorWindow, true));
  ipcMain.handle('media:missing', (_e, paths: unknown) => missingPaths(paths));
  ipcMain.handle('media:find-moved', async (_e, missing: unknown) => {
    const paths = missingPaths(missing);
    const result = await dialog.showOpenDialog(operatorWindow!, {
      title: 'Find missing media',
      message: `Choose a folder to look in for ${paths.length === 1 ? 'the missing file' : `${paths.length} missing files`}. Folders inside it are searched too.`,
      buttonLabel: 'Look here',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const found = await findMoved(result.filePaths[0], paths);
    return { folder: result.filePaths[0], found, items: await relinkMediaBin(found) };
  });

  ipcMain.handle('output:set', (_e, displayId: number | null) => setOutput(displayId));
  ipcMain.handle('stage-output:set', (_e, displayId: number | null) => setStageOutput(displayId));
  ipcMain.handle('stream-output:set', (_e, target: unknown) => chooseStreamOutput(normalizeStreamTarget(target)));
  ipcMain.handle('pco:status', () => pcoStatus());
  ipcMain.handle('pco:open-tokens', () => shell.openExternal('https://api.planningcenteronline.com/oauth/applications'));
  ipcMain.handle('pco:connect', (_e, appId: unknown, secret: unknown) => pcoConnect(appId, secret));
  ipcMain.handle('pco:disconnect', () => pcoDisconnect());
  ipcMain.handle('pco:service-types', () => pcoServiceTypes());
  ipcMain.handle('pco:plans', (_e, serviceType: unknown) => pcoPlans(serviceType));
  ipcMain.handle('pco:items', (_e, serviceType: unknown, plan: unknown) => pcoPlanItems(serviceType, plan));
  ipcMain.handle('ndi:status', () => (ndiSender ? (ndiStatus = ndiSender.status()) : ndiStatus));
  ipcMain.handle('ndi:open-site', () => shell.openExternal(NDI_SITE));

  ipcMain.on('stage:set', (_e, state: StageState) => {
    stageState = state;
    sendTo(stageWindow, 'stage:update', state);
    sendTo(operatorWindow, 'stage:update', state);
  });

  ipcMain.on('live:set', (_e, state: LiveState) => {
    const was = liveState.practice;
    liveState = state;
    // The operator sees everything; the audience screens get black in practice mode.
    const audience = audienceState(state);
    for (const win of [outputWindow, streamWindow, ndiSender?.window ?? null]) sendTo(win, 'live:update', audience);
    sendTo(operatorWindow, 'live:update', state);
    if (!!state.practice !== !!was) log.info(state.practice ? 'Practice mode on' : 'Practice mode off');
  });
}

/** True when the last run ended without quitting properly (set at start-up). */
let lastRunUnclean = false;

app.whenReady().then(async () => {
  if (!primaryInstance) return;
  lastRunUnclean = startRun();
  log.info(
    `Vessel ${app.getVersion()} started: ${process.platform} ${process.getSystemVersion()} ${process.arch}, Electron ${process.versions.electron}, ${screen.getAllDisplays().length} display(s)${
      lastRunUnclean ? '. The last run ended without quitting properly' : ''
    }`
  );
  app.on('render-process-gone', (_e, contents, details) => {
    if (details.reason === 'clean-exit') return;
    const url = contents.getURL().split('/').pop()?.split('#')[0] ?? '?';
    log.error(`A window's page stopped: ${url} (${details.reason}, exit code ${details.exitCode})`);
    // The operator window comes back on its own; the screens have their own repair (keepAlive).
    if (operatorWindow && contents === operatorWindow.webContents) {
      setTimeout(() => operatorWindow?.webContents.reload(), 300);
    }
  });
  app.on('child-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') log.error(`A helper process stopped: ${details.type}${details.name ? ` (${details.name})` : ''}, ${details.reason}, exit code ${details.exitCode}`);
  });
  screen.on('display-added', () => log.info(`A display was connected (${screen.getAllDisplays().length} now)`));
  screen.on('display-removed', () => log.info(`A display was disconnected (${screen.getAllDisplays().length} now)`));
  // While developing, the Dock would show Electron's icon; the installed app has its own.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon);
  // The app used to be called Lumen: bring its files across once, before anything reads settings.
  // Skipped when a test profile is in use.
  if (!process.env.VESSEL_USER_DATA) {
    try {
      migration = await migrateFromLumen({
        oldDocs: join(app.getPath('documents'), 'Lumen'),
        newDocs: join(app.getPath('documents'), 'Vessel'),
        oldUserData: join(app.getPath('appData'), 'Lumen'),
        newUserData: app.getPath('userData')
      });
    } catch (err) {
      console.error('Moving files from Lumen failed:', err);
    }
  }
  // A brand-new install (no settings yet) gets the samples, set up before the window opens.
  const freshInstall = !existsSync(join(app.getPath('userData'), 'settings.json'));
  handleMediaProtocol();
  registerIpc();
  setupRemote(() => operatorWindow);
  setupContextMenu();
  setupAppMenu(() => operatorWindow, appIcon, { get: () => streamTarget, set: (t) => void chooseStreamOutput(t) });
  void watchLibrary(notifyLibrary);
  if (freshInstall) {
    try {
      const samples = await installSamples();
      // The sample service opens on this first start.
      if (samples.playlist) await updateSettings({ lastPlaylist: samples.playlist });
    } catch (err) {
      log.error(`Setting up the samples failed: ${describe(err)}`);
    }
  }
  applyAppearance((await getSettings()).appearance);
  setGroupDefinitions((await getSettings()).groups);
  createOperatorWindow();
  // On Windows a double-clicked file arrives as an argument.
  if (process.platform !== 'darwin') openExternal(process.argv.slice(1));
  void clearOldVesselFiles();
  void checkForUpdatesOnLaunch(() => operatorWindow);
  void getSettings().then(applyNdi);
  app.on('before-quit', () => ndiSender?.stop());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOperatorWindow();
  });
});

app.on('will-quit', () => {
  log.info('Vessel quit');
  endRun();
  void shutdownRemote();
});

// Errors nothing else caught: written to the log, and Vessel carries on.
process.on('uncaughtException', (err) => log.error(`Uncaught: ${describe(err)}`));
process.on('unhandledRejection', (err) => log.error(`Unhandled: ${describe(err)}`));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
