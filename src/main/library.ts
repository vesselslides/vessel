// The library: every .pro in the library folders, kept current with a watcher.
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parsePresentation, slideTextOfCue } from '../shared/pro/presentation';
import type { LibraryItem, PlaylistFileInfo } from '../shared/types';
import { getSettings } from './settings';

const cache = new Map<string, { modified: number; size: number; item: LibraryItem }>();

async function filesIn(folder: string, ext: string, depth = 2): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(folder, e.name);
    if (e.isDirectory() && depth > 0) out.push(...(await filesIn(full, ext, depth - 1)));
    else if (e.isFile() && extname(e.name).toLowerCase() === ext) out.push(full);
  }
  return out;
}

async function describe(path: string): Promise<LibraryItem | null> {
  const info = await stat(path);
  const hit = cache.get(path);
  if (hit && hit.modified === info.mtimeMs && hit.size === info.size) return hit.item;
  try {
    const p = parsePresentation(new Uint8Array(await readFile(path)));
    const name = p.name || basename(path, extname(path));
    const lyrics = p.cues.map(slideTextOfCue).join('\n');
    const item: LibraryItem = { path, name, modified: info.mtimeMs, slides: p.cues.length, search: `${name}\n${lyrics}`.toLowerCase() };
    cache.set(path, { modified: info.mtimeMs, size: info.size, item });
    return item;
  } catch {
    return null; // not a readable presentation; leave it out
  }
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const s = await getSettings();
  const folders = [s.libraryFolder, ...s.extraFolders];
  const paths = [...new Set((await Promise.all(folders.map((f) => filesIn(f, '.pro')))).flat())];
  const items = (await Promise.all(paths.map(describe))).filter((i): i is LibraryItem => !!i);
  return items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

const safeName = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'Untitled';

/** A path in `folder` for `name` + `ext` that doesn't exist yet ("Song", "Song 2", ...). */
export function uniquePath(folder: string, name: string, ext: string, except?: string): string {
  const base = safeName(name);
  for (let n = 1; ; n++) {
    const candidate = join(folder, `${n === 1 ? base : `${base} ${n}`}${ext}`);
    if (candidate === except || !existsSync(candidate)) return candidate;
  }
}

export async function saveToLibrary(bytes: Uint8Array, name: string): Promise<string> {
  const path = uniquePath((await getSettings()).libraryFolder, name, '.pro');
  await writeFile(path, bytes);
  return path;
}

export async function listPlaylists(): Promise<PlaylistFileInfo[]> {
  const folder = (await getSettings()).playlistFolder;
  const files = await filesIn(folder, '.proplaylist', 0);
  const infos = await Promise.all(files.map(async (path) => ({ path, name: basename(path, extname(path)), modified: (await stat(path)).mtimeMs })));
  return infos.sort((a, b) => b.modified - a.modified);
}

const inside = (path: string, folder: string): boolean => path.startsWith(folder + '/') || path.startsWith(folder + '\\');

/** Songs that may be moved to the Trash through IPC: .pro files inside a library folder. */
export async function insideLibrary(path: string): Promise<boolean> {
  const s = await getSettings();
  return extname(path).toLowerCase() === '.pro' && [s.libraryFolder, ...s.extraFolders].some((f) => inside(path, f));
}

/** Only files inside the playlist folder may be written, renamed or trashed through IPC. */
export async function insidePlaylistFolder(path: string): Promise<boolean> {
  const folder = (await getSettings()).playlistFolder;
  return path.startsWith(folder + '/') || path.startsWith(folder + '\\');
}

export async function writePlaylist(bytes: Uint8Array, name: string, path?: string): Promise<string> {
  const folder = (await getSettings()).playlistFolder;
  const target = path && (await insidePlaylistFolder(path)) ? path : uniquePath(folder, name, '.proPlaylist');
  await writeFile(target, bytes);
  return target;
}

export async function renamePlaylist(path: string, name: string): Promise<string> {
  if (!(await insidePlaylistFolder(path))) throw new Error('Not a Vessel playlist');
  const target = uniquePath((await getSettings()).playlistFolder, name, '.proPlaylist', path);
  if (target !== path) await rename(path, target);
  return target;
}

let watchers: FSWatcher[] = [];
let timer: NodeJS.Timeout | undefined;

/** Call `onChange` (debounced) whenever a library or playlist folder changes. */
export async function watchLibrary(onChange: () => void): Promise<void> {
  for (const w of watchers) w.close();
  const s = await getSettings();
  watchers = [s.libraryFolder, ...s.extraFolders, s.playlistFolder].flatMap((folder) => {
    try {
      return [
        watch(folder, { recursive: true }, () => {
          clearTimeout(timer);
          timer = setTimeout(onChange, 400);
        })
      ];
    } catch {
      return [];
    }
  });
}
