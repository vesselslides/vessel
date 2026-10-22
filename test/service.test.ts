import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parsePlaylistFile, playlistViews } from '../src/shared/pro/playlist';
import { decodeService, encodeService, moveItem, type Service } from '../src/shared/pro/service';

const service: Service = {
  name: 'Sunday 9am',
  items: [
    { id: 'H1', kind: 'header', name: 'Welcome', color: '#3366cc' },
    { id: 'P1', kind: 'presentation', name: 'Amazing Grace', path: '/Users/me/Documents/Vessel/Library/Amazing Grace.pro', arrangementName: 'Short' },
    { id: 'P2', kind: 'presentation', name: 'How Great', path: 'C:/Users/me/Documents/Vessel/Library/How Great.pro' }
  ]
};

describe('service playlists', () => {
  it('round-trips through a .proPlaylist file', () => {
    expect(decodeService(encodeService(service), 'x')).toEqual(service);
  });

  it('is a zip with a ProPresenter PlaylistDocument in "data"', () => {
    const bytes = encodeService(service);
    expect(Object.keys(unzipSync(bytes))).toEqual(['data']);
    const views = playlistViews(parsePlaylistFile(bytes).document);
    expect(views).toHaveLength(1);
    expect(views[0].entries.map((e) => [e.kind, e.name])).toEqual([
      ['header', 'Welcome'],
      ['presentation', 'Amazing Grace'],
      ['presentation', 'How Great']
    ]);
  });

  it('keeps an empty service', () => {
    expect(decodeService(encodeService({ name: 'Empty', items: [] }), 'x')).toEqual({ name: 'Empty', items: [] });
  });

  it('moves items like drag and drop', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 4)).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('moveItem to the end', () => {
  it('treats Infinity as "append"', () => {
    expect(moveItem(['a', 'b', 'c'], 0, Infinity)).toEqual(['b', 'c', 'a']);
  });
});
