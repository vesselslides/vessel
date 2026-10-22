import { describe, expect, it } from 'vitest';
import { applyTheme, resizePresentation } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, presentationToDeck, slideOfCue } from '../src/shared/pro/presentation';
import { BUILT_IN_THEMES } from '../src/shared/theme';

describe('slide size for new presentations', () => {
  it('resizes every slide and what is on it', () => {
    const p = resizePresentation(createPresentation('S', parseLyrics('One\n\nTwo')), 1280, 720);
    for (const cue of p.cues) {
      const slide = slideOfCue(cue)!;
      expect([slide.size?.width, slide.size?.height]).toEqual([1280, 720]);
      const b = slide.elements[0].element!.bounds!;
      // The default lyrics box is inset 96px on a 1920×1080 slide.
      expect([b.origin!.x, b.origin!.y]).toEqual([64, 64]);
      expect([b.size!.width, b.size!.height]).toEqual([1280 - 128, 720 - 128]);
    }
  });

  it('lets a theme fit the new size afterwards', () => {
    const theme = BUILT_IN_THEMES.find((t) => t.id === 'scripture')!;
    const deck = presentationToDeck(applyTheme(resizePresentation(createPresentation('S', parseLyrics('One')), 1024, 768), theme), 'd');
    const layout = deck.slides[0].layout;
    expect([layout.width, layout.height]).toEqual([1024, 768]);
    expect(layout.boxes[0].x).toBeCloseTo(theme.box.x * 1024, 0);
    expect(layout.boxes[0].sizePt).toBeCloseTo(theme.sizePt * (768 / 1080), 0);
  });

  it('leaves a presentation alone when the size is the same or nonsense', () => {
    const p = createPresentation('S', parseLyrics('One'));
    expect(resizePresentation(p, 1920, 1080)).toEqual(p);
    expect(resizePresentation(p, 0, 720)).toBe(p);
  });
});
