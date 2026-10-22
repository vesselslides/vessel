import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyRestore, unpackBackup, writeBackup } from '../src/main/backupArchive';
import { cleanLowerThird, normalizeLowerThirds, rememberLowerThird } from '../src/shared/lowerThirds';
import { backgroundForPath, backgroundOfCue } from '../src/shared/pro/background';
import { setSlideBackground } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, serializePresentation } from '../src/shared/pro/presentation';
import { decodeService, encodeService } from '../src/shared/pro/service';
import type { Settings } from '../src/shared/types';
import { compareVersions, githubRepo, installerFor, parseRelease, shortNotes } from '../src/shared/updates';
import { clockPosition, hasEnded, pauseClock, playClock, positionIn, seekClock, startClock } from '../src/shared/videoClock';

describe('video clock', () => {
  const c = startClock('/v.mp4', 1_000);

  it('runs from the start and holds when paused', () => {
    expect(clockPosition(c, 4_000)).toBe(3);
    const paused = pauseClock(c, 4_000, 60, false);
    expect(paused.playing).toBe(false);
    expect(clockPosition(paused, 99_000)).toBe(3);
    const again = playClock(paused, 10_000, 60, false);
    expect(clockPosition(again, 12_000)).toBe(5);
  });

  it('wraps a loop and stops a one-off video at its end', () => {
    expect(positionIn(c, 26_000, 10, true)).toBe(5);
    expect(positionIn(c, 26_000, 10, false)).toBe(10);
    expect(hasEnded(c, 26_000, 10, false)).toBe(true);
    expect(hasEnded(c, 26_000, 10, true)).toBe(false);
    // Play on a finished video starts it again.
    expect(clockPosition(playClock(c, 26_000, 10, false), 26_000)).toBe(0);
    // An unknown length doesn't wrap or stop.
    expect(positionIn(c, 26_000, NaN, true)).toBe(25);
  });

  it('seeks within the video', () => {
    expect(clockPosition(seekClock(c, 42, 5_000, 30), 5_000)).toBe(30);
    expect(clockPosition(seekClock(c, -3, 5_000, 30), 5_000)).toBe(0);
    expect(clockPosition(seekClock(pauseClock(c, 2_000), 12, 5_000), 9_000)).toBe(12);
  });
});

describe('lower thirds', () => {
  it('tidies what is typed and needs a name', () => {
    expect(cleanLowerThird({ title: '  Pastor Sam ', subtitle: ' Lead Pastor ', color: '#123abc' })).toEqual({ title: 'Pastor Sam', subtitle: 'Lead Pastor', color: '#123abc' });
    expect(cleanLowerThird({ title: ' ', subtitle: 'x' })).toBeNull();
    expect(cleanLowerThird({ title: 'A', color: 'red' })?.color).toBe('#e0a526');
  });

  it('remembers each name once, newest first, with its latest colour', () => {
    let list = rememberLowerThird([], { title: 'Sam', subtitle: 'Pastor', color: '#111111' });
    list = rememberLowerThird(list, { title: 'Jo', subtitle: '', color: '#222222' });
    list = rememberLowerThird(list, { title: 'Sam', subtitle: 'Pastor', color: '#333333' });
    expect(list.map((l) => `${l.title}:${l.color}`)).toEqual(['Sam:#333333', 'Jo:#222222']);
    expect(normalizeLowerThirds([{ id: 'a', title: 'Ok', subtitle: '', color: '#000000' }, { id: 'b', title: '' }, 5])).toHaveLength(1);
  });
});

describe('update checks', () => {
  it('reads the repository field', () => {
    expect(githubRepo('github:church/vessel')).toBe('church/vessel');
    expect(githubRepo({ url: 'git+https://github.com/church/vessel.git' })).toBe('church/vessel');
    expect(githubRepo('church/vessel')).toBe('church/vessel');
    expect(githubRepo(undefined)).toBeNull();
    expect(githubRepo('https://gitlab.com/a/b')).toBeNull();
  });

  it('compares versions', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  const release = parseRelease({
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/church/vessel/releases/tag/v0.2.0',
    body: '## New\n**Lower thirds** and video controls',
    assets: [
      { name: 'Vessel-0.2.0-mac-arm64.dmg', browser_download_url: 'https://x/arm.dmg', size: 10 },
      { name: 'Vessel-0.2.0-mac-x64.dmg', browser_download_url: 'https://x/intel.dmg', size: 10 },
      { name: 'Vessel-0.2.0-win.exe', browser_download_url: 'https://x/win.exe', size: 10 },
      { name: 'Vessel-0.2.0-win-x64.exe', browser_download_url: 'https://x/win64.exe', size: 10 }
    ]
  })!;

  it('picks the installer for this computer', () => {
    expect(release.version).toBe('0.2.0');
    expect(installerFor(release, 'darwin', 'arm64')?.url).toBe('https://x/arm.dmg');
    expect(installerFor(release, 'darwin', 'x64')?.url).toBe('https://x/intel.dmg');
    expect(installerFor(release, 'win32', 'arm64')?.url).toBe('https://x/win.exe');
    expect(installerFor(release, 'linux', 'x64')).toBeNull();
    expect(shortNotes(release.notes)).toBe('New\nLower thirds and video controls');
  });

  it('ignores drafts and pre-releases', () => {
    expect(parseRelease({ tag_name: 'v9', draft: true })).toBeNull();
    expect(parseRelease({ tag_name: 'v9', prerelease: true })).toBeNull();
    expect(parseRelease('nope')).toBeNull();
  });
});

describe('backups', () => {
  const root = mkdtempSync(join(tmpdir(), 'vessel-backup-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const dir = (...p: string[]): string => {
    const d = join(root, ...p);
    mkdirSync(d, { recursive: true });
    return d;
  };

  // The computer the backup comes from.
  const old = { data: dir('old', 'data'), library: dir('old', 'Library'), playlists: dir('old', 'Playlists'), media: dir('old', 'Media') };
  const loop = join(old.media, 'Blue Loop.mp4');
  writeFileSync(loop, Buffer.alloc(200_000, 7));
  const song = (name: string, words: string, bg?: string) => {
    const p = createPresentation(name, parseLyrics(`[Verse 1]\n${words}`));
    return serializePresentation(bg ? setSlideBackground(p, p.cues[0].uuid!.string, backgroundForPath(bg)) : p);
  };
  writeFileSync(join(old.library, 'Amazing Grace.pro'), song('Amazing Grace', 'How sweet the sound', loop));
  dir('old', 'Library', 'Hymns');
  writeFileSync(join(old.library, 'Hymns', 'Be Thou My Vision.pro'), song('Be Thou My Vision', 'O Lord of my heart'));
  writeFileSync(
    join(old.playlists, 'Sunday.proPlaylist'),
    encodeService({ name: 'Sunday', items: [{ id: 'a', kind: 'presentation', name: 'Amazing Grace', path: join(old.library, 'Amazing Grace.pro') }] })
  );
  writeFileSync(join(old.data, 'settings.json'), JSON.stringify({ libraryFolder: old.library, playlistFolder: old.playlists, ccliLicence: '123456', outputDisplayId: 7, lastPlaylist: join(old.playlists, 'Sunday.proPlaylist') }));
  writeFileSync(join(old.data, 'media-bin.json'), JSON.stringify([{ id: 'm1', path: loop, name: 'Blue Loop', kind: 'video' }]));
  writeFileSync(join(old.data, 'themes.json'), JSON.stringify({ themes: ['from backup'] }));
  writeFileSync(join(old.data, 'ccli-usage.json'), JSON.stringify([{ title: 'Amazing Grace', date: '2026-10-18' }]));
  dir('old', 'data', 'bibles');
  writeFileSync(join(old.data, 'bibles', 'index.json'), JSON.stringify([{ id: 'kjv', name: 'KJV' }]));
  writeFileSync(join(old.data, 'bibles', 'kjv.json'), '{"books":[]}');

  // The new computer, which already has a different "Amazing Grace".
  const now = { data: dir('new', 'data'), library: dir('new', 'Library'), playlists: dir('new', 'Playlists'), media: join(root, 'new', 'Media', 'Restored') };
  writeFileSync(join(now.library, 'Amazing Grace.pro'), song('Amazing Grace', 'A different arrangement'));
  writeFileSync(join(now.data, 'ccli-usage.json'), JSON.stringify([{ title: 'Amazing Grace', date: '2026-10-18' }, { title: 'Other', date: '2026-10-11' }]));
  const mySettings: Settings = { libraryFolder: now.library, playlistFolder: now.playlists, extraFolders: [], outputDisplayId: 2 };

  it('writes everything into one file and puts it back on another computer', async () => {
    const file = join(root, 'Vessel Backup.vesselbackup');
    const manifest = await writeBackup(file, { dataFolder: old.data, libraryFolder: old.library, playlistFolder: old.playlists, media: [loop, '/gone.png'], appVersion: '0.1.0' });
    expect(manifest.counts).toEqual({ songs: 2, playlists: 1, bibles: 1, media: 1 });

    // On the other computer the video isn't at its old path.
    renameSync(loop, `${loop}.away`);
    const unpacked = join(root, 'unpacked');
    const read = await unpackBackup(file, unpacked);
    expect(read.counts).toEqual(manifest.counts);
    const report = await applyRestore(unpacked, read, { dataFolder: now.data, libraryFolder: now.library, playlistFolder: now.playlists, mediaFolder: now.media, settings: mySettings });

    expect(report).toMatchObject({ songs: 2, playlists: 1, bibles: 1, media: 1, renamed: ['Amazing Grace (backup).pro'] });
    // The song already here is untouched; the backup's comes in beside it, pointing at the restored video.
    const restoredLoop = join(now.media, 'Blue Loop.mp4');
    expect(readFileSync(restoredLoop).length).toBe(200_000);
    expect(parsePresentation(readFileSync(join(now.library, 'Amazing Grace.pro'))).cues).toHaveLength(1);
    const theirs = parsePresentation(readFileSync(join(now.library, 'Amazing Grace (backup).pro')));
    expect(backgroundOfCue(theirs.cues[0])?.path).toBe(restoredLoop);
    expect(existsSync(join(now.library, 'Hymns', 'Be Thou My Vision.pro'))).toBe(true);
    // The playlist points at the songs on this computer.
    const sunday = decodeService(readFileSync(join(now.playlists, 'Sunday.proPlaylist')), 'Sunday');
    expect(sunday.items[0]).toMatchObject({ kind: 'presentation', path: join(now.library, 'Amazing Grace (backup).pro') });
    // Data: media bin re-pointed, CCLI log merged without doubles, Bible added, themes from the backup.
    expect(JSON.parse(readFileSync(join(now.data, 'media-bin.json'), 'utf8'))[0].path).toBe(restoredLoop);
    expect(JSON.parse(readFileSync(join(now.data, 'ccli-usage.json'), 'utf8'))).toHaveLength(2);
    expect(existsSync(join(now.data, 'bibles', 'kjv.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(now.data, 'themes.json'), 'utf8')).themes).toEqual(['from backup']);
    // Settings: the backup's, but this computer's folders and screens.
    expect(report.settings).toMatchObject({ ccliLicence: '123456', libraryFolder: now.library, playlistFolder: now.playlists, outputDisplayId: 2, lastPlaylist: join(now.playlists, 'Sunday.proPlaylist') });

    // Restoring the same backup again adds nothing new.
    const again = await applyRestore(unpacked, read, { dataFolder: now.data, libraryFolder: now.library, playlistFolder: now.playlists, mediaFolder: now.media, settings: report.settings });
    expect(again).toMatchObject({ songs: 0, playlists: 0, bibles: 0, renamed: [] });

    // Restoring onto the computer it came from copies no media: the files are still there.
    renameSync(`${loop}.away`, loop);
    const home = await applyRestore(unpacked, read, { dataFolder: old.data, libraryFolder: old.library, playlistFolder: old.playlists, mediaFolder: join(root, 'old', 'Restored'), settings: mySettings });
    expect(home).toMatchObject({ songs: 0, playlists: 0, media: 0, renamed: [] });
    expect(existsSync(join(root, 'old', 'Restored'))).toBe(false);
  });

  it("refuses a file that isn't a backup", async () => {
    const fake = join(root, 'fake.vesselbackup');
    writeFileSync(fake, 'hello');
    await expect(unpackBackup(fake, join(root, 'fake'))).rejects.toThrow(/isn’t a Vessel backup/);
  });
});
