import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Settings } from '../shared/types';

const file = (): string => join(app.getPath('userData'), 'settings.json');

function defaults(): Settings {
  const base = join(app.getPath('documents'), 'Vessel');
  return { libraryFolder: join(base, 'Library'), extraFolders: [], playlistFolder: join(base, 'Playlists') };
}

let cached: Settings | null = null;

/** Settings, with the library and playlist folders created on first use. */
export async function getSettings(): Promise<Settings> {
  if (!cached) {
    let saved: Partial<Settings> = {};
    try {
      saved = JSON.parse(await readFile(file(), 'utf8')) as Partial<Settings>;
    } catch {
      // First run, or an unreadable file: start from the defaults.
    }
    cached = { ...defaults(), ...saved, extraFolders: Array.isArray(saved.extraFolders) ? saved.extraFolders : [] };
    await mkdir(cached.libraryFolder, { recursive: true });
    await mkdir(cached.playlistFolder, { recursive: true });
  }
  return cached;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  cached = { ...(await getSettings()), ...patch };
  await writeFile(file(), JSON.stringify(cached, null, 2));
  return cached;
}
