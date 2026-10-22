import { describe, expect, it } from 'vitest';
import { canonBook, normalizeBookName } from '../src/shared/bible/books';
import { parseBibleXml, verseCount, type Bible } from '../src/shared/bible/formats';
import { findBook, lookUp, searchBible, type Passage } from '../src/shared/bible/reference';
import { passageToPresentation, slideVerses, verseText } from '../src/shared/bible/slides';
import { presentationToDeck } from '../src/shared/pro/presentation';
import { BUILT_IN_THEMES } from '../src/shared/theme';

// A tiny made-up "Bible": three books with a few chapters, the same text in every format.
const BOOKS: Array<{ n: number; osis: string; usfm: string; name: string; chapters: string[][] }> = [
  { n: 1, osis: 'Gen', usfm: 'GEN', name: 'Genesis', chapters: [['First words here.', 'Second words here.', 'Third words here.'], ['Next chapter opens.', 'And it goes on.']] },
  { n: 19, osis: 'Ps', usfm: 'PSA', name: 'Psalms', chapters: [['A song of light.'], ['A song of water.', 'Still water runs.']] },
  { n: 65, osis: 'Jude', usfm: 'JUD', name: 'Jude', chapters: [['Jude one.', 'Jude two.', 'Jude three.']] }
];

const zefania = `<?xml version="1.0" encoding="utf-8"?><XMLBIBLE biblename="Made Up Version"><INFORMATION><identifier>MUV</identifier><language>en</language></INFORMATION>${BOOKS.map(
  (b) =>
    `<BIBLEBOOK bnumber="${b.n}" bname="${b.name}">${b.chapters
      .map((c, ci) => `<CHAPTER cnumber="${ci + 1}">${c.map((v, vi) => `<VERS vnumber="${vi + 1}">${vi === 0 ? `<STYLE css="x">${v}</STYLE><NOTE>footnote</NOTE>` : v}</VERS>`).join('')}</CHAPTER>`)
      .join('')}</BIBLEBOOK>`
).join('')}</XMLBIBLE>`;

const osisContainer = `<osis><osisText osisIDWork="MUV" xml:lang="en"><header><work><title>Made Up Version</title></work></header>${BOOKS.map(
  (b) =>
    `<div type="book" osisID="${b.osis}"><title>${b.name}</title>${b.chapters
      .map((c, ci) => `<chapter osisID="${b.osis}.${ci + 1}">${c.map((v, vi) => `<verse osisID="${b.osis}.${ci + 1}.${vi + 1}"><w lemma="x">${v.split(' ')[0]}</w> ${v.split(' ').slice(1).join(' ')}<note>n</note></verse>`).join(' ')}</chapter>`)
      .join('')}</div>`
).join('')}</osisText></osis>`;

// Verse milestones crossing paragraphs, as many OSIS files do.
const osisMilestones = `<osis><osisText osisIDWork="MUV"><div type="bookGroup">${BOOKS.map(
  (b) =>
    `<div type="book" osisID="${b.osis}">${b.chapters
      .map((c, ci) => `<chapter sID="${b.osis}.${ci + 1}"/><p>${c.map((v, vi) => `<verse sID="${b.osis}.${ci + 1}.${vi + 1}" osisID="${b.osis}.${ci + 1}.${vi + 1}"/>${v}<verse eID="${b.osis}.${ci + 1}.${vi + 1}"/>`).join(' ')}</p><chapter eID="${b.osis}.${ci + 1}"/>`)
      .join('')}</div>`
).join('')}</div></osisText></osis>`;

const usfx = `<usfx>${BOOKS.map(
  (b) =>
    `<book id="${b.usfm}"><h>${b.name}</h><toc level="1">${b.name}</toc>${b.chapters
      .map((c, ci) => `<c id="${ci + 1}"/><p>${c.map((v, vi) => `<v id="${vi + 1}"/>${v}<f caller="+">footnote</f><ve/>`).join(' ')}</p>`)
      .join('')}</book>`
).join('')}</usfx>`;

const openSong = `<bible n="Made Up Version">${BOOKS.map(
  (b) => `<b n="${b.name}">${b.chapters.map((c, ci) => `<c n="${ci + 1}">${c.map((v, vi) => `<v n="${vi + 1}">${v}</v>`).join('')}</c>`).join('')}</b>`
).join('')}</bible>`;

const holyBible = `<bible translation="Made Up Version (MUV)"><testament name="Old">${BOOKS.slice(0, 2)
  .map((b) => `<book number="${b.n}">${b.chapters.map((c, ci) => `<chapter number="${ci + 1}">${c.map((v, vi) => `<verse number="${vi + 1}">${v}</verse>`).join('')}</chapter>`).join('')}</book>`)
  .join('')}</testament><testament name="New">${BOOKS.slice(2)
  .map((b) => `<book number="${b.n}">${b.chapters.map((c, ci) => `<chapter number="${ci + 1}">${c.map((v, vi) => `<verse number="${vi + 1}">${v}</verse>`).join('')}</chapter>`).join('')}</book>`)
  .join('')}</testament></bible>`;

const shape = (b: Bible) => b.books.map((book) => [book.number, book.name, book.chapters]);
const expected = BOOKS.map((b) => [b.n, b.name, b.chapters]);
const bible = parseBibleXml(zefania, 'muv.xml');

describe('Bible files', () => {
  it.each([
    ['Zefania', zefania],
    ['OSIS with verse containers', osisContainer],
    ['OSIS with verse milestones', osisMilestones],
    ['USFX', usfx],
    ['Holy Bible XML', holyBible]
  ])('reads %s', (_format, xml) => {
    const b = parseBibleXml(xml, 'Made Up Version.xml');
    expect(shape(b)).toEqual(expected);
    expect(b.name).toBe('Made Up Version');
    expect(b.abbreviation).toBe('MUV');
  });

  it('reads OpenSong, numbering books by name', () => {
    const b = parseBibleXml(openSong, 'x.xml');
    expect(shape(b)).toEqual(expected);
    expect(b.abbreviation).toBe('MUV');
  });

  it('counts verses and explains unknown files', () => {
    expect(verseCount(bible)).toBe(11);
    expect(() => parseBibleXml('<songs/>', 'x.xml')).toThrow(/Bible format/);
    expect(() => parseBibleXml('<XMLBIBLE></XMLBIBLE>', 'x.xml')).toThrow(/No verses/);
  });
});

describe('book names', () => {
  it('normalises the ways people write them', () => {
    expect(normalizeBookName('I John')).toBe('1john');
    expect(normalizeBookName('First Corinthians')).toBe('1corinthians');
    expect(normalizeBookName('2nd Kings')).toBe('2kings');
    expect(normalizeBookName('Isaiah')).toBe('isaiah');
    expect(canonBook('PSA')?.number).toBe(19);
    expect(canonBook('1Cor')?.number).toBe(46);
    expect(canonBook('Song of Songs')?.number).toBe(22);
  });

  it('finds books by name, abbreviation or the start of the name', () => {
    expect(findBook(bible, 'gen')).toBe(0);
    expect(findBook(bible, 'Ps')).toBe(1);
    expect(findBook(bible, 'psalm')).toBe(1);
    expect(findBook(bible, 'jd')).toBe(2);
    expect(findBook(bible, 'Exodus')).toBe(-1);
  });
});

const label = (q: string) => {
  const r = lookUp(bible, q);
  return r && ('error' in r ? r.error : `${r.label} = ${r.verses.map((v) => `${v.chapter}:${v.verse}`).join(' ')}`);
};

describe('references', () => {
  it('reads verses, ranges and lists', () => {
    expect(label('Genesis 1:2')).toBe('Genesis 1:2 = 1:2');
    expect(label('gen 1 2-3')).toBe('Genesis 1:2–3 = 1:2 1:3');
    expect(label('Gen 1.1, 3')).toBe('Genesis 1:1, 3 = 1:1 1:3');
    expect(label('Gen 1:2-2:1')).toBe('Genesis 1:2–2:1 = 1:2 1:3 2:1');
    expect(label('Gen 1:3; 2:2')).toBe('Genesis 1:3; 2:2 = 1:3 2:2');
    expect(label('Gen 1:2–3')).toBe('Genesis 1:2–3 = 1:2 1:3');
  });

  it('reads whole chapters and one-chapter books', () => {
    expect(label('Psalm 2')).toBe('Psalm 2 = 2:1 2:2');
    expect(label('Gen 1-2')).toBe('Genesis 1–2 = 1:1 1:2 1:3 2:1 2:2');
    expect(label('Jude 2-3')).toBe('Jude 2–3 = 1:2 1:3');
  });

  it('trims ranges past the end and explains impossible ones', () => {
    expect(label('Gen 2:1-9')).toBe('Genesis 2:1–2 = 2:1 2:2');
    expect(label('Gen 3:1')).toBe('Genesis has 2 chapters.');
    expect(label('Gen 2:7')).toBe('Genesis 2 has 2 verses.');
    expect(label('Hezekiah 3:1')).toMatch(/No book called/);
  });

  it('is not a reference when it is just words', () => {
    expect(lookUp(bible, 'still water')).toBeNull();
  });

  it('searches for verses with all the words, exact phrases first', () => {
    const { hits } = searchBible(bible, 'water song');
    expect(hits.map((h) => h.label)).toEqual(['Psalms 2:1']);
    expect(searchBible(bible, 'water').hits.map((h) => h.label)).toEqual(['Psalms 2:1', 'Psalms 2:2']);
    expect(searchBible(bible, 'words here', 2)).toMatchObject({ more: true });
  });
});

describe('scripture slides', () => {
  const passage = lookUp(bible, 'Gen 1:1-2:2') as Passage;
  const translation = { abbreviation: 'MUV', bookNames: (b: number) => bible.books[b].name, oneChapter: (b: number) => bible.books[b].chapters.length === 1 };
  const theme = BUILT_IN_THEMES.find((t) => t.id === 'scripture')!;

  it('puts verses on slides without crossing chapters', () => {
    expect(slideVerses(passage.verses, 2).map((s) => s.map((v) => `${v.chapter}:${v.verse}`))).toEqual([['1:1', '1:2'], ['1:3'], ['2:1', '2:2']]);
    expect(slideVerses(passage.verses, 0).length).toBe(2);
    expect(verseText(passage.verses.slice(0, 2), true)).toBe('¹First words here. ²Second words here.');
  });

  it('makes a themed presentation with the reference on each slide', () => {
    const p = passageToPresentation(passage, translation, theme, { versesPerSlide: 2, verseNumbers: true, reference: 'every' });
    expect(p.name).toBe('Genesis 1:1–2:2 (MUV)');
    const d = presentationToDeck(p, 'd');
    expect(d.groups.map((g) => g.name)).toEqual(['Genesis 1:1–2:2']);
    expect(d.slides.map((s) => s.layout.boxes.map((b) => b.text))).toEqual([
      ['¹First words here. ²Second words here.', 'Genesis 1:1–2 MUV'],
      ['³Third words here.', 'Genesis 1:3 MUV'],
      ['¹Next chapter opens. ²And it goes on.', 'Genesis 2:1–2 MUV']
    ]);
    const [verses, reference] = d.slides[0].layout.boxes;
    expect(verses.font).toBe('Georgia');
    expect(reference.sizePt).toBeCloseTo(verses.sizePt / 2, 0);
    expect(reference.y).toBeGreaterThan(verses.y + verses.height - 1);
  });

  it('can show the reference on the last slide only, or not at all', () => {
    const last = presentationToDeck(passageToPresentation(passage, translation, theme, { versesPerSlide: 1, verseNumbers: false, reference: 'last' }), 'd');
    expect(last.slides.map((s) => s.layout.boxes.length)).toEqual([1, 1, 1, 1, 2]);
    expect(last.slides[0].layout.boxes[0].text).toBe('First words here.');
    const none = presentationToDeck(passageToPresentation(passage, translation, theme, { versesPerSlide: 1, verseNumbers: true, reference: 'none' }), 'd');
    expect(none.slides.every((s) => s.layout.boxes.length === 1)).toBe(true);
  });
});

describe('adding a passage to a presentation', () => {
  it('appends its slides as a new group, and to the arrangement being played', async () => {
    const { appendPresentation, addArrangement, selectArrangement } = await import('../src/shared/pro/edit');
    const { createPresentation, uuidOf } = await import('../src/shared/pro/presentation');
    const theme = BUILT_IN_THEMES.find((t) => t.id === 'scripture')!;
    const translation = { abbreviation: 'MUV', bookNames: (b: number) => bible.books[b].name, oneChapter: () => false };
    const passage = passageToPresentation(lookUp(bible, 'Gen 1:1-2') as Passage, translation, theme, { versesPerSlide: 1, verseNumbers: false, reference: 'none' });
    let sermon = createPresentation('Sermon', [{ group: 'Intro', slides: ['Welcome'] }]);
    const arranged = addArrangement(sermon, 'Order', [uuidOf(sermon.cueGroups[0].group?.uuid)]);
    sermon = selectArrangement(arranged.presentation, arranged.arrangementId);

    const once = appendPresentation(sermon, passage).presentation;
    const twice = appendPresentation(once, passage).presentation;
    const d = presentationToDeck(twice, 'd');
    expect(d.groups.map((g) => g.name)).toEqual(['Intro', 'Genesis 1:1–2', 'Genesis 1:1–2']);
    expect(d.slides.map((s) => s.text)).toEqual(['Welcome', 'First words here.', 'Second words here.', 'First words here.', 'Second words here.']);
    expect(new Set(twice.cues.map((c) => uuidOf(c.uuid))).size).toBe(5);
    expect(sermon.cues.length).toBe(1);
  });
});
