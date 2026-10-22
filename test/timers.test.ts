import { describe, expect, it } from 'vitest';
import { Cue_CompletionActionType, Cue_CompletionTargetType } from '../src/shared/gen/presentation_pb';
import { setPresentationTimer, setSlideAdvance } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';

const notices = () => createPresentation('Notices', parseLyrics('Welcome\n\nCoffee after\n\nKids church'));
const advances = (p: ReturnType<typeof notices>) => presentationToDeck(p, 'd').slides.map((s) => s.advance ?? null);

describe('slide timers', () => {
  it('loops a whole presentation the way ProPresenter stores it, and survives saving', () => {
    const looped = parsePresentation(serializePresentation(setPresentationTimer(notices(), 8)));
    expect(advances(looped)).toEqual([
      { seconds: 8, to: 'next' },
      { seconds: 8, to: 'next' },
      { seconds: 8, to: 'first' }
    ]);
    const last = looped.cues[2];
    expect([last.completionActionType, last.completionTargetType, last.completionTime]).toEqual([Cue_CompletionActionType.AFTER_TIME, Cue_CompletionTargetType.FIRST, 8]);
  });

  it('can play through once, stopping on the last slide, and be taken off again', () => {
    const once = setPresentationTimer(notices(), 5, false);
    expect(advances(once)).toEqual([{ seconds: 5, to: 'next' }, { seconds: 5, to: 'next' }, null]);
    expect(advances(setPresentationTimer(once, null))).toEqual([null, null, null]);
  });

  it('times single slides, including going to a particular slide', () => {
    let p = notices();
    const ids = presentationToDeck(p, 'd').slides.map((s) => s.cueId);
    p = setSlideAdvance(p, ids[0], { seconds: 3, to: 'next' });
    p = setSlideAdvance(p, ids[2], { seconds: 10, to: { cueId: ids[1] } });
    const back = parsePresentation(serializePresentation(p));
    expect(advances(back)).toEqual([{ seconds: 3, to: 'next' }, null, { seconds: 10, to: { cueId: ids[1] } }]);
    expect(advances(setSlideAdvance(back, ids[0], null))[0]).toBeNull();
  });

  it('ignores ProPresenter cues that wait for something other than time', () => {
    const p = notices();
    p.cues[0].completionTargetType = Cue_CompletionTargetType.NEXT;
    p.cues[0].completionActionType = Cue_CompletionActionType.AFTER_ACTION;
    p.cues[0].completionTime = 4;
    expect(advances(p)[0]).toBeNull();
  });
});
