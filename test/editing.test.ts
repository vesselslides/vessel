import { describe, expect, it } from 'vitest';
import { backgroundForPath, backgroundOfCue } from '../src/shared/pro/background';
import {
  addArrangement,
  applyLyrics,
  applyTheme,
  insertSlideBefore,
  presentationToLyrics,
  setArrangementGroups,
  setSlideBackground,
  splitSlide
} from '../src/shared/pro/edit';
import { createPresentation, layoutOfCue, parseLyrics, presentationToDeck } from '../src/shared/pro/presentation';
import { groupKey, jumpForKey, slideForNumber } from '../src/shared/hotkeys';
import { BUILT_IN_THEMES } from '../src/shared/theme';

const LYRICS = '[Verse 1]\nV1a\n\nV1b\n\n[Chorus]\nC1\n\n[Verse 2]\nV2a';
const song = () => createPresentation('Song', parseLyrics(LYRICS));
const texts = (p: ReturnType<typeof song>) => presentationToDeck(p, 'd').groups.map((g) => [g.name, g.slides.map((s) => s.text)]);

describe('split and insert', () => {
  it('splits a slide at the cursor into two in the same group', () => {
    const p = applyTheme(createPresentation('S', parseLyrics('[Verse]\nLine one\nLine two\n\nNext')), BUILT_IN_THEMES.find((t) => t.id === 'bold-caps')!);
    const d = presentationToDeck(p, 'd');
    const q = splitSlide(p, d.groups[0].id, d.groups[0].slides[0].cueId, 'Line one\n', 'Line two');
    expect(texts(q)).toEqual([['Verse', ['Line one', 'Line two', 'Next']]]);
    expect(presentationToDeck(q, 'd').slides[1].layout.boxes[0]).toMatchObject({ uppercase: true, font: 'Avenir Next' });
  });

  it('inserts a blank slide before another', () => {
    const p = song();
    const d = presentationToDeck(p, 'd');
    const q = insertSlideBefore(p, d.groups[0].id, d.groups[0].slides[1].cueId).presentation;
    expect(texts(q)[0]).toEqual(['Verse 1', ['V1a', '', 'V1b']]);
  });
});

describe('edit lyrics as text', () => {
  it('turns a song into text and back unchanged', () => {
    const p = song();
    expect(presentationToLyrics(p)).toBe(LYRICS);
    expect(texts(applyLyrics(p, presentationToLyrics(p)))).toEqual(texts(p));
  });

  it('reuses existing slides (keeping their background and ids) and copies their look for new ones', () => {
    let p = applyTheme(song(), BUILT_IN_THEMES.find((t) => t.id === 'lower-third')!);
    const first = presentationToDeck(p, 'd').groups[0].slides[0].cueId;
    p = setSlideBackground(p, first, backgroundForPath('/bg.jpg'));
    const q = applyLyrics(p, '[Verse 1]\nV1a edited\n\nV1b\n\nV1c new\n\n[Chorus]\nC1');
    expect(texts(q)).toEqual([
      ['Verse 1', ['V1a edited', 'V1b', 'V1c new']],
      ['Chorus', ['C1']]
    ]);
    const cue = q.cues.find((c) => c.uuid!.string === first)!;
    expect(backgroundOfCue(cue)?.path).toBe('/bg.jpg');
    // The new slide copies the group's first slide, so it has the theme bar too.
    expect(layoutOfCue(q.cues[2]).boxes[0].fill).toBe('rgba(0, 0, 0, 0.6)');
    expect(new Set(q.cues.map((c) => c.uuid!.string)).size).toBe(4);
  });

  it('adds new groups, drops missing ones, and cleans arrangements', () => {
    let p = song();
    const d = presentationToDeck(p, 'd');
    const arr = addArrangement(p, 'Main');
    p = setArrangementGroups(arr.presentation, arr.arrangementId, [d.groups[0].id, d.groups[1].id, d.groups[2].id, d.groups[1].id]);
    const q = applyLyrics(p, '[Verse 1]\nV1a\n\n[Chorus]\nC1\n\n[Bridge]\nB1');
    expect(texts(q).map((g) => g[0])).toEqual(['Verse 1', 'Chorus', 'Bridge']);
    expect(presentationToDeck(q, 'd').slides.map((s) => s.text)).toEqual(['V1a', 'C1', 'C1']);
  });
});

describe('show shortcuts', () => {
  it('derives group letters, preferring ProPresenter hot keys', () => {
    expect(['Verse 1', 'Chorus', 'Pre-Chorus', 'Bridge', 'Tag', 'Ending', 'Outro', 'Interlude', 'Solo', ''].map((n) => groupKey(n) ?? '-')).toEqual(['V', 'C', 'P', 'B', 'T', 'E', 'E', 'N', 'S', '-']);
    expect(groupKey('Chorus', 7)).toBe('G');
  });

  it('jumps to the next block with that letter, cycling through verses', () => {
    const deck = presentationToDeck(song(), 'd');
    // Play order: V1a(0) V1b(1) C1(2) V2a(3)
    expect(jumpForKey(deck, 'v', -1)).toBe(0);
    expect(jumpForKey(deck, 'V', 0)).toBe(3);
    expect(jumpForKey(deck, 'V', 3)).toBe(0);
    expect(jumpForKey(deck, 'c', 0)).toBe(2);
    expect(jumpForKey(deck, 'x', 0)).toBeNull();
  });

  it('finds repeated groups in an arrangement', () => {
    const p = song();
    const d = presentationToDeck(p, 'd');
    const arr = addArrangement(p, 'Main');
    const q = setArrangementGroups(arr.presentation, arr.arrangementId, [d.groups[1].id, d.groups[0].id, d.groups[1].id]);
    const deck = presentationToDeck(q, 'd');
    // Play order: C1(0) V1a(1) V1b(2) C1(3)
    expect(jumpForKey(deck, 'C', 0)).toBe(3);
    expect(jumpForKey(deck, 'C', 3)).toBe(0);
  });

  it('reads typed slide numbers', () => {
    const deck = presentationToDeck(song(), 'd');
    expect(slideForNumber(deck, '1')).toBe(0);
    expect(slideForNumber(deck, '4')).toBe(3);
    expect(slideForNumber(deck, '5')).toBeNull();
    expect(slideForNumber(deck, '0')).toBeNull();
  });
});

describe('lyrics text for an empty group', () => {
  it('writes just the header, and keeps the group when applied', () => {
    let p = song();
    const d = presentationToDeck(p, 'd');
    p = applyLyrics(p, '[Verse 1]\n\n[Chorus]\nC1');
    expect(presentationToLyrics(p)).toBe('[Verse 1]\n\n[Chorus]\nC1');
    expect(presentationToDeck(p, 'd').groups.map((g) => [g.name, g.slides.length])).toEqual([
      ['Verse 1', 0],
      ['Chorus', 1]
    ]);
    expect(d.groups.length).toBe(3);
  });
});
