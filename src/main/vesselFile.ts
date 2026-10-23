// Writing, opening and adding from Vessel files (.vessel); see shared/vesselFile.ts
// for what's inside. Nothing here talks to Electron except through the
// folders passed in, so it can be tested on its own; vesselFiles.ts adds the dialogs.
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { binKindOf } from '../shared/media';
import { parsePresentation, serializePresentation } from '../shared/pro/presentation';
import { mediaPathsOf, relinkMedia } from '../shared/pro/relink';
import { decodeService, encodeService } from '../shared/pro/service';
import { BUILT_IN_THEMES, cleanTheme, sameLook, type Theme } from '../shared/theme';
import {
  readManifest,
  safeFileName,
  VESSEL_FILE_ROOT,
  type VesselChoice,
  type VesselExportRequest,
  type VesselManifest,
  type VesselPreview,
  type VesselReport
} from '../shared/vesselFile';
import { sameMedia, type SongIndex } from './songIndex';
import { unzipTo, zipPath, zipWriter } from './zipStream';

/** "Name.pro" → "Name 2.pro" … until `taken` says it's free. */
function unique(name: string, taken: (candidate: string) => boolean): string {
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${base} ${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

/** Write a Vessel file to `target`. Missing songs and media are left out and named in `missing`. */
export async function writeVesselFile(target: string, req: VesselExportRequest, app: string): Promise<{ manifest: VesselManifest; missing: string[] }> {
  const missing: string[] = [];
  // Presentations: the ones passed in, then any from disk (library songs, and every song in the playlists).
  // A presentation passed in with its path stands for that file (its unsaved edits included).
  const pres: Array<{ name: string; bytes: Uint8Array; source?: string }> = req.presentations.map((p) => ({ name: p.name, bytes: p.bytes, source: p.path }));
  const fromDisk = [...req.presentationPaths, ...req.playlists.flatMap((s) => s.items.flatMap((it) => (it.kind === 'presentation' ? [it.path] : [])))];
  for (const path of [...new Set(fromDisk)]) {
    if (pres.some((p) => p.source === path)) continue;
    if (!existsSync(path)) {
      missing.push(basename(path));
      continue;
    }
    pres.push({ name: basename(path, extname(path)), bytes: new Uint8Array(await readFile(path)), source: path });
  }

  // Each presentation gets its own file name; playlists point at them by their old paths.
  const used = new Set<string>();
  const entries = pres.map((p) => {
    const file = `presentations/${unique(`${safeFileName(p.name)}.pro`, (c) => used.has(c))}`;
    used.add(file.slice('presentations/'.length));
    return { ...p, file, presentation: parsePresentation(p.bytes) };
  });

  // Media: everything the presentations use, plus any chosen from the media bin.
  const mediaPaths = [...new Set([...entries.flatMap((e) => mediaPathsOf(e.presentation)), ...req.media])];
  const media: VesselManifest['media'] = [];
  const moves: Record<string, string> = {};
  for (const path of mediaPaths) {
    const kind = binKindOf(path);
    if (!kind) continue;
    if (!existsSync(path)) {
      missing.push(basename(path));
      continue;
    }
    const file = zipPath('media', String(media.length + 1), basename(path.replace(/\\/g, '/')));
    media.push({ file, name: basename(path.replace(/\\/g, '/')), kind });
    moves[path] = `${VESSEL_FILE_ROOT}/${file}`;
  }

  const songFile = new Map(entries.filter((e) => e.source).map((e) => [e.source!, `${VESSEL_FILE_ROOT}/${e.file}`]));
  const playlists = req.playlists.map((s, i) => ({
    file: `playlists/${String(i + 1)}-${safeFileName(s.name)}.proPlaylist`,
    name: s.name,
    service: { ...s, items: s.items.map((it) => (it.kind === 'presentation' && songFile.has(it.path) ? { ...it, path: songFile.get(it.path)! } : it)) }
  }));

  const manifest: VesselManifest = {
    format: 'vessel',
    version: 1,
    kind: req.kind,
    title: req.title.trim() || 'Vessel file',
    description: req.description.trim(),
    author: req.author.trim(),
    created: Date.now(),
    app,
    presentations: entries.map((e) => ({ file: e.file, name: e.presentation.name || e.name, slides: e.presentation.cues.length })),
    playlists: playlists.map((p) => ({ file: p.file, name: p.name, items: p.service.items.length })),
    themes: req.themes,
    media
  };

  const zip = zipWriter(target);
  try {
    await zip.add('manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    for (const e of entries) await zip.add(e.file, serializePresentation(relinkMedia(e.presentation, moves)));
    for (const p of playlists) await zip.add(p.file, encodeService(p.service));
    for (const m of media) {
      const path = Object.keys(moves).find((k) => moves[k] === `${VESSEL_FILE_ROOT}/${m.file}`)!;
      await zip.add(m.file, path, false);
    }
    await zip.close();
  } catch (err) {
    await zip.abort();
    throw err;
  }
  return { manifest, missing };
}

/** Unpack a Vessel file into the empty folder `into` and read what's inside. */
export async function unpackVesselFile(file: string, into: string): Promise<VesselManifest> {
  await unzipTo(file, into);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(into, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('This isn’t a Vessel file');
  }
  const manifest = readManifest(raw);
  if (!manifest) throw new Error('This isn’t a Vessel file, or it’s from a newer Vessel');
  return manifest;
}

/** What's in an unpacked Vessel file, and which parts are already here. */
export async function previewOf(
  token: string,
  fileName: string,
  unpacked: string,
  manifest: VesselManifest,
  here: { songNames: string[]; themes: Theme[]; songs?: SongIndex }
): Promise<VesselPreview> {
  const names = new Set(here.songNames.map((n) => n.toLowerCase()));
  // Already here: the same song (wherever it's kept), or one with the same name.
  const presentations: boolean[] = [];
  for (const p of manifest.presentations) {
    let same = names.has(p.name.toLowerCase());
    if (!same && here.songs) {
      const bytes = await tryRead(join(unpacked, ...p.file.split('/')));
      try {
        same = !!bytes && !!(await here.songs.find(parsePresentation(bytes)));
      } catch {
        // Not readable: not the same.
      }
    }
    presentations.push(same);
  }
  let mediaBytes = 0;
  for (const m of manifest.media) {
    const path = join(unpacked, ...m.file.split('/'));
    if (existsSync(path)) mediaBytes += (await stat(path)).size;
  }
  return {
    token,
    fileName,
    manifest,
    mediaBytes,
    have: {
      presentations,
      themes: manifest.themes.map((t) => {
        const clean = cleanTheme(t);
        return !!clean && here.themes.some((h) => h.name === clean.name && sameLook(h, clean));
      })
    }
  };
}

export interface AddTargets {
  libraryFolder: string;
  playlistFolder: string;
  mediaFolder: string;
  themes: Theme[];
  /** Songs in the library: the same song coming in again is used where it is. */
  songs?: SongIndex;
  /** Media already in the bin: the same file (name and size) is used rather than copied again. */
  existingMedia?: string[];
}

/** Bytes of a file, or null if it isn't there. */
const tryRead = async (path: string): Promise<Uint8Array | null> => (existsSync(path) ? new Uint8Array(await readFile(path)) : null);

/**
 * Add the chosen parts of an unpacked Vessel file. Presentations go into a
 * library folder named after the file, media into Media/<title>, playlists
 * into the playlist folder; the same presentation already there is reused, a
 * different one with the same name is kept beside it.
 */
export async function addFromUnpacked(
  unpacked: string,
  manifest: VesselManifest,
  choice: Omit<VesselChoice, 'token'>,
  to: AddTargets
): Promise<VesselReport & { themesAfter: Theme[]; mediaAdded: string[] }> {
  const folderName = safeFileName(manifest.title, 'Vessel file');
  const libDir = join(to.libraryFolder, folderName);
  const report: VesselReport & { themesAfter: Theme[]; mediaAdded: string[] } = {
    presentations: 0,
    playlists: 0,
    themes: 0,
    media: 0,
    skipped: 0,
    playlist: null,
    folder: libDir,
    themesAfter: to.themes,
    mediaAdded: []
  };

  // A chosen playlist brings its songs with it.
  const wanted = new Set(choice.presentations);
  const playlistSources = choice.playlists.map((i) => manifest.playlists[i]).filter(Boolean);
  const playlistsRead = await Promise.all(
    playlistSources.map(async (p) => ({ p, bytes: await tryRead(join(unpacked, ...p.file.split('/'))) }))
  );
  for (const { bytes } of playlistsRead) {
    if (!bytes) continue;
    for (const it of decodeService(bytes, '').items) {
      if (it.kind !== 'presentation' || !it.path.startsWith(`${VESSEL_FILE_ROOT}/`)) continue;
      const i = manifest.presentations.findIndex((p) => `${VESSEL_FILE_ROOT}/${p.file}` === it.path);
      if (i >= 0) wanted.add(i);
    }
  }

  // Media: copied once into Media/<title> (the same file already there is reused).
  const moves: Record<string, string> = {};
  if (choice.media && manifest.media.length) {
    for (const m of manifest.media) {
      const from = join(unpacked, ...m.file.split('/'));
      if (!existsSync(from)) continue;
      const have = to.existingMedia && (await sameMedia(from, to.existingMedia));
      if (have) {
        // Already in the media bin: used where it is (and left in its folder there).
        moves[`${VESSEL_FILE_ROOT}/${m.file}`] = have;
        report.skipped++;
        continue;
      }
      const size = (await stat(from)).size;
      const name = unique(safeFileName(m.name, 'media'), (c) => existsSync(join(to.mediaFolder, c)) && !(sameSize(join(to.mediaFolder, c), size)));
      const target = join(to.mediaFolder, name);
      if (existsSync(target)) report.skipped++;
      else {
        await mkdir(to.mediaFolder, { recursive: true });
        await copyFile(from, target);
        report.media++;
      }
      moves[`${VESSEL_FILE_ROOT}/${m.file}`] = target;
      report.mediaAdded.push(target);
    }
  }

  // Presentations.
  const placed = new Map<string, string>();
  for (const i of [...wanted].sort((a, b) => a - b)) {
    const p = manifest.presentations[i];
    const bytes = p && (await tryRead(join(unpacked, ...p.file.split('/'))));
    if (!p || !bytes) continue;
    let data: Uint8Array;
    try {
      const incoming = parsePresentation(bytes);
      const here = to.songs && (await to.songs.find(incoming));
      if (here) {
        // The same song is already in the library: the playlist uses that one.
        placed.set(`${VESSEL_FILE_ROOT}/${p.file}`, here);
        report.skipped++;
        continue;
      }
      data = serializePresentation(relinkMedia(incoming, moves));
    } catch {
      continue; // Not a presentation Vessel can read: left out.
    }
    const fileName = `${safeFileName(p.name)}.pro`;
    let target = join(libDir, fileName);
    if (existsSync(target) && Buffer.compare(await readFile(target), data) === 0) {
      report.skipped++;
    } else {
      target = join(libDir, unique(fileName, (c) => existsSync(join(libDir, c))));
      await mkdir(libDir, { recursive: true });
      await writeFile(target, data);
      report.presentations++;
    }
    placed.set(`${VESSEL_FILE_ROOT}/${p.file}`, target);
  }

  // Playlists, pointing at the presentations' new places.
  for (const { p, bytes } of playlistsRead) {
    if (!bytes) continue;
    const service = decodeService(bytes, p.name);
    const items = service.items.map((it) => (it.kind === 'presentation' && placed.has(it.path) ? { ...it, path: placed.get(it.path)! } : it));
    await mkdir(to.playlistFolder, { recursive: true });
    const name = unique(`${safeFileName(service.name || p.name)}.proPlaylist`, (c) => existsSync(join(to.playlistFolder, c)));
    const target = join(to.playlistFolder, name);
    await writeFile(target, encodeService({ ...service, items }));
    report.playlists++;
    report.playlist ??= target;
  }

  // Themes: checked, and only the ones not already here (a same-named, different one gets a new name).
  let themes = [...to.themes];
  for (const i of choice.themes) {
    const t = cleanTheme(manifest.themes[i]);
    if (!t) continue;
    if (themes.some((h) => h.name === t.name && sameLook(h, t))) {
      report.skipped++;
      continue;
    }
    const name = themes.some((h) => h.name === t.name) ? `${t.name} (${manifest.title})`.slice(0, 60) : t.name;
    // A new id if it's taken, by your themes or a built-in one (which would hide it).
    const id = themes.some((h) => h.id === t.id) || BUILT_IN_THEMES.some((h) => h.id === t.id) ? `${t.id}-${Math.random().toString(36).slice(2, 7)}` : t.id;
    themes = [...themes, { ...t, id, name, builtIn: false }];
    report.themes++;
  }
  report.themesAfter = themes;
  return report;
}

function sameSize(path: string, size: number): boolean {
  try {
    return statSync(path).size === size;
  } catch {
    return false;
  }
}

/** Remove unpacked Vessel files left from earlier (they live in the temporary folder). */
export async function clearUnpacked(folder: string): Promise<void> {
  if (!existsSync(folder)) return;
  for (const name of await readdir(folder)) if (name.startsWith('vessel-open-')) await rm(join(folder, name), { recursive: true, force: true });
}
