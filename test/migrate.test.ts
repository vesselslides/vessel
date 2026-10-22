import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateFromLumen } from '../src/main/migrate';
import { backgroundForPath, backgroundOfCue } from '../src/shared/pro/background';
import { setSlideBackground } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, serializePresentation } from '../src/shared/pro/presentation';
import { decodeService, encodeService } from '../src/shared/pro/service';

/** A fake Lumen install: Documents/Lumen with a song, a playlist and imported media, plus old app settings. */
function lumenInstall() {
  const root = mkdtempSync(join(tmpdir(), 'vessel-migrate-'));
  const docs = join(root, 'Documents');
  const oldDocs = join(docs, 'Lumen');
  const oldUserData = join(root, 'AppSupport', 'Lumen');
  const media = join(oldDocs, 'Imported Media', 'Marble', 'bg.jpg');
  for (const d of [join(oldDocs, 'Library'), join(oldDocs, 'Playlists'), join(oldDocs, 'Imported Media', 'Marble'), oldUserData]) mkdirSync(d, { recursive: true });
  writeFileSync(media, 'jpg');

  let song = createPresentation('Grace', parseLyrics('One\n\nTwo'));
  song = setSlideBackground(song, song.cues[0].uuid!.string, backgroundForPath(media));
  const songPath = join(oldDocs, 'Library', 'Grace.pro');
  writeFileSync(songPath, serializePresentation(song));
  const elsewhere = '/Users/me/Elsewhere/Other.pro';
  const playlistPath = join(oldDocs, 'Playlists', 'Sunday.proPlaylist');
  writeFileSync(
    playlistPath,
    encodeService({
      name: 'Sunday',
      items: [
        { id: 'a', kind: 'header', name: 'Worship', color: '#336699' },
        { id: 'b', kind: 'presentation', name: 'Grace', path: songPath },
        { id: 'c', kind: 'presentation', name: 'Other', path: elsewhere }
      ]
    })
  );
  writeFileSync(
    join(oldUserData, 'settings.json'),
    JSON.stringify({ libraryFolder: join(oldDocs, 'Library'), playlistFolder: join(oldDocs, 'Playlists'), extraFolders: ['/Users/me/ProPresenter'], lastPlaylist: playlistPath, transitionMs: 1000 })
  );
  writeFileSync(join(oldUserData, 'themes.json'), JSON.stringify({ custom: [], defaultId: 'bold-caps' }));
  writeFileSync(join(oldUserData, 'media-bin.json'), JSON.stringify([{ id: '1', path: media, name: 'bg.jpg', kind: 'image' }, { id: '2', path: '/Users/me/Movies/loop.mp4', name: 'loop.mp4', kind: 'video' }]));
  const paths = { oldDocs, newDocs: join(docs, 'Vessel'), oldUserData, newUserData: join(root, 'AppSupport', 'Vessel') };
  return { paths, elsewhere };
}

describe('migration from Lumen to Vessel', () => {
  it('moves the folder and repoints settings, media bin, playlists and song backgrounds', async () => {
    const { paths: p, elsewhere } = lumenInstall();
    const report = await migrateFromLumen(p);
    expect(report).toEqual({ movedDocuments: true, copiedSettings: ['settings.json', 'themes.json', 'media-bin.json'], updatedPlaylists: 1, updatedSongs: 1 });
    expect(existsSync(p.oldDocs)).toBe(false);
    expect(existsSync(join(p.newDocs, 'Library', 'Grace.pro'))).toBe(true);

    const settings = JSON.parse(readFileSync(join(p.newUserData, 'settings.json'), 'utf8'));
    expect(settings).toEqual({
      libraryFolder: join(p.newDocs, 'Library'),
      playlistFolder: join(p.newDocs, 'Playlists'),
      extraFolders: ['/Users/me/ProPresenter'],
      lastPlaylist: join(p.newDocs, 'Playlists', 'Sunday.proPlaylist'),
      transitionMs: 1000
    });
    expect(JSON.parse(readFileSync(join(p.newUserData, 'themes.json'), 'utf8')).defaultId).toBe('bold-caps');
    expect(JSON.parse(readFileSync(join(p.newUserData, 'media-bin.json'), 'utf8')).map((i: { path: string }) => i.path)).toEqual([
      join(p.newDocs, 'Imported Media', 'Marble', 'bg.jpg'),
      '/Users/me/Movies/loop.mp4'
    ]);

    const service = decodeService(new Uint8Array(readFileSync(join(p.newDocs, 'Playlists', 'Sunday.proPlaylist'))), '');
    expect(service.items.map((i) => (i.kind === 'presentation' ? i.path : i.name))).toEqual(['Worship', join(p.newDocs, 'Library', 'Grace.pro'), elsewhere]);

    const song = parsePresentation(new Uint8Array(readFileSync(join(p.newDocs, 'Library', 'Grace.pro'))));
    expect(backgroundOfCue(song.cues[0])?.path).toBe(join(p.newDocs, 'Imported Media', 'Marble', 'bg.jpg'));
    // The old settings stay behind as a backup.
    expect(existsSync(join(p.oldUserData, 'settings.json'))).toBe(true);
  });

  it('does nothing the second time', async () => {
    const { paths: p } = lumenInstall();
    await migrateFromLumen(p);
    expect(await migrateFromLumen(p)).toEqual({ movedDocuments: false, copiedSettings: [], updatedPlaylists: 0, updatedSongs: 0 });
  });

  it("never overwrites an existing Vessel folder or settings", async () => {
    const { paths: p } = lumenInstall();
    mkdirSync(p.newDocs, { recursive: true });
    mkdirSync(p.newUserData, { recursive: true });
    writeFileSync(join(p.newUserData, 'settings.json'), '{"mine":true}');
    const report = await migrateFromLumen(p);
    expect(report.movedDocuments).toBe(false);
    expect(report.copiedSettings).toEqual(['themes.json', 'media-bin.json']);
    expect(existsSync(p.oldDocs)).toBe(true);
    expect(readFileSync(join(p.newUserData, 'settings.json'), 'utf8')).toBe('{"mine":true}');
  });

  it('is a no-op on a fresh install', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vessel-fresh-'));
    const p = { oldDocs: join(root, 'D', 'Lumen'), newDocs: join(root, 'D', 'Vessel'), oldUserData: join(root, 'A', 'Lumen'), newUserData: join(root, 'A', 'Vessel') };
    expect(await migrateFromLumen(p)).toEqual({ movedDocuments: false, copiedSettings: [], updatedPlaylists: 0, updatedSongs: 0 });
    expect(existsSync(p.newDocs)).toBe(false);
  });
});
