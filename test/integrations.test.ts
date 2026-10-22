import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { normalizeNdi } from '../src/shared/ndi';
import { findLibrarySong, lyricsToSongText, parseCopyright, parsePlanItems, parsePlans, parseServiceTypes, planName, songKey } from '../src/shared/planningCenter';
import { applyLyrics } from '../src/shared/pro/edit';
import { createPresentation, presentationToDeck } from '../src/shared/pro/presentation';
import type { LibraryItem } from '../src/shared/types';

// The main-process modules import Electron; the parts tested here don't use it.
vi.mock('electron', () => ({ app: { getPath: () => '' }, net: {}, safeStorage: {}, BrowserWindow: class {} }));
const { pcoGet } = await import('../src/main/planningCenter');
const { unpremultiply } = await import('../src/main/ndi');

// A made-up plan, shaped like Planning Center's JSON:API replies.
const ITEMS = {
  data: [
    { id: '3', type: 'Item', attributes: { title: 'Morning Light', item_type: 'song', sequence: 3 }, relationships: { song: { data: { type: 'Song', id: 's2' } }, arrangement: { data: { type: 'Arrangement', id: 'a2' } } } },
    { id: '1', type: 'Item', attributes: { title: 'Worship', item_type: 'header', sequence: 1 }, relationships: {} },
    { id: '2', type: 'Item', attributes: { title: 'Amazing Grace (Live)', item_type: 'song', sequence: 2 }, relationships: { song: { data: { type: 'Song', id: 's1' } }, arrangement: { data: null } } },
    { id: '4', type: 'Item', attributes: { title: 'Sermon', item_type: 'item', sequence: 4 }, relationships: {} }
  ],
  included: [
    { id: 's1', type: 'Song', attributes: { title: 'Amazing Grace', ccli_number: 22025, author: 'John Newton', copyright: 'Public Domain' } },
    { id: 's2', type: 'Song', attributes: { title: 'Morning Light', ccli_number: 1234567, author: 'A. Writer', copyright: '© 2019 Example Music' } },
    { id: 'a2', type: 'Arrangement', attributes: { name: 'Default', lyrics: 'VERSE 1\nFirst light\nOn the hills\n\nCHORUS\nSing out\n\nVERSE 2\nEvening falls', sequence: ['Verse 1', 'Chorus', 'Verse 2', 'Chorus'] } }
  ]
};

describe('Planning Center plans', () => {
  it('reads service types, plans and items in order with their songs', () => {
    expect(parseServiceTypes({ data: [{ id: '10', type: 'ServiceType', attributes: { name: 'Sunday Morning' } }] })).toEqual([{ id: '10', name: 'Sunday Morning' }]);
    const [plan] = parsePlans({ data: [{ id: '99', type: 'Plan', attributes: { title: 'Harvest', dates: 'October 26, 2026', sort_date: '2026-10-26T09:00:00Z', items_count: 4 } }] });
    expect(planName(plan)).toBe('Harvest · October 26, 2026');
    expect(planName({ ...plan, title: '' })).toBe('October 26, 2026');
    const items = parsePlanItems(ITEMS);
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['header', 'Worship'],
      ['song', 'Amazing Grace (Live)'],
      ['song', 'Morning Light'],
      ['other', 'Sermon']
    ]);
    expect(items[1].song).toMatchObject({ title: 'Amazing Grace', ccli: 22025, arrangement: '', lyrics: '' });
    expect(items[2].song).toMatchObject({ arrangement: 'Default', sequence: ['Verse 1', 'Chorus', 'Verse 2', 'Chorus'] });
    expect(parsePlanItems({ nope: 1 })).toEqual([]);
  });

  it('finds songs already in the library by title', () => {
    const lib = (name: string): LibraryItem => ({ path: `/lib/${name}.pro`, name, modified: 0, slides: 1, search: '' });
    const library = [lib('Amazing Grace'), lib('How Great Thou Art')];
    const [, grace, morning] = parsePlanItems(ITEMS);
    expect(findLibrarySong(grace, library)?.path).toBe('/lib/Amazing Grace.pro');
    expect(findLibrarySong(morning, library)).toBeNull();
    expect(songKey('Ámazing  Grace (Live at Home)!')).toBe('amazing grace');
    expect(songKey('Holy & Anointed')).toBe('holy and anointed');
  });

  it('turns Planning Center lyrics into a song in the arrangement’s order', () => {
    const morning = parsePlanItems(ITEMS)[2].song!;
    const text = lyricsToSongText(morning.lyrics, morning.sequence);
    expect(text).toBe('[Verse 1]\nFirst light\nOn the hills\n\n[Chorus]\nSing out\n\n[Verse 2]\nEvening falls\n\n[Chorus]');
    const deck = presentationToDeck(applyLyrics(createPresentation('Morning Light', []), text), 'd');
    expect(deck.groups.map((g) => g.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(deck.slides.map((s) => s.text)).toEqual(['First light\nOn the hills', 'Sing out', 'Evening falls', 'Sing out']);
    // An order naming a section that isn't in the lyrics is ignored.
    expect(lyricsToSongText(morning.lyrics, ['Bridge'])).toBe('[Verse 1]\nFirst light\nOn the hills\n\n[Chorus]\nSing out\n\n[Verse 2]\nEvening falls');
    expect(parseCopyright('© 2019 Example Music')).toEqual({ year: 2019, publisher: 'Example Music' });
    expect(parseCopyright('Public Domain')).toEqual({ year: 0, publisher: 'Public Domain' });
  });

  describe('talking to the API', () => {
    let server: Server;
    let base = '';
    const seen: Array<{ url: string; auth: string }> = [];
    beforeAll(async () => {
      server = createServer((req, res) => {
        seen.push({ url: req.url ?? '', auth: req.headers.authorization ?? '' });
        if (req.headers.authorization !== `Basic ${Buffer.from('test-app:test-secret').toString('base64')}`) return res.writeHead(401).end();
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: { attributes: { name: 'Test Church' } } }));
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('signs in with the token and says plainly when it is wrong', async () => {
      const org = await pcoGet('/services/v2', { appId: 'test-app', secret: 'test-secret' }, base, fetch);
      expect(org).toEqual({ data: { attributes: { name: 'Test Church' } } });
      expect(seen[0].url).toBe('/services/v2');
      await expect(pcoGet('/services/v2', { appId: 'test-app', secret: 'wrong' }, base, fetch)).rejects.toThrow(/didn’t accept/);
    });
  });
});

describe('NDI output', () => {
  it('fills in settings and keeps the source name tidy', () => {
    expect(normalizeNdi(undefined)).toEqual({ enabled: false, name: 'Vessel Stream', resolution: '1080p', transparent: true });
    expect(normalizeNdi({ enabled: true, name: ' Main <Hall> ', resolution: '720p', transparent: false })).toEqual({ enabled: true, name: 'Main Hall', resolution: '720p', transparent: false });
  });

  it('turns premultiplied pixels into plain colour', () => {
    // BGRA: see-through, half see-through grey, solid red.
    const px = new Uint8Array([0, 0, 0, 0, 64, 64, 64, 128, 0, 0, 255, 255]);
    unpremultiply(px);
    expect([...px]).toEqual([0, 0, 0, 0, 128, 128, 128, 128, 0, 0, 255, 255]);
  });
});
