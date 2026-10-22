// Planning Center Services over the network. The church connects with a
// Personal Access Token (an application ID and secret it makes in Planning
// Center); the secret is kept encrypted by the computer's own keychain
// (Electron safeStorage), never sent to the operator window, and left out of backups.
import { app, net, safeStorage } from 'electron';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePlanItems, parsePlans, parseServiceTypes, type PcoItem, type PcoPlan, type PcoServiceType } from '../shared/planningCenter';

/** Where the API is; a test can point this at a local server. */
const API = process.env.VESSEL_PCO_API ?? 'https://api.planningcenteronline.com';
const file = (): string => join(app.getPath('userData'), 'planning-center.json');

interface Stored {
  appId: string;
  /** The secret, encrypted with safeStorage (base64). */
  secret: string;
  organization: string;
}

let cached: { appId: string; secret: string; organization: string } | null | undefined;

async function credentials(): Promise<{ appId: string; secret: string; organization: string } | null> {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const stored = JSON.parse(await readFile(file(), 'utf8')) as Stored;
    if (stored.appId && stored.secret && safeStorage.isEncryptionAvailable()) {
      cached = { appId: stored.appId, secret: safeStorage.decryptString(Buffer.from(stored.secret, 'base64')), organization: stored.organization ?? '' };
    }
  } catch {
    // Not connected.
  }
  return cached;
}

/** One read from the Planning Center API with the church's token (`doFetch` lets tests use a local server). */
export async function pcoGet(path: string, creds: { appId: string; secret: string }, base = API, doFetch: typeof fetch = (u, o) => net.fetch(String(u), o)): Promise<unknown> {
  const res = await doFetch(`${base}${path}`, {
    headers: { authorization: `Basic ${Buffer.from(`${creds.appId}:${creds.secret}`).toString('base64')}`, accept: 'application/json', 'user-agent': 'Vessel' },
    signal: AbortSignal.timeout(20_000)
  });
  if (res.status === 401) throw new Error('Planning Center didn’t accept the application ID and secret');
  if (res.status === 429) throw new Error('Planning Center is busy; try again in a few seconds');
  if (!res.ok) throw new Error(`Planning Center answered ${res.status}`);
  return res.json();
}

async function connected(): Promise<{ appId: string; secret: string }> {
  const creds = await credentials();
  if (!creds) throw new Error('Not connected to Planning Center');
  return creds;
}

export interface PcoStatus {
  connected: boolean;
  organization: string;
  /** False when this computer can't keep the secret safely (it won't be saved). */
  canStore: boolean;
}

export async function pcoStatus(): Promise<PcoStatus> {
  const creds = await credentials();
  return { connected: !!creds, organization: creds?.organization ?? '', canStore: safeStorage.isEncryptionAvailable() };
}

/** Check the token with Planning Center, then keep it (encrypted). */
export async function pcoConnect(appId: unknown, secret: unknown): Promise<PcoStatus> {
  const id = String(appId ?? '').trim();
  const key = String(secret ?? '').trim();
  if (!id || !key) throw new Error('Enter both the application ID and the secret');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This computer can’t store the secret safely, so Vessel won’t keep it');
  const org = (await pcoGet('/services/v2', { appId: id, secret: key })) as { data?: { attributes?: { name?: string } } };
  const organization = org?.data?.attributes?.name ?? '';
  const stored: Stored = { appId: id, secret: safeStorage.encryptString(key).toString('base64'), organization };
  await writeFile(file(), JSON.stringify(stored), { mode: 0o600 });
  cached = { appId: id, secret: key, organization };
  return pcoStatus();
}

export async function pcoDisconnect(): Promise<PcoStatus> {
  cached = null;
  if (existsSync(file())) await rm(file(), { force: true });
  return pcoStatus();
}

const id = (v: unknown): string => {
  const s = String(v ?? '');
  if (!/^\d{1,20}$/.test(s)) throw new Error('Not a Planning Center id');
  return s;
};

export async function pcoServiceTypes(): Promise<PcoServiceType[]> {
  return parseServiceTypes(await pcoGet('/services/v2/service_types?order=sequence&per_page=100', await connected()));
}

/** Upcoming plans, soonest first. */
export async function pcoPlans(serviceType: unknown): Promise<PcoPlan[]> {
  return parsePlans(await pcoGet(`/services/v2/service_types/${id(serviceType)}/plans?filter=future&order=sort_date&per_page=15`, await connected()));
}

export async function pcoPlanItems(serviceType: unknown, plan: unknown): Promise<PcoItem[]> {
  return parsePlanItems(await pcoGet(`/services/v2/service_types/${id(serviceType)}/plans/${id(plan)}/items?include=song,arrangement&per_page=100`, await connected()));
}
