import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_LAYOUT, normalizeStageLayout, presetOf, STAGE_PRESETS } from '../src/shared/stage';

describe('stage layouts', () => {
  it('recognises each preset, and your own changes as no preset', () => {
    for (const p of STAGE_PRESETS) expect(presetOf(p.layout)?.id).toBe(p.id);
    expect(presetOf({ ...DEFAULT_STAGE_LAYOUT, clock: false })).toBeUndefined();
  });

  it('starts from the standard layout and puts stored values right', () => {
    expect(normalizeStageLayout(undefined)).toEqual(DEFAULT_STAGE_LAYOUT);
    expect(normalizeStageLayout({ nextShare: 5, textSize: 0, align: 'right' as never, next: false })).toEqual({ ...DEFAULT_STAGE_LAYOUT, nextShare: 0.6, textSize: 1, align: 'center', next: false });
  });
});
