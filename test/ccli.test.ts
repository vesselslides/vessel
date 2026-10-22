import { describe, expect, it } from 'vitest';
import { copyrightLine, hasCopyrightDetails, isScripture, reportCsv, showsCopyright, songInfoOf, usageReport, withSongInfo, type UsageEntry } from '../src/shared/ccli';
import { DEFAULT_LYRICS_OPTIONS, lyricsToPresentation } from '../src/shared/import/lyrics';
import { createPresentation, parseLyrics, parsePresentation, serializePresentation } from '../src/shared/pro/presentation';

const info = { title: 'Made Up Song', authors: 'A. Writer, B. Writer', publisher: 'Example Music', year: 2020, songNumber: 1234567, display: true };

describe('copyright line', () => {
  it('reads like the usual CCLI acknowledgement, leaving out what is unknown', () => {
    expect(copyrightLine(info, '98765')).toBe('“Made Up Song” · Words and music by A. Writer, B. Writer · © 2020 Example Music · CCLI Song # 1234567 · CCLI Licence # 98765');
    expect(copyrightLine({ ...info, authors: '', year: 0, songNumber: 0 }, '')).toBe('“Made Up Song” · © Example Music');
    expect(hasCopyrightDetails({ ...info, authors: '', publisher: '', year: 0, songNumber: 0 })).toBe(false);
  });

  it('shows on the chosen slides only', () => {
    expect([0, 1, 2].map((i) => showsCopyright('first', i, 3))).toEqual([true, false, false]);
    expect([0, 1, 2].map((i) => showsCopyright('last', i, 3))).toEqual([false, false, true]);
    expect([0, 1, 2].map((i) => showsCopyright('both', i, 3))).toEqual([true, false, true]);
    expect([0, 1, 2].map((i) => showsCopyright('off', i, 3))).toEqual([false, false, false]);
  });
});

describe('song info', () => {
  it('is saved in the .pro file the way ProPresenter keeps it', () => {
    const p = parsePresentation(serializePresentation(withSongInfo(createPresentation('Made Up Song', parseLyrics('One')), info)));
    expect(songInfoOf(p)).toEqual(info);
    expect(p.ccli).toMatchObject({ songTitle: 'Made Up Song', author: 'A. Writer, B. Writer', songNumber: 1234567, display: true });
  });

  it('comes from imported lyrics, switched on for the copyright line', () => {
    const { presentation } = lyricsToPresentation('S', 'Line one\n\nCCLI Song # 7654321\n© 2019 Example Music', DEFAULT_LYRICS_OPTIONS);
    expect(songInfoOf(presentation)).toMatchObject({ songNumber: 7654321, year: 2019, publisher: 'Example Music', display: true });
  });

  it('knows scripture is not a song', async () => {
    const { parseBibleXml } = await import('../src/shared/bible/formats');
    const { lookUp } = await import('../src/shared/bible/reference');
    const { passageToPresentation, DEFAULT_SCRIPTURE_OPTIONS } = await import('../src/shared/bible/slides');
    const { BUILT_IN_THEMES } = await import('../src/shared/theme');
    const bible = parseBibleXml('<XMLBIBLE biblename="T"><BIBLEBOOK bnumber="43" bname="John"><CHAPTER cnumber="1"><VERS vnumber="1">Made up.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>', 't.xml');
    const passage = lookUp(bible, 'John 1:1');
    if (!passage || 'error' in passage) throw new Error('no passage');
    const p = passageToPresentation(passage, { abbreviation: 'T', bookNames: () => 'John', oneChapter: () => false }, BUILT_IN_THEMES[0], DEFAULT_SCRIPTURE_OPTIONS);
    expect(isScripture(p)).toBe(true);
    expect(isScripture(createPresentation('Song', parseLyrics('One')))).toBe(false);
  });
});

describe('usage report', () => {
  const e = (date: string, title: string, songNumber = 0): UsageEntry => ({ date, title, songNumber, authors: '', publisher: '' });
  const log = [
    e('2026-09-06', 'Song A', 111),
    e('2026-09-06', 'Song A', 111),
    e('2026-09-13', 'Song A', 111),
    e('2026-09-13', 'Song B', 222),
    e('2026-09-13', 'Notices'),
    e('2026-10-04', 'Song B', 222),
    e('2026-12-01', 'Song A', 111)
  ];

  it('counts each song once a day, within the dates, most used first', () => {
    const { songs, missingNumbers } = usageReport(log, '2026-09-01', '2026-10-31');
    expect(songs.map((r) => [r.songNumber, r.uses, r.lastUsed])).toEqual([
      [111, 2, '2026-09-13'],
      [222, 2, '2026-10-04']
    ]);
    expect(missingNumbers.map((r) => r.title)).toEqual(['Notices']);
  });

  it('writes a CSV that keeps commas and quotes inside titles', () => {
    const csv = reportCsv([{ title: 'Holy, "Holy"', songNumber: 5, authors: 'X', publisher: '', uses: 1, lastUsed: '2026-09-06' }], '2026-09-01', '2026-09-30', '98765');
    expect(csv.split('\n')).toEqual([
      'CCLI usage report 2026-09-01 to 2026-09-30, licence 98765',
      'CCLI Song #,Title,Authors,Publisher,Times used,Last used',
      '5,"Holy, ""Holy""",X,,1,2026-09-06',
      ''
    ]);
  });
});
