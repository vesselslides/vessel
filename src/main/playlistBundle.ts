// Playlists with media (.proPlaylist bundles): the playlist's "data" entry,
// plus every song and every picture, video and audio file they use, stored
// under their original paths (the leading "/" or drive colon dropped), the
// way presentation software exports a playlist with its media.
//
// Opening one copies the songs into Library/<playlist> and the media into
// Media/<playlist>, and points the playlist at them. Files still at their
// original place on this computer are used where they are.
import { toBinary } from '@bufbuild/protobuf';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { PlaylistDocumentSchema } from '../shared/gen/playlist_pb';
import { binKindOf } from '../shared/media';
import { parsePresentation, serializePresentation } from '../shared/pro/presentation';
import { mediaPathsOf, relinkMedia } from '../shared/pro/relink';
import { decodeService, encodeService, serviceToDocument, type Service } from '../shared/pro/service';
import { safeFileName } from '../shared/vesselFile';
import { sameMedia, type SongIndex } from './songIndex';
import { unzipTo, zipWriter } from './zipStream';

/** Where a file goes inside the bundle: its path without the leading "/" (or "C:"). */
export const bundlePath = (path: string): string =>
  path
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, '$1')
    .replace(/^\/+/, '');

/** Write the service, its songs and their media as one .proPlaylist. Songs or media not found are named in `missing`. */
export async function writePlaylistBundle(target: string, service: Service, edited: Record<string, Uint8Array> = {}): Promise<{ files: number; missing: string[] }> {
  const missing: string[] = [];
  const songs = [...new Set(service.items.flatMap((it) => (it.kind === 'presentation' ? [it.path] : [])))];
  const media = new Set<string>();
  const found: string[] = [];
  for (const path of songs) {
    if (!existsSync(path) && !edited[path]) {
      missing.push(basename(path));
      continue;
    }
    found.push(path);
    try {
      for (const m of mediaPathsOf(parsePresentation(edited[path] ?? new Uint8Array(await readFile(path))))) media.add(m);
    } catch {
      // Not readable as a presentation: bundled as it is, without media.
    }
  }
  const zip = zipWriter(target);
  let files = 0;
  try {
    await zip.add('data', toBinary(PlaylistDocumentSchema, serviceToDocument(service)));
    for (const path of found) {
      // An open song with unsaved changes goes in as it is now.
      await zip.add(bundlePath(path), edited[path] ?? path);
      files++;
    }
    for (const path of media) {
      if (!binKindOf(path)) continue;
      if (!existsSync(path)) {
        missing.push(basename(path));
        continue;
      }
      // Pictures and videos are compressed already.
      await zip.add(bundlePath(path), path, false);
      files++;
    }
    await zip.close();
  } catch (err) {
    await zip.abort();
    throw err;
  }
  return { files, missing };
}

/** Every file under `dir`, as forward-slash paths relative to it. */
async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

function unique(dir: string, name: string, same: (path: string) => boolean): string {
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const path = join(dir, n === 1 ? name : `${base} ${n}${ext}`);
    if (!existsSync(path) || same(path)) return path;
  }
}

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
};

export interface Unbundled {
  /** The playlist, pointing at the songs' places on this computer. */
  bytes: Uint8Array;
  songs: number;
  /** Media copied in, for the media bin. */
  media: string[];
  name: string;
}

/**
 * Open a .proPlaylist: with songs and media inside, they're copied into
 * `libraryFolder/<name>` and `mediaRoot/<name>`; null when it holds only the
 * playlist (it's then read as it is).
 */
export async function unbundlePlaylist(
  file: string,
  scratch: string,
  to: {
    libraryFolder: string;
    mediaRoot: string;
    /** Songs in the library: the same song is used where it is. */
    songs?: SongIndex;
    /** Media in the bin: the same file (name and size) is used rather than copied. */
    existingMedia?: string[];
  }
): Promise<Unbundled | null> {
  const head = new Uint8Array(4);
  const fh = await open(file, 'r');
  try {
    await fh.read(head, 0, 4, 0);
  } finally {
    await fh.close();
  }
  if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) return null;
  try {
    await unzipTo(file, scratch);
    const all = await listFiles(scratch);
    const entries = all.filter((e) => e !== 'data' && !e.endsWith('/data'));
    if (!entries.length) return null;
    const dataEntry = all.includes('data') ? 'data' : all.find((e) => e.endsWith('/data'));
    if (!dataEntry) throw new Error('This playlist file has no playlist inside');
    const dataPath = join(scratch, ...dataEntry.split('/'));
    const fallback = basename(file, extname(file));
    const service = decodeService(new Uint8Array(await readFile(dataPath)), fallback);
    const name = safeFileName(service.name || fallback, 'Imported playlist');

    // A path in the playlist or a song, found in the bundle: by its full path, or else by its name.
    const inBundle = (path: string): string | null => {
      const exact = bundlePath(path);
      if (entries.includes(exact)) return join(scratch, ...exact.split('/'));
      const name = basename(path.replace(/\\/g, '/'));
      const hit = entries.find((e) => e === name || e.endsWith(`/${name}`));
      return hit ? join(scratch, ...hit.split('/')) : null;
    };

    const libDir = join(to.libraryFolder, name);
    const mediaDir = join(to.mediaRoot, name);
    const placed = new Map<string, string>();
    const mediaMoves: Record<string, string> = {};
    const media: string[] = [];
    let songs = 0;

    const placeMedia = async (path: string): Promise<void> => {
      if (path in mediaMoves || existsSync(path)) return;
      const from = inBundle(path);
      if (!from || !binKindOf(from)) return;
      const have = to.existingMedia && (await sameMedia(from, to.existingMedia));
      if (have) {
        mediaMoves[path] = have;
        return;
      }
      await mkdir(mediaDir, { recursive: true });
      const size = sizeOf(from);
      const target = unique(mediaDir, basename(path.replace(/\\/g, '/')), (p) => sizeOf(p) === size);
      if (!existsSync(target)) await copyFile(from, target);
      mediaMoves[path] = target;
      media.push(target);
    };

    for (const it of service.items) {
      if (it.kind !== 'presentation' || placed.has(it.path) || existsSync(it.path)) continue;
      const from = inBundle(it.path);
      if (!from) continue;
      let presentation;
      try {
        presentation = parsePresentation(new Uint8Array(await readFile(from)));
      } catch {
        continue;
      }
      const here = to.songs && (await to.songs.find(presentation));
      if (here) {
        // The same song is already in the library.
        placed.set(it.path, here);
        continue;
      }
      for (const m of mediaPathsOf(presentation)) await placeMedia(m);
      const bytes = serializePresentation(relinkMedia(presentation, mediaMoves));
      await mkdir(libDir, { recursive: true });
      const target = unique(libDir, `${safeFileName(basename(it.path.replace(/\\/g, '/'), extname(it.path)))}.pro`, (p) => existsSync(p) && sameBytes(p, bytes));
      if (!existsSync(target)) {
        await writeFile(target, bytes);
        songs++;
      }
      placed.set(it.path, target);
    }

    const items = service.items.map((it) => (it.kind === 'presentation' && placed.has(it.path) ? { ...it, path: placed.get(it.path)! } : it));
    return { bytes: encodeService({ ...service, items }), songs, media, name };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function sameBytes(path: string, bytes: Uint8Array): boolean {
  try {
    return Buffer.compare(readFileSync(path), Buffer.from(bytes)) === 0;
  } catch {
    return false;
  }
}
