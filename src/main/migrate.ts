// One-time move from the app's old name, Lumen, to Vessel: the Documents
// folder (songs, playlists, imported media) and the app's settings files.
// Safe to run on every launch; it only acts when there is something to move.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { decodeService, encodeService } from '../shared/pro/service';
import { parsePresentation, serializePresentation } from '../shared/pro/presentation';
import { pathToUrl, urlToPath } from '../shared/pro/url';

export interface MigrationPaths {
  oldDocs: string;
  newDocs: string;
  oldUserData: string;
  newUserData: string;
}

export interface MigrationReport {
  movedDocuments: boolean;
  copiedSettings: string[];
  updatedPlaylists: number;
  updatedSongs: number;
}

const SETTINGS_FILES = ['settings.json', 'themes.json', 'media-bin.json'];

async function filesUnder(folder: string, ext: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(folder, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(full, ext)));
    else if (extname(e.name).toLowerCase() === ext) out.push(full);
  }
  return out;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function migrateFromLumen(p: MigrationPaths): Promise<MigrationReport> {
  const report: MigrationReport = { movedDocuments: false, copiedSettings: [], updatedPlaylists: 0, updatedSongs: 0 };

  // Settings, themes and media bin: copy (the old copies stay as a backup).
  for (const name of SETTINGS_FILES) {
    const from = join(p.oldUserData, name);
    const to = join(p.newUserData, name);
    if (existsSync(from) && !existsSync(to)) {
      await mkdir(p.newUserData, { recursive: true });
      await copyFile(from, to);
      report.copiedSettings.push(name);
    }
  }

  // Documents/Lumen → Documents/Vessel, unless Vessel already has its own folder.
  if (!existsSync(p.oldDocs) || existsSync(p.newDocs)) return report;
  await rename(p.oldDocs, p.newDocs);
  report.movedDocuments = true;

  /** Point a path inside the old folder at the same file in the new one. */
  const moved = (path: string): string => {
    for (const sep of ['/', '\\']) if (path === p.oldDocs || path.startsWith(p.oldDocs + sep)) return p.newDocs + path.slice(p.oldDocs.length);
    return path;
  };

  const settingsFile = join(p.newUserData, 'settings.json');
  const settings = await readJson<Record<string, unknown>>(settingsFile);
  if (settings) {
    for (const key of ['libraryFolder', 'playlistFolder', 'lastPlaylist']) if (typeof settings[key] === 'string') settings[key] = moved(settings[key] as string);
    if (Array.isArray(settings.extraFolders)) settings.extraFolders = (settings.extraFolders as string[]).map(moved);
    await writeFile(settingsFile, JSON.stringify(settings, null, 2));
  }

  const binFile = join(p.newUserData, 'media-bin.json');
  const bin = await readJson<Array<{ path: string }>>(binFile);
  if (Array.isArray(bin)) await writeFile(binFile, JSON.stringify(bin.map((item) => ({ ...item, path: moved(item.path) })), null, 2));

  // Playlists list songs by path.
  for (const file of await filesUnder(p.newDocs, '.proplaylist')) {
    try {
      const service = decodeService(new Uint8Array(await readFile(file)), '');
      let changed = false;
      const items = service.items.map((item) => {
        if (item.kind !== 'presentation' || moved(item.path) === item.path) return item;
        changed = true;
        return { ...item, path: moved(item.path) };
      });
      if (changed) {
        await writeFile(file, encodeService({ ...service, items }));
        report.updatedPlaylists++;
      }
    } catch {
      // Not a playlist we can read; leave it untouched.
    }
  }

  // Songs can point at backgrounds unpacked into Imported Media.
  for (const file of await filesUnder(p.newDocs, '.pro')) {
    try {
      const presentation = parsePresentation(new Uint8Array(await readFile(file)));
      let changed = false;
      for (const cue of presentation.cues) {
        for (const action of cue.actions) {
          if (action.ActionTypeData.case !== 'media') continue;
          const props = action.ActionTypeData.value.element?.TypeProperties;
          if (!props || (props.case !== 'image' && props.case !== 'video') || !props.value.file) continue;
          const path = urlToPath(props.value.file.localUrl);
          if (path && moved(path) !== path) {
            props.value.file.localUrl = pathToUrl(moved(path));
            changed = true;
          }
        }
      }
      if (changed) {
        await writeFile(file, serializePresentation(presentation));
        report.updatedSongs++;
      }
    } catch {
      // Not a presentation we can read; leave it untouched.
    }
  }

  return report;
}
