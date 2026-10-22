// Electron glue for the remote control: settings, network addresses, and
// passing commands and state between the server and the operator window.
import { ipcMain, type BrowserWindow } from 'electron';
import { hostname, networkInterfaces } from 'node:os';
import type { RemoteState, RemoteStatus } from '../shared/remote';
import { REMOTE_ASSETS } from './remotePage';
import { newPin, RemoteServer } from './remoteServer';
import { getSettings, updateSettings } from './settings';

const DEFAULT_PORT = 4040;

let server: RemoteServer | null = null;
let lastError: string | undefined;
let operator: () => BrowserWindow | null = () => null;

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
  return { enabled: !!server, pin: s.remotePin ?? '', port, urls: port ? urls(port) : [], clients: server?.clientCount ?? 0, error: lastError };
}

async function pushStatus(): Promise<void> {
  operator()?.webContents.send('remote:status', await status());
}

async function start(): Promise<void> {
  if (server) return;
  const s = await getSettings();
  const pin = s.remotePin || newPin();
  if (!s.remotePin) await updateSettings({ remotePin: pin });
  const next = new RemoteServer({
    assets: REMOTE_ASSETS,
    pin: () => pin,
    onCommand: (command) => operator()?.webContents.send('remote:command', command),
    onClientsChanged: () => void pushStatus()
  });
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

async function stop(): Promise<void> {
  const current = server;
  server = null;
  await current?.stop();
}

export function setupRemote(getOperator: () => BrowserWindow | null): void {
  operator = getOperator;

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
  ipcMain.on('remote:state', (_e, state: RemoteState) => server?.setState(state));

  void getSettings().then((s) => (s.remoteEnabled ? start().then(pushStatus) : undefined));
}

export async function shutdownRemote(): Promise<void> {
  await stop();
}
