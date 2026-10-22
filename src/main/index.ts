import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import { AUDIO_EXTENSIONS, binKindOf, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../shared/media';
import { INITIAL_LIVE, INITIAL_STAGE, type DisplayInfo, type LiveState, type OpenedFile, type Settings, type StageState } from '../shared/types';
import { importLegacyFile } from './legacy';
import { importDocumentFile } from './importDocs';
import { openDropped } from './dropped';
import { clearUsage, logUsage, saveReport, usageLog } from './ccliLog';
import { setGroupDefinitions } from '../shared/groups';
import { addBible, downloadFreeBible, listBibles, loadBible, removeBible } from './bibles';
import { DEFAULT_IMPORT_OPTIONS, DOCUMENT_EXTENSIONS, isDocumentPath, UNSUPPORTED_DOCUMENTS, type ImportOptions } from '../shared/import';
import { loadThemes, saveThemes } from './themes';
import { insideLibrary, listLibrary, listPlaylists, insidePlaylistFolder, renamePlaylist, saveToLibrary, watchLibrary, writePlaylist } from './library';
import { getSettings, updateSettings } from './settings';
import { migrateFromLumen, type MigrationReport } from './migrate';
import { setupRemote, shutdownRemote } from './remote';
import { setupContextMenu } from './contextMenu';
import { setupAppMenu } from './appMenu';
import appIcon from '../../build/icon.png?asset';
import type { ThemeLibrary } from '../shared/theme';
import { addToMediaBin, createMediaFolder, deleteMediaFolder, handleMediaProtocol, loadMediaBin, loadMediaFolders, moveMedia, registerMediaScheme, removeFromMediaBin, renameMediaFolder, setMediaMuted } from './media';

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
registerMediaScheme();

// One Vessel at a time: two copies would fight over the same library, settings and screens.
// Opening it again brings the running one forward instead.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (!operatorWindow) return;
  if (operatorWindow.isMinimized()) operatorWindow.restore();
  operatorWindow.focus();
});

const preload = join(__dirname, '../preload/index.js');

function loadPage(win: BrowserWindow, page: 'index' | 'output' | 'stage'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`));
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
  });
}

/** A borderless window covering one display, used for the audience and stage outputs. */
function createScreenWindow(displayId: number, page: 'output' | 'stage', initial: () => [string, unknown]): BrowserWindow | null {
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
  loadPage(win, page);
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('did-finish-load', () => win.webContents.send(...initial()));
  return win;
}

function setOutput(displayId: number | null): void {
  outputWindow?.close();
  outputWindow = displayId === null ? null : createScreenWindow(displayId, 'output', () => ['live:update', liveState]);
  outputWindow?.on('closed', () => {
    outputWindow = null;
  });
}

function setStageOutput(displayId: number | null): void {
  stageWindow?.close();
  stageWindow = displayId === null ? null : createScreenWindow(displayId, 'stage', () => ['stage:update', stageState]);
  stageWindow?.on('closed', () => {
    stageWindow = null;
  });
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
  ipcMain.handle('files:open', async (_e, kind: 'presentation' | 'playlist') => {
    const result = await dialog.showOpenDialog(operatorWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters:
        kind === 'presentation'
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
          if (kind === 'presentation' && isDocumentPath(path)) return await importDocumentFile(path, DEFAULT_IMPORT_OPTIONS);
          return /\.pro[56]x?$/i.test(path) ? await importLegacyFile(path) : await readOpened(path);
        } catch (err) {
          return { path, bytes: new Uint8Array(), error: (err as Error).message };
        }
      })
    );
  });

  ipcMain.handle('files:import', async (_e, opts: ImportOptions) => {
    const result = await dialog.showOpenDialog(operatorWindow!, {
      title: 'Import PowerPoint, Word or text files',
      properties: ['openFile', 'multiSelections'],
      filters: [
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

  ipcMain.handle('output:set', (_e, displayId: number | null) => setOutput(displayId));
  ipcMain.handle('stage-output:set', (_e, displayId: number | null) => setStageOutput(displayId));

  ipcMain.on('stage:set', (_e, state: StageState) => {
    stageState = state;
    stageWindow?.webContents.send('stage:update', state);
    operatorWindow?.webContents.send('stage:update', state);
  });

  ipcMain.on('live:set', (_e, state: LiveState) => {
    liveState = state;
    outputWindow?.webContents.send('live:update', state);
    operatorWindow?.webContents.send('live:update', state);
  });
}

app.whenReady().then(async () => {
  if (!primaryInstance) return;
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
  handleMediaProtocol();
  registerIpc();
  setupRemote(() => operatorWindow);
  setupContextMenu();
  setupAppMenu(() => operatorWindow, appIcon);
  void watchLibrary(notifyLibrary);
  applyAppearance((await getSettings()).appearance);
  setGroupDefinitions((await getSettings()).groups);
  createOperatorWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOperatorWindow();
  });
});

app.on('will-quit', () => void shutdownRemote());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
