// Backups: one .vesselbackup file (a zip) with everything needed to set Vessel
// up again on another computer: songs, playlists, themes, Bibles, the media
// bin and its folders, the CCLI log and settings, and optionally the media
// files themselves. Written and read as streams, so large videos are fine.
//
// Nothing here talks to Electron, so it can be tested on its own; backup.ts
// adds the dialogs.
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { createReadStream, createWriteStream, existsSync, type WriteStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { once } from 'node:events';
import { parsePresentation, serializePresentation } from '../shared/pro/presentation';
import { relinkMedia } from '../shared/pro/relink';
import { decodeService, encodeService } from '../shared/pro/service';
import type { MediaFolder, MediaItem, Settings } from '../shared/types';

export const BACKUP_EXTENSION = 'vesselbackup';

/** Files in the data folder that go into a backup (Bibles go in too, from their folder). */
const DATA_FILES = ['settings.json', 'themes.json', 'media-bin.json', 'media-folders.json', 'ccli-usage.json'];

export interface BackupManifest {
  format: 1;
  app: 'Vessel';
  version: string;
  created: number;
  /** Where songs and playlists were on the computer the backup came from. */
  libraryFolder: string;
  playlistFolder: string;
  /** Media files in the backup: name inside it → where the file was. */
  media: Record<string, string>;
  counts: { songs: number; playlists: number; bibles: number; media: number };
}

export interface BackupSources {
  dataFolder: string;
  libraryFolder: string;
  playlistFolder: string;
  /** Media files to put in (the media bin's, the logo…); missing ones are left out. */
  media: string[];
  appVersion: string;
}

/** Files under `folder` with these extensions, as paths relative to it. */
async function filesUnder(folder: string, exts: string[], depth = 6): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, left: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory() && left > 0) await walk(full, left - 1);
      else if (e.isFile() && exts.includes(extname(e.name).toLowerCase())) out.push(relative(folder, full));
    }
  };
  await walk(folder, depth);
  return out.sort();
}

/** Zip paths always use forward slashes. */
const zipPath = (...parts: string[]): string => parts.join('/').split(sep).join('/');

/** Write a backup to `target`. Returns what went in. */
export async function writeBackup(target: string, src: BackupSources): Promise<BackupManifest> {
  const songs = await filesUnder(src.libraryFolder, ['.pro']);
  const playlists = await filesUnder(src.playlistFolder, ['.proplaylist']);
  const bibles = (await filesUnder(join(src.dataFolder, 'bibles'), ['.json'], 0)).filter((f) => f !== 'index.json');
  const media: Record<string, string> = {};
  [...new Set(src.media)].filter((p) => existsSync(p)).forEach((p, i) => (media[zipPath('media', String(i + 1), basename(p))] = p));

  const manifest: BackupManifest = {
    format: 1,
    app: 'Vessel',
    version: src.appVersion,
    created: Date.now(),
    libraryFolder: src.libraryFolder,
    playlistFolder: src.playlistFolder,
    media,
    counts: { songs: songs.length, playlists: playlists.length, bibles: bibles.length, media: Object.keys(media).length }
  };

  const out = createWriteStream(target);
  let failed: Error | null = null;
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) failed = err;
    else out.write(chunk);
    if (final || err) out.end();
  });
  const add = async (name: string, source: string | Uint8Array, compress = true): Promise<void> => {
    const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    zip.add(entry);
    if (typeof source !== 'string') return entry.push(source, true);
    // Stream the file in, waiting for the disk whenever too much is waiting to be written.
    for await (const chunk of createReadStream(source)) {
      entry.push(chunk as Uint8Array);
      await drained(out);
    }
    entry.push(new Uint8Array(0), true);
  };

  try {
    await add('manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    for (const f of DATA_FILES) if (existsSync(join(src.dataFolder, f))) await add(zipPath('data', f), join(src.dataFolder, f));
    if (existsSync(join(src.dataFolder, 'bibles', 'index.json'))) await add('data/bibles/index.json', join(src.dataFolder, 'bibles', 'index.json'));
    for (const f of bibles) await add(zipPath('data', 'bibles', f), join(src.dataFolder, 'bibles', f));
    for (const f of songs) await add(zipPath('library', f), join(src.libraryFolder, f));
    for (const f of playlists) await add(zipPath('playlists', f), join(src.playlistFolder, f));
    // Pictures and videos are already compressed; storing them is much faster.
    for (const [name, path] of Object.entries(media)) await add(name, path, false);
    zip.end();
    await done;
  } catch (err) {
    out.destroy();
    await rm(target, { force: true });
    throw err;
  }
  if (failed) throw failed;
  return manifest;
}

async function drained(stream: WriteStream): Promise<void> {
  if (stream.writableLength > 32 * 1024 * 1024) await once(stream, 'drain');
}

/** Unpack a backup into the empty folder `into` and return its manifest. Names that would leave the folder are refused. */
export async function unpackBackup(file: string, into: string): Promise<BackupManifest> {
  await mkdir(into, { recursive: true });
  const writes: Array<Promise<void>> = [];
  const open: WriteStream[] = [];
  let bad: Error | null = null;
  const unzip = new Unzip((entry) => {
    const name = entry.name;
    if (name.endsWith('/')) return;
    const target = join(into, ...name.split('/'));
    if (name.split('/').some((p) => p === '..' || p === '') || !target.startsWith(into + sep)) {
      bad = new Error(`This backup has a file Vessel won't unpack (${name})`);
      return;
    }
    let stream: WriteStream | null = null;
    const pending: Uint8Array[] = [];
    const ready = mkdir(dirname(target), { recursive: true }).then(() => {
      stream = createWriteStream(target);
      open.push(stream);
      for (const c of pending) stream.write(c);
      return stream;
    });
    let finished!: () => void;
    let failed!: (e: Error) => void;
    writes.push(new Promise<void>((res, rej) => ((finished = res), (failed = rej))));
    entry.ondata = (err, chunk, final) => {
      if (err) return failed(err);
      if (stream) stream.write(chunk);
      else pending.push(chunk);
      if (final) void ready.then((s) => s.end(() => finished()), failed);
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for await (const chunk of createReadStream(file)) {
    unzip.push(chunk as Uint8Array);
    for (const s of open) if (s.writableLength > 32 * 1024 * 1024) await once(s, 'drain');
    if (bad) break;
  }
  if (!bad) unzip.push(new Uint8Array(0), true);
  await Promise.all(writes);
  if (bad) throw bad;
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await readFile(join(into, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('This isn’t a Vessel backup');
  }
  if (manifest?.app !== 'Vessel' || manifest.format !== 1) throw new Error('This isn’t a Vessel backup, or it’s from a newer Vessel');
  return manifest;
}

export interface RestoreTargets {
  dataFolder: string;
  libraryFolder: string;
  playlistFolder: string;
  /** Where media from the backup is put. */
  mediaFolder: string;
  settings: Settings;
}

export interface RestoreReport {
  songs: number;
  playlists: number;
  bibles: number;
  media: number;
  /** Songs and playlists that differed from ones already here, kept as "Name (backup)". */
  renamed: string[];
  /** Settings to save (this computer's folders and screens kept). */
  settings: Settings;
}

/** "Song.pro" → "Song (backup).pro", or "(backup 2)" and so on if that's taken too. */
function backupName(path: string): string {
  const ext = extname(path);
  const base = path.slice(0, -ext.length);
  for (let n = 1; ; n++) {
    const candidate = `${base} (backup${n > 1 ? ` ${n}` : ''})${ext}`;
    if (!existsSync(candidate)) return candidate;
  }
}

async function sameBytes(a: string, b: Uint8Array): Promise<boolean> {
  const s = await stat(a);
  return s.size === b.length && Buffer.compare(await readFile(a), b) === 0;
}

/** A playlist's running order, for telling whether two files hold the same one (each save gives it new ids). */
function playlistContent(bytes: Uint8Array): string | null {
  try {
    const service = decodeService(bytes, '');
    return JSON.stringify([service.name, service.items.map((it) => (it.kind === 'header' ? [it.name, it.color] : [it.name, norm(it.path), it.arrangementName ?? '']))]);
  } catch {
    return null;
  }
}

/**
 * Where a file from the backup goes: its own name, unless something different
 * is there already; then beside it as "(backup)". Null when the same file is
 * already here (under its name or an earlier "(backup)" copy).
 */
async function placeFor(target: string, same: (existing: string) => Promise<boolean>): Promise<{ path: string; renamed: boolean } | { existing: string }> {
  if (!existsSync(target)) return { path: target, renamed: false };
  if (await same(target)) return { existing: target };
  const ext = extname(target);
  const base = target.slice(0, -ext.length);
  for (let n = 1; ; n++) {
    const candidate = `${base} (backup${n > 1 ? ` ${n}` : ''})${ext}`;
    if (!existsSync(candidate)) return { path: candidate, renamed: true };
    if (await same(candidate)) return { existing: candidate };
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Paths from either kind of computer, compared with forward slashes. */
const norm = (p: string): string => p.replace(/\\/g, '/');

/** Move a path from the backup's computer to this one, if it was under one of the backup's folders. */
function remapFolder(path: string, from: string, to: string): string | null {
  const f = norm(from).replace(/\/$/, '');
  return norm(path).startsWith(`${f}/`) ? join(to, ...norm(path).slice(f.length + 1).split('/')) : null;
}

/**
 * Put an unpacked backup in place. Songs and playlists are added (a different
 * one with the same name stays, and the backup's comes in beside it); the media
 * bin, media folders, Bibles and CCLI log are merged; themes and settings come
 * from the backup, keeping this computer's folders, screens and sound output.
 */
export async function applyRestore(unpacked: string, manifest: BackupManifest, to: RestoreTargets): Promise<RestoreReport> {
  const report: RestoreReport = { songs: 0, playlists: 0, bibles: 0, media: 0, renamed: [], settings: to.settings };

  // Media first, so songs and the media bin can point at where it's put now.
  const moves: Record<string, string> = {};
  for (const [name, original] of Object.entries(manifest.media ?? {})) {
    const from = join(unpacked, ...name.split('/'));
    if (!existsSync(from)) continue;
    // Restoring onto the same computer: the file is still where it was.
    if (existsSync(original) && (await stat(original)).size === (await stat(from)).size) continue;
    await mkdir(to.mediaFolder, { recursive: true });
    let target = join(to.mediaFolder, basename(original.replace(/\\/g, '/')));
    if (existsSync(target) && (await stat(target)).size !== (await stat(from)).size) target = backupName(target);
    if (!existsSync(target)) await copyFile(from, target);
    moves[original] = target;
    report.media++;
  }

  // Songs: each keeps its place under the library folder.
  const songMoves: Record<string, string> = {};
  for (const rel of await filesUnder(join(unpacked, 'library'), ['.pro'])) {
    let bytes: Uint8Array = await readFile(join(unpacked, 'library', rel));
    if (Object.keys(moves).length) {
      try {
        bytes = serializePresentation(relinkMedia(parsePresentation(bytes), moves));
      } catch {
        // Not readable as a presentation: copy it as it is.
      }
    }
    const place = await placeFor(join(to.libraryFolder, rel), (p) => sameBytes(p, bytes));
    if ('existing' in place) {
      songMoves[norm(`${manifest.libraryFolder}/${rel}`)] = place.existing;
      continue;
    }
    if (place.renamed) report.renamed.push(relative(to.libraryFolder, place.path));
    await mkdir(dirname(place.path), { recursive: true });
    await writeFile(place.path, bytes);
    songMoves[norm(`${manifest.libraryFolder}/${rel}`)] = place.path;
    report.songs++;
  }
  const songOnThisComputer = (path: string): string => songMoves[norm(path)] ?? remapFolder(path, manifest.libraryFolder, to.libraryFolder) ?? path;

  // Playlists: their songs are pointed at this computer's library.
  for (const rel of await filesUnder(join(unpacked, 'playlists'), ['.proplaylist'])) {
    let bytes: Uint8Array = await readFile(join(unpacked, 'playlists', rel));
    try {
      const service = decodeService(bytes, basename(rel, extname(rel)));
      const items = service.items.map((it) => (it.kind === 'presentation' ? { ...it, path: songOnThisComputer(it.path) } : it));
      if (items.some((it, i) => it.kind === 'presentation' && it.path !== (service.items[i] as { path: string }).path)) {
        bytes = encodeService({ ...service, items });
      }
    } catch {
      // Not one Vessel can read: copy it as it is.
    }
    const content = playlistContent(bytes);
    const place = await placeFor(join(to.playlistFolder, rel), async (p) =>
      content === null ? sameBytes(p, bytes) : playlistContent(await readFile(p)) === content
    );
    if ('existing' in place) continue;
    if (place.renamed) report.renamed.push(relative(to.playlistFolder, place.path));
    await mkdir(dirname(place.path), { recursive: true });
    await writeFile(place.path, bytes);
    report.playlists++;
  }

  const data = (f: string): string => join(unpacked, 'data', f);
  const here = (f: string): string => join(to.dataFolder, f);

  // Media bin and folders: everything from both, without doubles.
  if (existsSync(data('media-bin.json'))) {
    const current = await readJson<MediaItem[]>(here('media-bin.json'), []);
    const incoming = (await readJson<MediaItem[]>(data('media-bin.json'), [])).map((m) => (moves[m.path] ? { ...m, path: moves[m.path] } : m));
    const paths = new Set(current.map((m) => m.path));
    await writeFile(here('media-bin.json'), JSON.stringify([...current, ...incoming.filter((m) => m && !paths.has(m.path))], null, 2));
  }
  if (existsSync(data('media-folders.json'))) {
    const current = await readJson<MediaFolder[]>(here('media-folders.json'), []);
    const ids = new Set(current.map((f) => f.id));
    const incoming = await readJson<MediaFolder[]>(data('media-folders.json'), []);
    await writeFile(here('media-folders.json'), JSON.stringify([...current, ...incoming.filter((f) => f && !ids.has(f.id))], null, 2));
  }
  // CCLI log: both, each entry once.
  if (existsSync(data('ccli-usage.json'))) {
    const all = [...(await readJson<unknown[]>(here('ccli-usage.json'), [])), ...(await readJson<unknown[]>(data('ccli-usage.json'), []))];
    const seen = new Set<string>();
    await writeFile(here('ccli-usage.json'), JSON.stringify(all.filter((e) => !seen.has(JSON.stringify(e)) && !!seen.add(JSON.stringify(e))), null, 2));
  }
  if (existsSync(data('themes.json'))) await copyFile(data('themes.json'), here('themes.json'));

  // Bibles: any this computer doesn't have.
  const bibleDir = join(unpacked, 'data', 'bibles');
  if (existsSync(bibleDir)) {
    await mkdir(here('bibles'), { recursive: true });
    const index = await readJson<Array<{ id: string }>>(here(join('bibles', 'index.json')), []);
    const ids = new Set(index.map((b) => b.id));
    for (const b of await readJson<Array<{ id: string }>>(join(bibleDir, 'index.json'), [])) {
      if (!b || typeof b.id !== 'string' || ids.has(b.id) || !existsSync(join(bibleDir, `${b.id}.json`))) continue;
      await copyFile(join(bibleDir, `${b.id}.json`), here(join('bibles', `${b.id}.json`)));
      index.push(b);
      report.bibles++;
    }
    await writeFile(here(join('bibles', 'index.json')), JSON.stringify(index, null, 2));
  }

  // Settings: the backup's, except what belongs to this computer.
  const incoming = await readJson<Partial<Settings>>(data('settings.json'), {});
  const mine = to.settings;
  const lastPlaylist = incoming.lastPlaylist ? remapFolder(incoming.lastPlaylist, manifest.playlistFolder, to.playlistFolder) : null;
  report.settings = {
    ...mine,
    ...incoming,
    libraryFolder: mine.libraryFolder,
    playlistFolder: mine.playlistFolder,
    extraFolders: mine.extraFolders,
    outputDisplayId: mine.outputDisplayId,
    stageDisplayId: mine.stageDisplayId,
    audioOutputId: mine.audioOutputId,
    lastPlaylist: lastPlaylist ?? mine.lastPlaylist,
    logoPath: incoming.logoPath ? (moves[incoming.logoPath] ?? incoming.logoPath) : mine.logoPath
  };
  return report;
}
