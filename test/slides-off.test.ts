import { describe, expect, it } from 'vitest';
import { nextEnabled } from '../src/shared/hotkeys';
import { setSlideEnabled } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, presentationToDeck } from '../src/shared/pro/presentation';

const song = () => createPresentation('Song', parseLyrics('[Verse]\nOne\n\nTwo\n\nThree\n\n[Chorus]\nFour'));

describe('turned-off slides', () => {
  it('can be turned off and on again, and the deck says so', () => {
    const p = song();
    const off = setSlideEnabled(p, presentationToDeck(p, 'd').slides[1].cueId, false);
    expect(presentationToDeck(off, 'd').slides.map((s) => s.enabled)).toEqual([true, false, true, true]);
    const on = setSlideEnabled(off, presentationToDeck(off, 'd').slides[1].cueId, true);
    expect(presentationToDeck(on, 'd').slides.every((s) => s.enabled)).toBe(true);
    expect(presentationToDeck(p, 'd').slides[1].enabled).toBe(true);
  });

  it('are skipped going forwards and backwards, including at the ends', () => {
    let p = song();
    const ids = presentationToDeck(p, 'd').slides.map((s) => s.cueId);
    p = setSlideEnabled(setSlideEnabled(p, ids[0], false), ids[2], false);
    const deck = presentationToDeck(p, 'd');
    expect(nextEnabled(deck, -1, 1)).toBe(1);
    expect(nextEnabled(deck, 1, 1)).toBe(3);
    expect(nextEnabled(deck, 3, 1)).toBe(-1);
    expect(nextEnabled(deck, 3, -1)).toBe(1);
    expect(nextEnabled(deck, 1, -1)).toBe(-1);
    expect(nextEnabled(deck, deck.slides.length, -1)).toBe(3);
  });
});
