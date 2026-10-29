// Electron glue for the remote control: settings, network addresses, and
// passing commands and state between the server and the operator window.
import { ipcMain, type BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import { hostname, networkInterfaces } from 'node:os';
import type { ExportJob } from '../shared/exports';
import type { PresenterState, RemoteRole, RemoteState, RemoteStatus } from '../shared/remote';
import { slidePictures } from './exports';
import { describe, log } from './log';
import { PRESENTER_ASSETS } from './presenterPage';
import { REMOTE_ASSETS } from './remotePage';
import { newPin, RemoteServer } from './remoteServer';
import { getSettings, updateSettings } from './settings';

const DEFAULT_PORT = 4040;

let server: RemoteServer | null = null;
let lastError: string | undefined;
let operator: () => BrowserWindow | null = () => null;
let loadPrint: (w: BrowserWindow) => void = () => undefined;

// ---- The presenter view: its state, and pictures of its slides

let presenter: PresenterState | null = null;
/** The slides to draw for the presenter view, and the key their pictures are kept under. */
let pictureJob: { key: string; job: ExportJob } | null = null;
/** Pictures by key, newest last; a few are kept so going back to a song needn't draw it again. */
const pictures = new Map<string, Buffer[]>();
let drawing: string | null = null;

function pushPresenter(): void {
  if (!server || !presenter) return;
  const ready = pictureJob && pictures.get(pictureJob.key);
  server.setPresenterState({ ...presenter, ...(ready ? { pictures: { key: pictureJob!.key, count: ready.length } } : {}) });
}

/** Draw the current slides' pictures, if a presenter is watching and they aren't drawn yet. */
async function drawPictures(): Promise<void> {
  const want = pictureJob;
  if (!want || !server?.presenterCount || pictures.has(want.key) || drawing) return;
  drawing = want.key;
  try {
    const drawn = await slidePictures(want.job, loadPrint);
    pictures.set(want.key, drawn);
    while (pictures.size > 4) pictures.delete(pictures.keys().next().value!);
  } catch (err) {
    log.warn(`Drawing the presenter's slides failed: ${describe(err)}`);
  } finally {
    drawing = null;
  }
  pushPresenter();
  // The slides may have changed while drawing.
  if (pictureJob && pictureJob.key !== want.key) void drawPictures();
}

/** Addresses a phone on the same network can open. */
function urls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  const host = hostname();
  if (host.endsWith('.local')) out.push(`http://${host}:${port}`);
  return out;
}

async function status(): Promise<RemoteStatus> {
  const s = await getSettings();
  const port = server?.port ?? null;
  return {
    enabled: !!server,
    pin: s.remotePin ?? '',
    presenterPin: s.remotePresenterPin ?? '',
    port,
    urls: port ? urls(port) : [],
    clients: server?.clientCount ?? 0,
    presenters: server?.presenterCount ?? 0,
    error: lastError
  };
}

async function pushStatus(): Promise<void> {
  operator()?.webContents.send('remote:status', await status());
}

async function start(): Promise<void> {
  if (server) return;
  const s = await getSettings();
  const pin = s.remotePin || newPin();
  let presenterPin = s.remotePresenterPin || newPin();
  while (presenterPin === pin) presenterPin = newPin();
  if (pin !== s.remotePin || presenterPin !== s.remotePresenterPin) await updateSettings({ remotePin: pin, remotePresenterPin: presenterPin });
  const next = new RemoteServer({
    assets: REMOTE_ASSETS,
    presenterAssets: PRESENTER_ASSETS,
    // Read each time, so a new presenter PIN works without restarting.
    pin: () => pin,
    presenterPin: () => presenterPinNow,
    onCommand: (command, role: RemoteRole) => operator()?.webContents.send('remote:command', command, role),
    onClientsChanged: () => {
      void pushStatus();
      void drawPictures();
    },
    picture: (key, index) => pictures.get(key)?.[index] ?? null
  });
  presenterPinNow = presenterPin;
  try {
    await next.start(s.remotePort ?? DEFAULT_PORT);
    server = next;
    lastError = undefined;
    // Phones want the current picture straight away.
    operator()?.webContents.send('remote:request-state');
  } catch (err) {
    lastError = (err as Error).message;
  }
}

let presenterPinNow = '';

async function stop(): Promise<void> {
  const current = server;
  server = null;
  await current?.stop();
}

export function setupRemote(getOperator: () => BrowserWindow | null, loadPrintPage: (w: BrowserWindow) => void): void {
  operator = getOperator;
  loadPrint = loadPrintPage;

  ipcMain.handle('remote:status', () => status());
  ipcMain.handle('remote:set-enabled', async (_e, enabled: boolean) => {
    if (enabled) await start();
    else await stop();
    await updateSettings({ remoteEnabled: enabled && !!server });
    return status();
  });
  ipcMain.handle('remote:new-pin', async () => {
    const pin = newPin();
    await updateSettings({ remotePin: pin });
    // Restart so the server checks the new PIN and every phone has to sign in again.
    if (server) {
      await stop();
      await start();
    }
    return status();
  });
  ipcMain.handle('remote:new-presenter-pin', async () => {
    const s = await getSettings();
    let pin = newPin();
    while (pin === s.remotePin) pin = newPin();
    await updateSettings({ remotePresenterPin: pin });
    presenterPinNow = pin;
    // Only the presenters have to sign in again.
    server?.signOutRole('presenter');
    return status();
  });
  ipcMain.on('remote:state', (_e, state: RemoteState) => server?.setState(state));
  ipcMain.on('remote:presenter-state', (_e, state: PresenterState) => {
    presenter = state;
    pushPresenter();
  });
  ipcMain.on('remote:presenter-slides', (_e, job: ExportJob | null) => {
    pictureJob = job ? { key: createHash('sha1').update(JSON.stringify(job)).digest('hex').slice(0, 20), job } : null;
    pushPresenter();
    void drawPictures();
  });

  void getSettings().then((s) => (s.remoteEnabled ? start().then(pushStatus) : undefined));
}

export async function shutdownRemote(): Promise<void> {
  await stop();
}
