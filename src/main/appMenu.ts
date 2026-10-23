// The menu bar (macOS top bar, Windows window menu), modelled on ProPresenter's.
// Most items send a command to the operator window, which runs it through the
// same code as the buttons and keys.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, type MenuItemConstructorOptions } from 'electron';
import type { AppCommand } from '../shared/shortcuts';
import { checkForUpdates } from './updates';
import { backUp, restore } from './backup';
import { saveProblemReport } from './problemReport';
import type { StreamTarget } from '../shared/stream';

export interface MenuState {
  mode: 'show' | 'edit';
  outputId: number | null;
  stageId: number | null;
  hasPresentation: boolean;
}

let state: MenuState = { mode: 'show', outputId: null, stageId: null, hasPresentation: false };
let operator: () => BrowserWindow | null = () => null;
let stream: { get: () => StreamTarget; set: (t: StreamTarget) => void } = { get: () => null, set: () => undefined };
let iconPath = '';

const ABOUT = 'Presentation software for worship.\n\nNDI® is a registered trademark of Vizrt NDI AB. NDI output uses the NDI Runtime from ndi.video.';

/** Windows has no standard About panel, so it gets a small window of its own. */
function showAbout(): void {
  if (process.platform === 'darwin') return app.showAboutPanel();
  const win = operator();
  const options = {
    type: 'none' as const,
    title: 'About Vessel',
    message: `Vessel ${app.getVersion()} (${process.arch})`,
    detail: `${ABOUT}\n\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined,
    buttons: ['OK']
  };
  void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options));
}

/** "&File" lets Windows users open a menu with Alt+F; a Mac doesn't use these. */
const mnemonic = (label: string): string => (process.platform === 'darwin' ? label.replace('&', '') : label);

const send = (command: AppCommand) => () => operator()?.webContents.send('app:command', command);

/**
 * Single keys (arrows, Esc, letters, '.') are handled by the operator window
 * itself, so these items only show the key; registering them would stop the
 * keys reaching text boxes.
 */
const shown = (accelerator: string): Partial<MenuItemConstructorOptions> => ({ accelerator, registerAccelerator: false });

/** The stream output: off, in a window for capture software, or full screen on a display the other outputs aren't using. */
function streamMenu(): MenuItemConstructorOptions[] {
  const current = stream.get();
  const primary = screen.getPrimaryDisplay().id;
  return [
    { label: 'Off', type: 'radio', checked: current === null, click: () => stream.set(null) },
    { label: 'In a Window (for OBS or vMix)', type: 'radio', checked: current === 'window', click: () => stream.set('window') },
    { type: 'separator' },
    ...screen.getAllDisplays().map(
      (d, i): MenuItemConstructorOptions => ({
        label: `${d.label || `Display ${i + 1}`} ${d.bounds.width}×${d.bounds.height}${d.id === primary ? ' (main)' : ''}`,
        type: 'radio',
        checked: current === d.id,
        enabled: d.id !== state.outputId && d.id !== state.stageId,
        click: () => stream.set(d.id)
      })
    ),
    { type: 'separator' },
    { label: 'How It Looks…', click: send('stream-look') }
  ];
}

function screensMenu(kind: 'output' | 'stage'): MenuItemConstructorOptions[] {
  const current = kind === 'output' ? state.outputId : state.stageId;
  const other = kind === 'output' ? state.stageId : state.outputId;
  const primary = screen.getPrimaryDisplay().id;
  return [
    { label: 'Off', type: 'radio', checked: current === null, click: send(`${kind}:off`) },
    { type: 'separator' },
    ...screen.getAllDisplays().map(
      (d, i): MenuItemConstructorOptions => ({
        label: `${d.label || `Display ${i + 1}`} ${d.bounds.width}×${d.bounds.height}${d.id === primary ? ' (main)' : ''}`,
        type: 'radio',
        checked: current === d.id,
        // One display can't show both outputs.
        enabled: other !== d.id,
        click: send(`${kind}:${d.id}`)
      })
    )
  ];
}

const checkUpdates = (): void => void checkForUpdates(operator(), true);

export function rebuildAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const editing = state.mode === 'edit';
  const template: MenuItemConstructorOptions[] = [
    // The Mac's app menu, with Settings… where Mac apps keep it.
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { label: 'Check for Updates…', click: checkUpdates },
              { type: 'separator' as const },
              { label: 'Settings…', accelerator: 'Cmd+,', click: send('preferences') },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: mnemonic('&File'),
      submenu: [
        { label: 'New Song…', accelerator: 'CmdOrCtrl+N', click: send('new-song') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { label: 'Open Playlist…', click: send('open-playlist') },
        { type: 'separator' },
        { label: 'Import…', accelerator: 'CmdOrCtrl+I', click: send('import-documents') },
        { label: 'Import Media…', click: send('import-media') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', enabled: state.hasPresentation, click: send('save') },
        { type: 'separator' },
        { label: 'Back Up…', click: () => void backUp(operator()) },
        { label: 'Restore from Backup…', click: () => void restore(operator()) },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: mnemonic('&Edit'),
      submenu: [
        // Undo/Redo act on the text box you're typing in, or else on the presentation.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'Redo', accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y', click: send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: mnemonic('&View'),
      submenu: [
        { label: 'Find Anything…', accelerator: 'CmdOrCtrl+K', click: send('palette') },
        { type: 'separator' },
        { label: 'Show', type: 'radio', checked: !editing, accelerator: 'CmdOrCtrl+1', click: send('mode-show') },
        { label: 'Edit', type: 'radio', checked: editing, accelerator: 'CmdOrCtrl+2', enabled: state.hasPresentation, click: send('mode-edit') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }])
      ]
    },
    {
      label: mnemonic('&Presentation'),
      submenu: [
        { label: 'Next Slide', ...shown('Right'), click: send('next') },
        { label: 'Previous Slide', ...shown('Left'), click: send('prev') },
        { type: 'separator' },
        { label: 'Clear Text', ...shown('Escape'), click: send('clear') },
        { label: 'Clear Media', click: send('clear-media') },
        { label: 'Clear All', ...shown('Shift+Escape'), click: send('clear-all') },
        { label: 'Black Screen', ...shown('.'), click: send('black') },
        { label: 'Logo', ...shown('L'), click: send('logo') }
      ]
    },
    {
      label: mnemonic('&Screens'),
      submenu: [
        { label: 'Audience Output', submenu: screensMenu('output') },
        { label: 'Stage Display', submenu: screensMenu('stage') },
        { label: 'Stream Output', submenu: streamMenu() }
      ]
    },
    {
      label: mnemonic('&Tools'),
      submenu: [
        { label: 'Bible…', accelerator: 'CmdOrCtrl+B', click: send('bible') },
        { label: 'Themes…', click: send('themes') },
        { label: 'CCLI (copyright and reporting)…', click: send('ccli') },
        { label: 'Planning Center…', click: send('planning-center') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { label: 'Preferences…', accelerator: 'Ctrl+,', click: send('preferences') }]),
        { label: 'Remote Control…', click: send('remote') }
      ]
    },
    // The Mac's standard Window menu (Minimize, Zoom, Bring All to Front).
    ...(isMac ? [{ role: 'windowMenu' as const }] : []),
    {
      role: 'help',
      label: mnemonic('&Help'),
      submenu: [
        { label: 'Welcome to Vessel…', click: send('welcome') },
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: send('shortcuts') },
        { type: 'separator' },
        { label: 'Report a Problem…', click: () => void saveProblemReport(operator()) },
        ...(isMac ? [] : [{ type: 'separator' as const }, { label: 'Check for Updates…', click: checkUpdates }, { label: 'About Vessel', click: showAbout }])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function setupAppMenu(getOperator: () => BrowserWindow | null, icon: string, streamOutput: typeof stream): void {
  operator = getOperator;
  stream = streamOutput;
  iconPath = icon;
  // The version shows which build is running (arm64 or x64), e.g. "0.1.0 (arm64)".
  app.setAboutPanelOptions({ applicationName: 'Vessel', applicationVersion: app.getVersion(), version: process.arch, credits: ABOUT, iconPath: icon });
  ipcMain.on('menu:state', (_e, next: MenuState) => {
    state = next;
    rebuildAppMenu();
  });
  screen.on('display-added', rebuildAppMenu);
  screen.on('display-removed', rebuildAppMenu);
  rebuildAppMenu();
}
