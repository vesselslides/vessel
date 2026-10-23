import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Zip, ZipPassThrough } from 'fflate';
import { backgroundForPath } from '../src/shared/pro/background';
import { setSlideBackground } from '../src/shared/pro/edit';
import { mediaPathsOf } from '../src/shared/pro/relink';
import { createPresentation, parseLyrics, parsePresentation, serializePresentation } from '../src/shared/pro/presentation';
import { decodeService, type Service } from '../src/shared/pro/service';
import { BUILT_IN_THEMES, cleanTheme, type Theme } from '../src/shared/theme';
import { readManifest, type VesselExportRequest } from '../src/shared/vesselFile';
import { addFromUnpacked, previewOf, unpackVesselFile, writeVesselFile } from '../src/main/vesselFile';
import { unzipTo } from '../src/main/zipStream';
import { songIndex } from '../src/main/songIndex';
import { relinkMedia } from '../src/shared/pro/relink';
import { copyFileSync } from 'node:fs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vessel-file-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const theme = (patch: Partial<Theme> = {}): Theme => ({ ...BUILT_IN_THEMES[0], id: 'mine', name: 'Our look', builtIn: false, ...patch });

/** A song on disk with a background picture, and a service playlist using it. */
function setUp(): { songPath: string; picture: string; service: Service } {
  const picture = join(dir, 'source', 'sunrise.jpg');
  const songPath = join(dir, 'source', 'Amazing Grace.pro');
  mkdirSync(join(dir, 'source'), { recursive: true });
  writeFileSync(picture, Buffer.alloc(2048, 7));
  let song = createPresentation('Amazing Grace', parseLyrics('[Verse 1]\nLine one\n\nLine two'));
  song = setSlideBackground(song, song.cues[0].uuid!.string, backgroundForPath(picture));
  writeFileSync(songPath, serializePresentation(song));
  const service: Service = {
    name: 'Sunday',
    items: [
      { id: 'h', kind: 'header', name: 'Worship', color: '#2170d9' },
      { id: 's', kind: 'presentation', name: 'Amazing Grace', path: songPath }
    ]
  } as Service;
  return { songPath, picture, service };
}

const request = (patch: Partial<VesselExportRequest>): VesselExportRequest => ({
  kind: 'collection',
  title: 'From Grace Church',
  description: 'For Easter',
  author: 'Grace Church',
  presentations: [],
  presentationPaths: [],
  playlists: [],
  themes: [],
  media: [],
  ...patch
});

const targets = (themes: Theme[] = []) => ({
  libraryFolder: join(dir, 'here', 'Library'),
  playlistFolder: join(dir, 'here', 'Playlists'),
  mediaFolder: join(dir, 'here', 'Media', 'From Grace Church'),
  themes
});

describe('Vessel files', () => {
  it('carry a service with its songs, media and themes to another Vessel', async () => {
    const { picture, service } = setUp();
    const file = join(dir, 'share.vessel');
    const { manifest, missing } = await writeVesselFile(file, request({ kind: 'service', playlists: [service], themes: [theme()] }), 'Vessel test');
    expect(missing).toEqual([]);
    expect(manifest.presentations.map((p) => p.name)).toEqual(['Amazing Grace']);
    expect(manifest.playlists).toEqual([expect.objectContaining({ name: 'Sunday', items: 2 })]);
    expect(manifest.media).toEqual([expect.objectContaining({ name: 'sunrise.jpg', kind: 'image' })]);

    // Opened elsewhere: nothing in it points at the sender's computer.
    rmSync(join(dir, 'source'), { recursive: true });
    const unpacked = join(dir, 'unpacked');
    const read = await unpackVesselFile(file, unpacked);
    expect(read.title).toBe('From Grace Church');
    const packed = parsePresentation(readFileSync(join(unpacked, read.presentations[0].file)));
    expect(mediaPathsOf(packed).every((p) => p.startsWith('/VESSEL-FILE/'))).toBe(true);

    const preview = await previewOf('t', 'share.vessel', unpacked, read, { songNames: [], themes: [] });
    expect(preview.mediaBytes).toBe(2048);
    expect(preview.have).toEqual({ presentations: [false], themes: [false] });

    const to = targets();
    const report = await addFromUnpacked(unpacked, read, { presentations: [], playlists: [0], themes: [0], media: true }, to);
    expect(report).toMatchObject({ presentations: 1, playlists: 1, themes: 1, media: 1, skipped: 0 });

    // The song came with its playlist and points at the copied picture.
    const added = join(to.libraryFolder, 'From Grace Church', 'Amazing Grace.pro');
    const copiedPicture = join(to.mediaFolder, 'sunrise.jpg');
    expect(readFileSync(copiedPicture).length).toBe(readFileSync(join(unpacked, read.media[0].file)).length);
    expect(mediaPathsOf(parsePresentation(readFileSync(added)))).toEqual([copiedPicture]);
    expect(report.mediaAdded).toEqual([copiedPicture]);

    const playlist = decodeService(readFileSync(report.playlist!), '');
    expect(playlist.name).toBe('Sunday');
    expect(playlist.items.map((it) => it.kind)).toEqual(['header', 'presentation']);
    expect(playlist.items[1]).toMatchObject({ kind: 'presentation', path: added });
    expect(report.themesAfter.map((t) => t.name)).toEqual(['Our look']);
    expect(picture).toContain('sunrise.jpg');
  });

  it('adds nothing twice and never overwrites', async () => {
    const { service } = setUp();
    const file = join(dir, 'share.vessel');
    await writeVesselFile(file, request({ playlists: [service], themes: [theme()] }), 'Vessel test');
    const unpacked = join(dir, 'unpacked');
    const read = await unpackVesselFile(file, unpacked);
    const to = targets();
    const first = await addFromUnpacked(unpacked, read, { presentations: [0], playlists: [], themes: [0], media: true }, to);
    expect(first).toMatchObject({ presentations: 1, themes: 1, media: 1 });

    // The same again: the song, picture and theme are already here.
    const again = await addFromUnpacked(unpacked, read, { presentations: [0], playlists: [], themes: [0], media: true }, { ...to, themes: first.themesAfter });
    expect(again).toMatchObject({ presentations: 0, themes: 0, media: 0, skipped: 3 });
    expect(readdirSync(join(to.libraryFolder, 'From Grace Church'))).toEqual(['Amazing Grace.pro']);

    // A different song or theme with the same name is kept beside the one here.
    writeFileSync(join(to.libraryFolder, 'From Grace Church', 'Amazing Grace.pro'), serializePresentation(createPresentation('Amazing Grace', parseLyrics('Mine'))));
    const clash = await addFromUnpacked(unpacked, read, { presentations: [0], playlists: [], themes: [0], media: true }, { ...to, themes: [theme({ sizePt: 99 })] });
    expect(clash).toMatchObject({ presentations: 1, themes: 1 });
    expect(readdirSync(join(to.libraryFolder, 'From Grace Church')).sort()).toEqual(['Amazing Grace 2.pro', 'Amazing Grace.pro']);
    expect(clash.themesAfter.map((t) => t.name)).toEqual(['Our look', 'Our look (From Grace Church)']);
    expect(new Set(clash.themesAfter.map((t) => t.id)).size).toBe(2);
  });

  it('includes unsaved presentations and media bin files, and names what is missing', async () => {
    const extra = join(dir, 'loop.mp4');
    writeFileSync(extra, Buffer.alloc(100, 1));
    const file = join(dir, 'share.vessel');
    const bytes = serializePresentation(createPresentation('New song', parseLyrics('Hello')));
    const { manifest, missing } = await writeVesselFile(
      file,
      request({ presentations: [{ name: 'New song', bytes }], presentationPaths: [join(dir, 'Gone.pro')], media: [extra, join(dir, 'gone.jpg')] }),
      'Vessel test'
    );
    expect(manifest.presentations.map((p) => p.name)).toEqual(['New song']);
    expect(manifest.media.map((m) => m.name)).toEqual(['loop.mp4']);
    expect(missing.sort()).toEqual(['Gone.pro', 'gone.jpg']);
  });

  it('refuse files that aren’t Vessel files', async () => {
    const file = join(dir, 'not.vessel');
    writeFileSync(file, await zipOf({ 'readme.txt': 'hello' }));
    await expect(unpackVesselFile(file, join(dir, 'a'))).rejects.toThrow('isn’t a Vessel file');
    writeFileSync(file, await zipOf({ 'manifest.json': JSON.stringify({ format: 'vessel', version: 2 }) }));
    await expect(unpackVesselFile(file, join(dir, 'b'))).rejects.toThrow('newer Vessel');
  });

  it('stop cleanly at a refused name, even with more files after it', async () => {
    const file = join(dir, 'bad2.vessel');
    writeFileSync(file, await zipOf({ '../first.txt': 'x', 'big.txt': 'y'.repeat(200_000), 'manifest.json': '{}' }));
    await expect(unzipTo(file, join(dir, 'inside2'))).rejects.toThrow('won’t unpack');
  });

  it('fail, rather than hang, on a file that was cut short', async () => {
    const { service } = setUp();
    const whole = join(dir, 'whole.vessel');
    await writeVesselFile(whole, request({ playlists: [service] }), 'Vessel test');
    const bytes = readFileSync(whole);
    const cut = join(dir, 'cut.vessel');
    writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
    const result = await Promise.race([unpackVesselFile(cut, join(dir, 'cut')).then(() => 'opened', () => 'failed'), new Promise((r) => setTimeout(() => r('hung'), 5000))]);
    expect(result).toBe('failed');
  });

  it('never unpack anything outside their folder', async () => {
    const file = join(dir, 'bad.vessel');
    writeFileSync(file, await zipOf({ 'manifest.json': '{}', '../escape.txt': 'x' }));
    await expect(unzipTo(file, join(dir, 'inside'))).rejects.toThrow('won’t unpack');
    expect(existsSync(join(dir, 'escape.txt'))).toBe(false);
  });
});

describe('Vessel files and songs already here', () => {
  it('use the same song and media already in the library instead of adding copies', async () => {
    const { songPath, picture, service } = setUp();
    // This computer already has that song (under another file name) and its picture, kept elsewhere.
    const mine = join(dir, 'here', 'Library', 'Samples');
    const myMedia = join(dir, 'here', 'Media', 'Samples');
    mkdirSync(mine, { recursive: true });
    mkdirSync(myMedia, { recursive: true });
    copyFileSync(picture, join(myMedia, 'sunrise.jpg'));
    const mySong = join(mine, 'Grace (ours).pro');
    writeFileSync(mySong, serializePresentation(relinkMedia(parsePresentation(readFileSync(songPath)), { [picture]: join(myMedia, 'sunrise.jpg') })));
    const file = join(dir, 'share.vessel');
    await writeVesselFile(file, request({ kind: 'service', playlists: [service] }), 'Vessel test');
    const unpacked = join(dir, 'unpacked');
    const read = await unpackVesselFile(file, unpacked);
    const songs = songIndex([mySong]);
    const preview = await previewOf('t', 'share.vessel', unpacked, read, { songNames: [], themes: [], songs });
    expect(preview.have.presentations).toEqual([true]);

    const to = { ...targets(), songs, existingMedia: [join(myMedia, 'sunrise.jpg')] };
    const report = await addFromUnpacked(unpacked, read, { presentations: [], playlists: [0], themes: [], media: true }, to);
    expect(report).toMatchObject({ presentations: 0, media: 0, playlists: 1, skipped: 2 });
    expect(report.mediaAdded).toEqual([]);
    expect(existsSync(join(to.libraryFolder, 'From Grace Church'))).toBe(false);
    expect(existsSync(to.mediaFolder)).toBe(false);
    expect(decodeService(readFileSync(report.playlist!), '').items[1]).toMatchObject({ path: mySong });
  });

  it('still add a song that was changed, beside the one here', async () => {
    const { songPath, service } = setUp();
    const mine = join(dir, 'mine.pro');
    const changed = parsePresentation(readFileSync(songPath));
    changed.name = 'Amazing Grace (our version)';
    writeFileSync(mine, serializePresentation(changed));
    const file = join(dir, 'share.vessel');
    await writeVesselFile(file, request({ playlists: [service] }), 'Vessel test');
    const read = await unpackVesselFile(file, join(dir, 'unpacked'));
    const report = await addFromUnpacked(join(dir, 'unpacked'), read, { presentations: [0], playlists: [], themes: [], media: true }, { ...targets(), songs: songIndex([mine]) });
    expect(report.presentations).toBe(1);
  });
});

describe('Vessel file manifests and themes from elsewhere', () => {
  it('keep only safe entries', () => {
    const m = readManifest({
      format: 'vessel',
      version: 1,
      kind: 'odd',
      title: 'x'.repeat(500),
      presentations: [{ file: 'presentations/a.pro', name: 'A', slides: 2 }, { file: '../a.pro', name: 'B' }, { file: '/etc/a', name: 'C' }, 'junk'],
      media: [{ file: 'media/1/a.jpg', name: 'a.jpg', kind: 'image' }, { file: 'media/../../x', name: 'x' }]
    })!;
    expect(m.kind).toBe('collection');
    expect(m.title.length).toBe(120);
    expect(m.presentations.map((p) => p.name)).toEqual(['A']);
    expect(m.media.map((p) => p.name)).toEqual(['a.jpg']);
    expect(m.playlists).toEqual([]);
    expect(readManifest({ format: 'other', version: 1 })).toBeNull();
  });

  it('clean themes: bad colours, sizes and fonts are replaced', () => {
    const t = cleanTheme({ ...theme(), id: '../x', color: 'red; background:url(x)', sizePt: 1e9, font: 'Arial<script>' })!;
    expect(t.color).toMatch(/^#[0-9a-f]{6,8}$/i);
    expect(t.sizePt).toBeLessThanOrEqual(300);
    expect(t.id).not.toContain('/');
    expect(t.font).not.toContain('<');
    expect(cleanTheme(null)).toBeNull();
    expect(cleanTheme({ name: '', font: 'Arial' })).toBeNull();
  });
});

/** A zip with these text files in it (names used as given, unsafe ones included). */
async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      chunks.push(chunk);
      if (final) resolve();
    });
    for (const [name, text] of Object.entries(files)) {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(new TextEncoder().encode(text), true);
    }
    zip.end();
  });
  return Buffer.concat(chunks);
}

describe('safe file names', () => {
  it('never name another folder, and suit Windows', async () => {
    const { safeFileName } = await import('../src/shared/vesselFile');
    expect(safeFileName('..', 'Vessel file')).toBe('Vessel file');
    expect(safeFileName('.', 'X')).toBe('X');
    expect(safeFileName('../../etc')).toBe('..-..-etc');
    expect(safeFileName('Sunday. ')).toBe('Sunday');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('a:b*c?')).toBe('a-b-c-');
  });
});
