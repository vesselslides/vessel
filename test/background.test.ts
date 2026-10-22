import { describe, expect, it } from 'vitest';
import { Action_ActionType, Action_LayerType } from '../src/shared/gen/presentation_pb';
import { mediaKindOf, mediaUrl } from '../src/shared/media';
import { backgroundForPath, backgroundOfCue } from '../src/shared/pro/background';
import { setSlideBackground, setSlideText } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { pathToUrl, urlToPath } from '../src/shared/pro/url';

const song = () => createPresentation('Song', parseLyrics('[Verse]\nV1\n\nV2'));

describe('file urls', () => {
  it('round-trips macOS paths with spaces and unicode', () => {
    const path = '/Users/me/Movies/Worship Loops/Água #1.mp4';
    expect(urlToPath(pathToUrl(path))).toBe(path);
  });

  it('round-trips Windows paths', () => {
    const url = pathToUrl('C:\\Media\\Motion Loops\\blue.mov');
    expect(url.Storage.value).toBe('file:///C:/Media/Motion%20Loops/blue.mov');
    expect(urlToPath(url)).toBe('C:/Media/Motion Loops/blue.mov');
  });

  it('builds media protocol urls and detects kinds', () => {
    expect(mediaUrl('/a b/c.png')).toBe('vessel-media://file/%2Fa%20b%2Fc.png');
    expect(mediaKindOf('x.MOV')).toBe('video');
    expect(mediaKindOf('x.jpeg')).toBe('image');
    expect(mediaKindOf('x.pdf')).toBeNull();
  });
});

describe('slide backgrounds', () => {
  it('writes a background-layer media action ProPresenter-style and reads it back after saving', () => {
    const p = song();
    const cueId = p.cues[0].uuid!.string;
    const bg = backgroundForPath('/Users/me/Movies/loop.mp4')!;
    expect(bg).toEqual({ path: '/Users/me/Movies/loop.mp4', kind: 'video', loop: true, scale: 'fill' });

    const saved = parsePresentation(serializePresentation(setSlideBackground(p, cueId, bg)));
    const cue = saved.cues[0];
    const [mediaAction, slideAction] = cue.actions;
    expect(mediaAction.type).toBe(Action_ActionType.MEDIA);
    expect(mediaAction.ActionTypeData.case === 'media' && mediaAction.ActionTypeData.value.layerType).toBe(Action_LayerType.BACKGROUND);
    expect(slideAction.type).toBe(Action_ActionType.PRESENTATION_SLIDE);
    expect(backgroundOfCue(cue)).toEqual(bg);

    const deck = presentationToDeck(saved, 'd');
    expect(deck.slides.map((s) => s.background?.path)).toEqual(['/Users/me/Movies/loop.mp4', undefined]);
  });

  it('replaces and clears a background without touching the slide', () => {
    const p = song();
    const cueId = p.cues[0].uuid!.string;
    let q = setSlideBackground(p, cueId, backgroundForPath('/a.mp4'));
    q = setSlideBackground(q, cueId, backgroundForPath('/b.jpg'));
    expect(q.cues[0].actions).toHaveLength(2);
    expect(backgroundOfCue(q.cues[0])).toEqual({ path: '/b.jpg', kind: 'image', loop: false, scale: 'fill' });
    q = setSlideText(q, cueId, 'still here');
    q = setSlideBackground(q, cueId, null);
    expect(q.cues[0].actions).toHaveLength(1);
    expect(presentationToDeck(q, 'd').slides[0]).toMatchObject({ text: 'still here', background: undefined });
  });
});
