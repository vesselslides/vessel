// The samples: songs, a service, motion and still backgrounds, audio, a
// placeholder logo and a Bible, set up the first time Vessel runs so there's
// something to try straight away (and again from Help). Nothing that's
// already there is overwritten.
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { normalizeLowerThirds } from '../shared/lowerThirds';
import { normalizeMessages } from '../shared/messages';
import { parsePresentation, serializePresentation } from '../shared/pro/presentation';
import { relinkMedia } from '../shared/pro/relink';
import { decodeService, encodeService } from '../shared/pro/service';
import { SAMPLES_ROOT, type SamplesManifest } from '../shared/samples';
import { addBundledBible, listBibles } from './bibles';
import { log, describe } from './log';
import { addToMediaBin, createMediaFolder, loadMediaFolders, setMediaMuted } from './media';
import { getSettings, updateSettings } from './settings';

/** Where the samples are: inside the installed app, or the project while developing. */
function samplesFolder(): string | null {
  const candidates = [join(process.resourcesPath ?? '', 'samples'), join(app.getAppPath(), 'resources', 'samples'), join(__dirname, '../../resources/samples')];
  return candidates.find((d) => existsSync(join(d, 'manifest.json'))) ?? null;
}

async function copyIfMissing(from: string, to: string): Promise<boolean> {
  if (existsSync(to) && (await stat(to)).size === (await stat(from)).size) return false;
  if (existsSync(to)) return false; // Something else with that name: leave it alone.
  await copyFile(from, to);
  return true;
}

export interface SamplesReport {
  songs: number;
  media: number;
  bible: boolean;
  /** The sample service playlist, to open. */
  playlist: string | null;
}

export async function installSamples(): Promise<SamplesReport> {
  const report: SamplesReport = { songs: 0, media: 0, bible: false, playlist: null };
  const from = samplesFolder();
  if (!from) {
    log.warn('Samples not found in this build');
    return report;
  }
  const manifest = JSON.parse(await readFile(join(from, 'manifest.json'), 'utf8')) as SamplesManifest;
  const settings = await getSettings();

  // Media: beside the library, in Media/Samples.
  const mediaDir = join(dirname(settings.libraryFolder), 'Media', 'Samples');
  await mkdir(mediaDir, { recursive: true });
  const moves: Record<string, string> = {};
  for (const name of await readdir(join(from, 'media'))) {
    if (name.startsWith('.')) continue;
    if (await copyIfMissing(join(from, 'media', name), join(mediaDir, name))) report.media++;
    moves[`${SAMPLES_ROOT}/media/${name}`] = join(mediaDir, name);
  }

  // Songs and presentations: in the library's Samples folder, pointing at that media.
  const songsDir = join(settings.libraryFolder, 'Samples');
  await mkdir(songsDir, { recursive: true });
  const songMoves: Record<string, string> = {};
  for (const name of await readdir(join(from, 'songs'))) {
    if (!name.endsWith('.pro')) continue;
    const target = join(songsDir, name);
    songMoves[`${SAMPLES_ROOT}/songs/${name}`] = target;
    if (existsSync(target)) continue;
    const presentation = relinkMedia(parsePresentation(new Uint8Array(await readFile(join(from, 'songs', name)))), moves);
    await writeFile(target, serializePresentation(presentation));
    report.songs++;
  }

  // The sample service, pointing at those songs.
  const playlistTarget = join(settings.playlistFolder, manifest.playlist);
  if (!existsSync(playlistTarget)) {
    const service = decodeService(new Uint8Array(await readFile(join(from, 'playlists', manifest.playlist))), 'Sample Sunday Service');
    const items = service.items.map((it) => (it.kind === 'presentation' ? { ...it, path: songMoves[it.path] ?? it.path } : it));
    await writeFile(playlistTarget, encodeService({ ...service, items }));
  }
  report.playlist = playlistTarget;

  // The media bin, in folders: motion backgrounds, backgrounds, audio.
  let folders = await loadMediaFolders();
  for (const name of [...new Set(manifest.media.map((m) => m.folder))]) {
    let folder = folders.find((f) => f.name === name);
    if (!folder) {
      folders = await createMediaFolder(name);
      folder = folders.find((f) => f.name === name);
    }
    const items = manifest.media.filter((m) => m.folder === name);
    const bin = await addToMediaBin(
      items.map((m) => join(mediaDir, m.file)),
      folder?.id
    );
    for (const m of items.filter((x) => x.muted)) {
      const added = bin.find((b) => b.path === join(mediaDir, m.file));
      if (added && !added.muted) await setMediaMuted(added.id, true);
    }
  }

  // The World English Bible, so verses work straight away, even offline.
  try {
    if (!(await listBibles()).some((b) => b.abbreviation === 'WEB')) {
      await addBundledBible(join(from, 'bible', manifest.bible.file), manifest.bible.id);
      report.bible = true;
    }
  } catch (err) {
    log.error(`The sample Bible couldn’t be added: ${describe(err)}`);
  }

  // Starting points for the Logo button, messages and lower thirds; anything already set stays.
  const s = await getSettings();
  await updateSettings({
    ...(s.logoPath ? {} : { logoPath: join(mediaDir, manifest.logo) }),
    ...(normalizeMessages(s.messages).length ? {} : { messages: manifest.messages.map((text, i) => ({ id: `sample-${i}`, text })) }),
    ...(normalizeLowerThirds(s.lowerThirds).length ? {} : { lowerThirds: manifest.lowerThirds.map((l, i) => ({ id: `sample-${i}`, ...l })) }),
    samplesInstalled: true
  });
  log.info(`Samples set up: ${report.songs} presentations, ${report.media} media files${report.bible ? ', the WEB Bible' : ''}`);
  return report;
}
