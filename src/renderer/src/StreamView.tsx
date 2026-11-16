import { useEffect, useMemo, type CSSProperties } from 'react';
import { KEY_COLOURS, type StreamLook } from '../../shared/stream';
import type { Background, LiveState, SlideLayout } from '../../shared/types';
import { LiveOverlays, MediaView, showMediaLooks, useCrossfade } from './AudienceView';
import { SlideCanvas } from './SlideCanvas';

interface Words {
  text: string;
  layout: SlideLayout | null;
  /** Slideshows: clicks made on this slide. */
  build?: number;
}
const sameWords = (a: Words, b: Words): boolean => a.text === b.text && JSON.stringify(a.layout) === JSON.stringify(b.layout);
const sameBackground = (a: Background | null, b: Background | null): boolean => a?.path === b?.path;

/**
 * The slide's text boxes only: no background colour, pictures or shapes, so the key colour shows through.
 * A slideshow is shown whole: its pictures and shapes are part of what's being said.
 */
const wordsOnly = (layout: SlideLayout): SlideLayout => (layout.slideshow ? layout : { ...layout, background: undefined, graphics: [] });

/** What the stream output shows: the words on a key colour (or over the media), crossfading like the audience screen. */
export function StreamView({ live, look }: { live: LiveState; look: StreamLook }): React.JSX.Element {
  const ms = live.transitionMs;
  const hidden = live.cleared || live.blackout || !!live.logo;
  const words = useMemo<Words>(
    () => (hidden ? { text: '', layout: null } : { text: live.text, layout: live.layout, build: live.build }),
    [hidden, live.text, live.layout, live.build]
  );
  // Pictures on slides take the media bin's looks; the incoming slide's transition moves the words, as on the audience screen.
  useEffect(() => {
    if (live.mediaLooks) showMediaLooks(live.mediaLooks);
  }, [live.mediaLooks]);
  const transition = words.layout?.transition;
  const textMs = transition ? (transition.effect === 'cut' ? 0 : Math.round(transition.duration * 1000)) : ms;
  const texts = useCrossfade(words, sameWords, textMs);
  const textVars = { '--fade': `${textMs}ms` } as CSSProperties;
  const backgrounds = useCrossfade(look.media && !live.blackout ? live.background : null, sameBackground, ms);
  const style = {
    '--fade': `${ms}ms`,
    background: look.background === 'none' ? 'transparent' : KEY_COLOURS[look.background].css
  } as CSSProperties;

  return (
    <div className={`stage stream-view stream-${look.style}`} style={style}>
      {backgrounds.map(
        (l) =>
          l.value && (
            <div key={l.key} className={`stage-layer ${l.leaving ? 'leaving' : 'entering'}`}>
              {/* The stream never plays sound: the audience output does. */}
              <MediaView bg={l.value} muted clock={live.videoClock?.path === l.value.path ? live.videoClock : null} look={live.mediaLooks?.[l.value.path] ?? null} />
            </div>
          )
      )}
      {texts.map((l) => (
        <div key={`t${l.key}`} className={`stage-layer text-layer tr-${transition?.effect ?? 'fade'} ${l.leaving ? 'leaving' : 'entering'}`} style={textVars}>
          {look.style === 'slide' && l.value.layout ? (
            <SlideCanvas layout={wordsOnly(l.value.layout)} step={l.value.build} animate />
          ) : (
            l.value.text.trim() && <div className="stream-lyrics">{l.value.text}</div>
          )}
        </div>
      ))}
      {look.overlays && !live.blackout && <LiveOverlays live={live} />}
    </div>
  );
}
