import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS, exportSong, exportText, imageNames, orderLine, withCarriedBackgrounds, type ExportEntry } from '../src/shared/exports';
import { backgroundForPath } from '../src/shared/pro/background';
import { setSlideBackground } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { mediaPathsOf, relinkMedia } from '../src/shared/pro/relink';
import { songIndex } from '../src/main/songIndex';
import { decodeService, encodeService, type Service } from '../src/shared/pro/service';
import { cleanTheme } from '../src/shared/theme';
import { mergeGallery, readGalleryIndex, STARTER_GALLERY, submitUrl } from '../src/shared/themeGallery';
import { bundlePath, unbundlePlaylist, writePlaylistBundle } from '../src/main/playlistBundle';
import type { SlideView } from '../src/shared/types';

const deckOf = (lyrics: string, name = 'Song') => presentationToDeck(createPresentation(name, parseLyrics(lyrics)), 'd');
const LYRICS = '[Verse 1]\nV1 a\n\nV1 b\n\n[Chorus]\nC a\n\n[Verse 2]\nV2 a';

describe('exporting songs', () => {
  it('lists each group once, with the order they come up in', () => {
    const song = exportSong(deckOf(LYRICS, 'Grace'), '“Grace” CCLI Licence #1');
    expect(song.sections.map((s) => [s.name, s.slides])).toEqual([
      ['Verse 1', ['V1 a', 'V1 b']],
      ['Chorus', ['C a']],
      ['Verse 2', ['V2 a']]
    ]);
    expect(song.order).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(song.slides).toHaveLength(4);
    expect(orderLine(['Verse 1', 'Chorus', 'Chorus', 'Verse 2', 'Chorus'])).toBe('Verse 1, Chorus ×2, Verse 2, Chorus');
  });

  it('keeps a background up until another replaces it, like the screen', () => {
    const bg = backgroundForPath('/m/a.jpg')!;
    const other = backgroundForPath('/m/b.mp4')!;
    const s = (id: string, background?: SlideView['background']): SlideView => ({ id, background }) as SlideView;
    expect(withCarriedBackgrounds([s('1'), s('2', bg), s('3'), s('4', other), s('5')]).map((x) => x.background?.path)).toEqual([
      undefined,
      '/m/a.jpg',
      '/m/a.jpg',
      '/m/b.mp4',
      '/m/b.mp4'
    ]);
  });

  it('writes a service as plain text with headers, the order and the CCLI line', () => {
    const entries: ExportEntry[] = [{ kind: 'header', name: 'Worship' }, exportSong(deckOf(LYRICS, 'Grace'), '“Grace” CCLI Licence #1'), exportSong(deckOf('Only line', 'Short'), '')];
    const text = exportText({ title: 'Sunday', entries, options: DEFAULT_EXPORT_OPTIONS });
    expect(text).toContain('Sunday\n======');
    expect(text).toContain('--- Worship ---');
    expect(text).toContain('Grace\n-----\n\n[Verse 1]\nV1 a\n\nV1 b\n\n[Chorus]\nC a');
    expect(text).toContain('“Grace” CCLI Licence #1');
    const plain = exportText({ title: 'Grace', entries: [entries[1]], options: { ...DEFAULT_EXPORT_OPTIONS, copyright: false } });
    expect(plain.startsWith('Grace\n-----')).toBe(true);
    expect(plain).not.toContain('CCLI');
  });

  it('names pictures by slide and group, a folder per song for a service', () => {
    const one = exportSong(deckOf(LYRICS, 'Grace'), '');
    expect(imageNames({ entries: [one], options: DEFAULT_EXPORT_OPTIONS })).toEqual([['01 Verse 1.png', '02 Verse 1.png', '03 Chorus.png', '04 Verse 2.png']]);
    const two = exportSong(deckOf('x', 'A/B: song?'), '');
    const names = imageNames({ entries: [{ kind: 'header', name: 'H' }, one, two], options: { ...DEFAULT_EXPORT_OPTIONS, imageFormat: 'jpeg' } });
    expect(names[0][0]).toBe('01 Grace/01 Verse 1.jpg');
    expect(names[1][0]).toMatch(/^02 A-B- song-\/01 .+\.jpg$/);
  });
});

describe('playlists with media', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vessel-bundle-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('store files under their paths without the leading slash or drive colon', () => {
    expect(bundlePath('/Users/me/Song.pro')).toBe('Users/me/Song.pro');
    expect(bundlePath('C:\\Media\\a b.mp4')).toBe('C/Media/a b.mp4');
  });

  it('carry a service with its songs and media to another computer', async () => {
    const src = join(dir, 'church');
    mkdirSync(src);
    const picture = join(src, 'dawn.jpg');
    writeFileSync(picture, Buffer.alloc(500, 3));
    let song = createPresentation('Grace', parseLyrics(LYRICS));
    song = setSlideBackground(song, song.cues[0].uuid!.string, backgroundForPath(picture));
    const songPath = join(src, 'Grace.pro');
    writeFileSync(songPath, serializePresentation(song));
    const service: Service = {
      name: 'Sunday',
      items: [
        { id: 'h', kind: 'header', name: 'Worship', color: '#2170d9' },
        { id: 's', kind: 'presentation', name: 'Grace', path: songPath },
        { id: 'm', kind: 'presentation', name: 'Missing', path: join(src, 'Missing.pro') }
      ]
    };
    const file = join(dir, 'Sunday.proPlaylist');
    const { files, missing } = await writePlaylistBundle(file, service);
    expect(files).toBe(2);
    expect(missing).toEqual(['Missing.pro']);
    const zipped = unzipSync(readFileSync(file));
    expect(Object.keys(zipped).sort()).toEqual(['data', bundlePath(picture), bundlePath(songPath)].sort());
    // A plain playlist reader sees the running order as it was.
    expect(decodeService(readFileSync(file), '').items.map((it) => it.name)).toEqual(['Worship', 'Grace', 'Missing']);

    // On another computer, the originals aren't there.
    rmSync(src, { recursive: true });
    const to = { libraryFolder: join(dir, 'Library'), mediaRoot: join(dir, 'Media') };
    const opened = await unbundlePlaylist(file, join(dir, 'scratch'), to);
    expect(opened).toMatchObject({ songs: 1, name: 'Sunday' });
    expect(existsSync(join(dir, 'scratch'))).toBe(false);
    const addedSong = join(to.libraryFolder, 'Sunday', 'Grace.pro');
    const addedPicture = join(to.mediaRoot, 'Sunday', 'dawn.jpg');
    expect(opened!.media).toEqual([addedPicture]);
    expect(mediaPathsOf(parsePresentation(readFileSync(addedSong)))).toEqual([addedPicture]);
    const items = decodeService(opened!.bytes, '').items;
    expect(items[1]).toMatchObject({ kind: 'presentation', path: addedSong });

    // Opening it again adds nothing new.
    const again = await unbundlePlaylist(file, join(dir, 'scratch'), to);
    expect(again).toMatchObject({ songs: 0 });
  });

  it('use songs and media already here instead of copying them again', async () => {
    const src = join(dir, 'church');
    mkdirSync(src);
    const picture = join(src, 'dawn.jpg');
    writeFileSync(picture, Buffer.alloc(500, 3));
    let song = createPresentation('Grace', parseLyrics(LYRICS));
    song = setSlideBackground(song, song.cues[0].uuid!.string, backgroundForPath(picture));
    const songPath = join(src, 'Grace.pro');
    writeFileSync(songPath, serializePresentation(song));
    const file = join(dir, 'Sunday.proPlaylist');
    await writePlaylistBundle(file, { name: 'Sunday', items: [{ id: 's', kind: 'presentation', name: 'Grace', path: songPath }] });
    // This computer has the same song and picture, in its own folders.
    const mine = join(dir, 'mine');
    mkdirSync(mine);
    writeFileSync(join(mine, 'dawn.jpg'), Buffer.alloc(500, 3));
    writeFileSync(join(mine, 'Grace here.pro'), serializePresentation(relinkMedia(song, { [picture]: join(mine, 'dawn.jpg') })));
    rmSync(src, { recursive: true });
    const to = { libraryFolder: join(dir, 'Library'), mediaRoot: join(dir, 'Media'), songs: songIndex([join(mine, 'Grace here.pro')]), existingMedia: [join(mine, 'dawn.jpg')] };
    const opened = await unbundlePlaylist(file, join(dir, 'scratch'), to);
    expect(opened).toMatchObject({ songs: 0, media: [] });
    expect(existsSync(to.libraryFolder)).toBe(false);
    expect(decodeService(opened!.bytes, '').items[0]).toMatchObject({ path: join(mine, 'Grace here.pro') });
  });

  it('find bundled songs by name when the layout inside is different', async () => {
    const song = serializePresentation(createPresentation('Grace', parseLyrics('Hi')));
    const { data } = unzipSync(encodeService({ name: 'Other', items: [{ id: 's', kind: 'presentation', name: 'Grace', path: '/Elsewhere/Library/Grace.pro' }] }));
    const file = join(dir, 'Other.proPlaylist');
    writeFileSync(file, zipSync({ data, 'Presentations/Grace.pro': song }));
    const opened = await unbundlePlaylist(file, join(dir, 'scratch'), { libraryFolder: join(dir, 'Library'), mediaRoot: join(dir, 'Media') });
    expect(opened?.songs).toBe(1);
    expect(decodeService(opened!.bytes, '').items[0]).toMatchObject({ path: join(dir, 'Library', 'Other', 'Grace.pro') });
  });

  it('leave a playlist with nothing inside to be read as it is', async () => {
    const file = join(dir, 'Plain.proPlaylist');
    writeFileSync(file, encodeService({ name: 'Plain', items: [] }));
    expect(await unbundlePlaylist(file, join(dir, 'scratch'), { libraryFolder: dir, mediaRoot: dir })).toBeNull();
  });
});

describe('theme gallery', () => {
  it('starter themes are valid as they are', () => {
    for (const e of STARTER_GALLERY) {
      const clean = cleanTheme(e.theme)!;
      expect(clean.id).toBe(e.theme.id);
      expect(clean.sizePt).toBe(e.theme.sizePt);
      expect(clean.color).toBe(e.theme.color);
    }
    expect(new Set(STARTER_GALLERY.map((e) => e.theme.id)).size).toBe(STARTER_GALLERY.length);
  });

  it('reads the online list, leaving out anything unsafe or broken', () => {
    const good = { ...STARTER_GALLERY[0].theme, id: 'church-a', name: 'Church A' };
    const list = readGalleryIndex({
      themes: [
        { theme: good, author: 'Grace', tags: ['Lyrics', 7], backdrop: 'linear-gradient(135deg, #111, #222)' },
        { theme: { ...good, id: 'church-b', name: 'B' }, backdrop: 'linear-gradient(red, url(x.png))' },
        { theme: { ...good, id: 'church-a' } },
        { theme: { name: '' } },
        'junk'
      ]
    });
    expect(list.map((e) => e.theme.id)).toEqual(['church-a', 'church-b']);
    expect(list[0]).toMatchObject({ author: 'Grace', tags: ['Lyrics'], source: 'community' });
    expect(list[1].backdrop).not.toContain('url');
    expect(list[1].author).toBe('Anonymous');
    expect(readGalleryIndex(null)).toEqual([]);
    expect(mergeGallery(STARTER_GALLERY, [{ ...list[0], theme: STARTER_GALLERY[0].theme }, list[0]]).length).toBe(STARTER_GALLERY.length + 1);
  });

  it('submits a theme as a prefilled GitHub issue', () => {
    const url = new URL(submitUrl('vessel/vessel', { theme: STARTER_GALLERY[1].theme, author: 'Grace', description: 'Hymns' }));
    expect(url.origin + url.pathname).toBe('https://github.com/vessel/vessel/issues/new');
    expect(url.searchParams.get('title')).toBe('Theme: Hymnal');
    const json = /```json\n([\s\S]+)\n```/.exec(url.searchParams.get('body')!)![1];
    expect(cleanTheme(JSON.parse(json))?.name).toBe('Hymnal');
    expect(JSON.parse(json).builtIn).toBeUndefined();
  });
});
