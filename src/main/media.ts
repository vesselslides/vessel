import { app, protocol } from 'electron';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, sep } from 'node:path';
import { getSettings } from './settings';
import { Readable } from 'node:stream';
import { binKindOf, mediaName } from '../shared/media';
import type { MediaFolder, MediaItem } from '../shared/types';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  avif: 'image/avif', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogv: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', aif: 'audio/aiff', aiff: 'audio/aiff'
};

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'vessel-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
  ]);
}

/**
 * Serve local image and video files to the renderers, with HTTP range support
 * so video can seek and loop. Only media file types are served.
 */
export function handleMediaProtocol(): void {
  protocol.handle('vessel-media', async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''));
    if (!binKindOf(path) || !existsSync(path)) return new Response('Not found', { status: 404 });
    const { size } = await stat(path);
    const type = MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
    if (!range) {
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
      return new Response(body, { headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } });
    }
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        'content-type': type,
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes'
      }
    });
  });
}

const binFile = (): string => join(app.getPath('userData'), 'media-bin.json');

export async function loadMediaBin(): Promise<MediaItem[]> {
  try {
    const items = JSON.parse(await readFile(binFile(), 'utf8')) as MediaItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function saveMediaBin(items: MediaItem[]): Promise<void> {
  await writeFile(binFile(), JSON.stringify(items, null, 2));
}

/**
 * With Preferences ▸ Media ▸ Copy media on, an imported file is copied into
 * Documents/Vessel/Media first, so songs keep their media when the original
 * moves. Files already inside Documents/Vessel are used where they are.
 */
async function keepCopy(path: string): Promise<string> {
  if (!(await getSettings()).copyMedia) return path;
  const vessel = join(app.getPath('documents'), 'Vessel');
  if (path.startsWith(vessel + sep)) return path;
  const dir = join(vessel, 'Media');
  await mkdir(dir, { recursive: true });
  const ext = extname(path);
  const base = basename(path, ext);
  let target = join(dir, basename(path));
  for (let n = 2; existsSync(target); n++) {
    // The same file copied before is reused rather than copied again.
    if ((await stat(target)).size === (await stat(path)).size) return target;
    target = join(dir, `${base} ${n}${ext}`);
  }
  await copyFile(path, target);
  return target;
}

/** Add files to the bin, into `folder` when given (media already there moves into it). */
export async function addToMediaBin(paths: string[], folder?: string | null): Promise<MediaItem[]> {
  const items = await loadMediaBin();
  const folders = await loadMediaFolders();
  const into = folder && folders.some((f) => f.id === folder) ? folder : undefined;
  for (const original of paths) {
    const path = binKindOf(original) ? await keepCopy(original) : original;
    const kind = binKindOf(path);
    if (!kind) continue;
    const existing = items.find((i) => i.path === path);
    if (existing) {
      if (into) existing.folder = into;
      continue;
    }
    items.push({ id: crypto.randomUUID(), path, name: mediaName(path), kind, ...(into ? { folder: into } : {}) });
  }
  await saveMediaBin(items);
  return items;
}

// ---- Media folders (in the bin only; files stay where they are on disk) -------

const foldersFile = (): string => join(app.getPath('userData'), 'media-folders.json');

export async function loadMediaFolders(): Promise<MediaFolder[]> {
  try {
    const folders = JSON.parse(await readFile(foldersFile(), 'utf8')) as MediaFolder[];
    return Array.isArray(folders) ? folders.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string') : [];
  } catch {
    return [];
  }
}

const saveMediaFolders = (folders: MediaFolder[]): Promise<void> => writeFile(foldersFile(), JSON.stringify(folders, null, 2));
const tidyName = (name: unknown): string => String(name ?? '').trim().slice(0, 80);

export async function createMediaFolder(name: unknown): Promise<MediaFolder[]> {
  const folders = await loadMediaFolders();
  const clean = tidyName(name);
  if (clean) folders.push({ id: crypto.randomUUID(), name: clean });
  await saveMediaFolders(folders);
  return folders;
}

export async function renameMediaFolder(id: string, name: unknown): Promise<MediaFolder[]> {
  const folders = await loadMediaFolders();
  const clean = tidyName(name);
  const folder = folders.find((f) => f.id === id);
  if (folder && clean) folder.name = clean;
  await saveMediaFolders(folders);
  return folders;
}

/** Delete a folder; its media goes back to being unfiled (nothing is deleted from disk). */
export async function deleteMediaFolder(id: string): Promise<{ folders: MediaFolder[]; items: MediaItem[] }> {
  const folders = (await loadMediaFolders()).filter((f) => f.id !== id);
  const items = (await loadMediaBin()).map((i) => (i.folder === id ? { ...i, folder: undefined } : i));
  await saveMediaFolders(folders);
  await saveMediaBin(items);
  return { folders, items };
}

export async function setMediaMuted(id: string, muted: boolean): Promise<MediaItem[]> {
  const items = (await loadMediaBin()).map((i) => (i.id === id ? { ...i, muted: !!muted || undefined } : i));
  await saveMediaBin(items);
  return items;
}

/** Move media into a folder, or out of folders with null. */
export async function moveMedia(ids: string[], folder: string | null): Promise<MediaItem[]> {
  const folders = await loadMediaFolders();
  const into = folder && folders.some((f) => f.id === folder) ? folder : undefined;
  const move = new Set(Array.isArray(ids) ? ids : []);
  const items = (await loadMediaBin()).map((i) => (move.has(i.id) ? { ...i, folder: into } : i));
  await saveMediaBin(items);
  return items;
}

export async function removeFromMediaBin(id: string): Promise<MediaItem[]> {
  const items = (await loadMediaBin()).filter((i) => i.id !== id);
  await saveMediaBin(items);
  return items;
}

/** Point bin items at the new places of files that moved (old path → new path). */
export async function relinkMediaBin(moves: Record<string, string>): Promise<MediaItem[]> {
  const items = (await loadMediaBin()).map((i) => (moves[i.path] ? { ...i, path: moves[i.path] } : i));
  await saveMediaBin(items);
  return items;
}
