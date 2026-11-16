import { describe, expect, it } from 'vitest';
import { isPlainLook, lookFilter, lookOverlay, normalizeLook } from '../src/shared/media';
import { normalizeMotion, speedOf } from '../src/shared/motion';
import { backgroundForPath } from '../src/shared/pro/background';
import { addSlideImage, setSlideBackground, setSlideBackgroundLook, setSlideMotion, setSlidePictureLook, setTextStyle } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { buildLibraryTree, folderChoices } from '../src/renderer/src/LibraryTree';
import type { LibraryItem } from '../src/shared/types';

const song = () => createPresentation('Song', parseLyrics('[Verse]\nOne\n\nTwo\n\nThree'));
/** Saved and opened again, as a song in the library would be. */
const reopened = (p: ReturnType<typeof song>) => presentationToDeck(parsePresentation(serializePresentation(p)), 'd');
const cues = (p: ReturnType<typeof song>) => presentationToDeck(p, 'd').slides.map((s) => s.cueId);

describe('Transitions and word animations', () => {
  it('are kept per slide, and only on the slides chosen', () => {
    let p = song();
    const [a, b, c] = cues(p);
    p = setSlideMotion(p, [a, b], 'transition', { effect: 'push', duration: 0.4 });
    p = setSlideMotion(p, [b], 'words', { effect: 'typewriter', duration: 1.6 });
    p = setSlideMotion(p, [c], 'words', { effect: 'zoom', duration: 0.8, by: 'sentence' });
    const slides = reopened(p).slides;
    expect(slides[0].layout.transition).toEqual({ effect: 'push', duration: 0.4 });
    expect(slides[1].layout).toMatchObject({ transition: { effect: 'push' }, words: { effect: 'typewriter', duration: 1.6 } });
    expect(slides[2].layout.transition).toBeUndefined();
    // What comes in on its own: as chosen, or the effect's own (letters, for a typewriter).
    expect(slides[2].layout.words).toEqual({ effect: 'zoom', duration: 0.8, by: 'sentence' });
    expect(slides[1].layout.words?.by).toBe('letter');
    expect(slides[0].layout.words).toBeUndefined();
    // Cleared again.
    const cleared = reopened(setSlideMotion(p, [a, b, c], 'transition', null)).slides;
    expect(cleared.every((s) => !s.layout.transition)).toBe(true);
  });

  it('ignores effects it doesn’t know, and keeps speeds sensible', () => {
    expect(normalizeMotion({ effect: 'sparkle', duration: 1 }, 'words')).toBeUndefined();
    expect(normalizeMotion({ effect: 'zoom', duration: 0 }, 'transition')).toEqual({ effect: 'zoom', duration: 0.8 });
    expect(normalizeMotion({ effect: 'zoom', duration: 99 }, 'words')).toEqual({ effect: 'zoom', duration: 10, by: 'all' });
    // Older choices that were an effect and a unit in one.
    expect(normalizeMotion({ effect: 'lines', duration: 1 }, 'words')).toEqual({ effect: 'fade-up', duration: 1, by: 'line' });
    expect(normalizeMotion({ effect: 'words', duration: 1 }, 'words')).toEqual({ effect: 'fade-up', duration: 1, by: 'word' });
    expect(normalizeMotion({ effect: 'zoom', duration: 1, by: 'nonsense' }, 'words')?.by).toBe('all');
    expect([1.6, 0.8, 0.4, 1.1].map(speedOf)).toEqual(['slow', 'normal', 'fast', 'normal']);
  });
});

describe('Text style for chosen slides', () => {
  it('changes only the slides chosen', () => {
    let p = song();
    const [a, , c] = cues(p);
    p = setTextStyle(p, { bold: true, align: 'left', valign: 'bottom' }, [a, c]);
    p = setTextStyle(p, { valign: 'top' }, [a]);
    const boxes = reopened(p).slides.map((s) => s.layout.boxes[0]);
    expect(boxes.map((b) => [b.bold, b.align, b.valign])).toEqual([
      [true, 'left', 'top'],
      [false, 'center', 'middle'],
      [true, 'left', 'bottom']
    ]);
  });
});

describe('Looks', () => {
  it('keep brightness, contrast, saturation, hue, warmth and vignette in range', () => {
    expect(normalizeLook({ blur: 0, darken: 0, color: 100 })).toBeNull();
    const look = normalizeLook({ blur: 20, darken: 10, color: 250, brightness: 30, contrast: -140, hue: 400, warmth: 50, vignette: 40 })!;
    expect(look).toEqual({ blur: 20, darken: 10, color: 200, brightness: 30, contrast: -100, hue: 180, warmth: 50, vignette: 40 });
    expect(isPlainLook({ blur: 0, darken: 0, color: 100, hue: 0 })).toBe(true);
    const filter = lookFilter(look, 1000);
    expect(filter).toContain('blur(8.0px)');
    expect(filter).toContain('brightness(');
    expect(filter).toContain('contrast(0.000)');
    expect(filter).toContain('saturate(2.00)');
    expect(filter).toContain('hue-rotate(180deg)');
    // Warmth and the vignette are drawn over the picture.
    expect(lookOverlay(look).map((o) => o.background)).toEqual([expect.stringContaining('255, 140, 20'), expect.stringContaining('radial-gradient')]);
    expect(lookOverlay({ blur: 0, darken: 0, color: 100, warmth: -30 })[0].background).toContain('30, 110, 255');
  });

  it('can be kept for one slide’s background or pictures', () => {
    let p = song();
    const [a, b] = cues(p);
    const bg = backgroundForPath('/media/Dawn.jpg')!;
    p = setSlideBackground(p, a, bg);
    p = setSlideBackground(p, b, bg);
    p = addSlideImage(p, [a, b], '/media/Logo.png', 'top-right');
    p = setSlideBackgroundLook(p, [a], { blur: 30, darken: 0, color: 100, warmth: 40 });
    p = setSlidePictureLook(p, [b], { blur: 0, darken: 0, color: 0 }, '/media/Logo.png');
    const slides = reopened(p).slides;
    expect(slides[0].background?.look).toEqual({ blur: 30, darken: 0, color: 100, warmth: 40 });
    expect(slides[1].background?.look).toBeUndefined();
    const logo = (i: number) => slides[i].layout.graphics.find((g) => g.kind === 'image');
    expect(logo(0)).not.toHaveProperty('look');
    expect(logo(1)).toMatchObject({ look: { color: 0 } });
    // A slide's own fit (Background ▸ Stretch) is kept with its look.
    const stretched = reopened(setSlideBackground(p, a, { ...slides[0].background!, scale: 'stretch' })).slides[0].background;
    expect(stretched).toMatchObject({ scale: 'stretch', look: { warmth: 40 } });
    // Back to the media bin's look.
    expect(reopened(setSlideBackgroundLook(p, [a], null)).slides[0].background?.look).toBeUndefined();
  });
});

describe('Library folders', () => {
  const item = (path: string, name: string): LibraryItem => ({ path, name, modified: 0, slides: 1, search: name.toLowerCase() });
  const library = [
    item('/lib/Amazing Grace.pro', 'Amazing Grace'),
    item('/lib/Worship/Hymns/It Is Well.pro', 'It Is Well'),
    item('/lib/Worship/Holy.pro', 'Holy'),
    item('/old/Doxology.pro', 'Doxology')
  ];
  const trees = buildLibraryTree(library, [
    { root: '/lib', folders: ['Christmas', 'Worship', 'Worship/Hymns'] },
    { root: '/old', folders: [] }
  ]);

  it('puts each song in its folder, folders inside folders, empty ones too', () => {
    const [main, old] = trees;
    expect(main.songs.map((s) => s.name)).toEqual(['Amazing Grace']);
    expect(main.folders.map((f) => f.name)).toEqual(['Christmas', 'Worship']);
    const worship = main.folders[1];
    expect(worship.songs.map((s) => s.name)).toEqual(['Holy']);
    expect(worship.folders[0]).toMatchObject({ name: 'Hymns', path: '/lib/Worship/Hymns', isRoot: false });
    expect(worship.folders[0].songs.map((s) => s.name)).toEqual(['It Is Well']);
    expect(main.folders[0].songs).toEqual([]);
    // Another library folder shows as its own folder.
    expect(old).toMatchObject({ name: 'old', isRoot: true, songs: [{ name: 'Doxology' }] });
  });

  it('lists every folder to move a song to', () => {
    expect(folderChoices(trees).map((f) => f.label)).toEqual(['Christmas', 'Worship', 'Worship ▸ Hymns', 'old']);
  });
});
