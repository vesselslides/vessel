import { describe, expect, it } from 'vitest';
import { addSlideImage, applyTheme, copyElementToAllSlides, placeSlideElement, removeSlideElement } from '../src/shared/pro/edit';
import { placementBox, placementOf, shapeElement } from '../src/shared/pro/graphics';
import { createPresentation, layoutOfCue, parseLyrics, parsePresentation, serializePresentation, slideCue, textElement } from '../src/shared/pro/presentation';
import { plainTextToRtf } from '../src/shared/pro/rtf';
import { BUILT_IN_THEMES } from '../src/shared/theme';

const song = () => createPresentation('Song', parseLyrics('[Verse]\nOne\n\nTwo\n\nThree'));
const saved = (p: ReturnType<typeof song>) => parsePresentation(serializePresentation(p));
const LOGO = '/Users/me/Pictures/church logo.png';

describe('pictures on slides', () => {
  it('adds a picture at a placement, on top of the text, and keeps it through saving', () => {
    const p = song();
    const q = saved(addSlideImage(p, [p.cues[0].uuid!.string], LOGO, 'top-right'));
    const layout = layoutOfCue(q.cues[0]);
    expect(layout.boxes.map((b) => b.z)).toEqual([0]);
    expect(layout.graphics).toHaveLength(1);
    const g = layout.graphics[0];
    expect(g).toMatchObject({ kind: 'image', path: LOGO, z: 1, opacity: 1, scale: 'fit', ...placementBox('top-right', 1920, 1080) });
    expect(placementOf(g, 1920, 1080)).toBe('top-right');
    expect(layoutOfCue(q.cues[1]).graphics).toHaveLength(0);
  });

  it('moves, copies to every slide once, and removes', () => {
    const p = song();
    const cue = p.cues[0].uuid!.string;
    let q = addSlideImage(p, [cue], LOGO, 'top-right');
    const id = layoutOfCue(q.cues[0]).graphics[0].id;
    q = placeSlideElement(q, cue, id, 'bottom-left');
    expect(placementOf(layoutOfCue(q.cues[0]).graphics[0], 1920, 1080)).toBe('bottom-left');
    q = copyElementToAllSlides(q, cue, id);
    q = copyElementToAllSlides(q, cue, id); // a second time adds nothing
    expect(q.cues.map((c) => layoutOfCue(c).graphics.map((g) => placementOf(g, 1920, 1080)))).toEqual([['bottom-left'], ['bottom-left'], ['bottom-left']]);
    const ids = new Set(q.cues.map((c) => layoutOfCue(c).graphics[0].id));
    expect(ids.size).toBe(3);
    q = removeSlideElement(q, cue, id);
    expect(q.cues.map((c) => layoutOfCue(c).graphics.length)).toEqual([0, 1, 1]);
  });

  it('reads shapes with their fill and stacking order', () => {
    const fill = { $typeName: 'vessel.format.Color' as const, red: 0, green: 0, blue: 0, alpha: 0.5 };
    const cue = slideCue([shapeElement({ x: 0, y: 800, width: 1920, height: 280 }, fill, 'ellipse'), textElement(plainTextToRtf('Over the bar'))]);
    const layout = layoutOfCue(cue);
    expect(layout.graphics).toMatchObject([{ kind: 'shape', shape: 'ellipse', fill: 'rgba(0, 0, 0, 0.5)', z: 0, y: 800 }]);
    expect(layout.boxes[0].z).toBe(1);
  });
});

describe('theme bar', () => {
  const lowerThird = BUILT_IN_THEMES.find((t) => t.id === 'lower-third')!;
  const classic = BUILT_IN_THEMES.find((t) => t.id === 'classic')!;

  it('fills the text box behind the lyrics, and survives saving', () => {
    const box = layoutOfCue(saved(applyTheme(song(), lowerThird)).cues[0]).boxes[0];
    expect(box.fill).toBe('rgba(0, 0, 0, 0.6)');
    expect([box.x, box.y, box.width].map(Math.round)).toEqual([0, 756, 1920]);
  });

  it('is removed again by a theme without a bar', () => {
    const box = layoutOfCue(applyTheme(applyTheme(song(), lowerThird), classic).cues[0]).boxes[0];
    expect(box.fill).toBeUndefined();
  });
});
