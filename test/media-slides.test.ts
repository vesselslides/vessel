import { describe, expect, it } from 'vitest';
import { backgroundForPath } from '../src/shared/pro/background';
import { addMediaSlides, setSlideBackground } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';

const bg = (path: string) => backgroundForPath(path)!;
const deckOf = (p: ReturnType<typeof createPresentation>) => presentationToDeck(parsePresentation(serializePresentation(p)), 'd');

describe('media dragged onto slides', () => {
  it('becomes the background of a slide with words, which keep their place', () => {
    const p = createPresentation('Song', parseLyrics('[Verse]\nLine one\n\nLine two'));
    const cueId = p.cues[1].uuid!.string;
    const deck = deckOf(setSlideBackground(p, cueId, bg('/m/loop.mp4')));
    expect(deck.slides.map((s) => [s.text, s.background?.path])).toEqual([
      ['Line one', undefined],
      ['Line two', '/m/loop.mp4']
    ]);
  });

  it('makes new slides with no words, at the end of the group they were dropped in', () => {
    const p = createPresentation('Song', parseLyrics('[Verse]\nV\n\n[Chorus]\nC'));
    const verse = p.cueGroups[0].group!.uuid!.string;
    const { presentation, cueIds } = addMediaSlides(p, verse, [bg('/m/a.jpg'), bg('/m/b.mov')]);
    expect(cueIds).toHaveLength(2);
    const deck = deckOf(presentation);
    expect(deck.slides.map((s) => [s.groupName, s.text, s.background?.path])).toEqual([
      ['Verse', 'V', undefined],
      ['Verse', '', '/m/a.jpg'],
      ['Verse', '', '/m/b.mov'],
      ['Chorus', 'C', undefined]
    ]);
    expect(deck.slides[2].background?.kind).toBe('video');
  });

  it('starts a group in a presentation that has none', () => {
    const empty = createPresentation('Announcements', []);
    const deck = deckOf(addMediaSlides(empty, null, [bg('/m/a.jpg'), bg('/m/b.jpg')]).presentation);
    expect(deck.slides.map((s) => [s.groupName, s.text, s.background?.path])).toEqual([
      ['Media', '', '/m/a.jpg'],
      ['Media', '', '/m/b.jpg']
    ]);
  });
});

describe('media dropped before the first slide', () => {
  it('becomes the new first slides, in the order dropped', () => {
    const p = createPresentation('Song', parseLyrics('[Verse]\nV1\n\nV2'));
    const verse = p.cueGroups[0].group!.uuid!.string;
    const first = p.cues[0].uuid!.string;
    const deck = deckOf(addMediaSlides(p, verse, [bg('/m/a.jpg'), bg('/m/b.jpg')], first).presentation);
    expect(deck.slides.map((s) => [s.text, s.background?.path])).toEqual([
      ['', '/m/a.jpg'],
      ['', '/m/b.jpg'],
      ['V1', undefined],
      ['V2', undefined]
    ]);
  });
});
