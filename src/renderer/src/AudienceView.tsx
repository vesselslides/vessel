import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { lookFilter, lookFor, lookOverlay, mediaUrl } from '../../shared/media';
import { showMediaLooks, useMediaLooks } from './looks';
import { fillMessage, hasTokens, type LiveMessage } from '../../shared/messages';
import type { LowerThird } from '../../shared/lowerThirds';
import type { Background, LiveState, MediaLook, SlideLayout } from '../../shared/types';
import { hasEnded, positionIn, type VideoClock } from '../../shared/videoClock';
import { SlideCanvas } from './SlideCanvas';
import { useSoundRouting, type SoundRouting } from './sound';
import { SlideText } from './SlideText';
import { useNow } from './StageView';

interface Layer<T> {
  key: number;
  value: T;
  leaving: boolean;
}

/**
 * Keep the previous value on screen while the new one fades in, then drop it.
 * Returns the layers to render, oldest first.
 */
export function useCrossfade<T>(value: T, same: (a: T, b: T) => boolean, ms: number): Layer<T>[] {
  const counter = useRef(0);
  const [layers, setLayers] = useState<Layer<T>[]>([{ key: 0, value, leaving: false }]);

  useEffect(() => {
    setLayers((prev) => {
      const current = prev[prev.length - 1];
      // The same thing again: no fade, but the newest details (a slideshow's click) go to the layer on screen.
      if (current && same(current.value, value)) return current.value === value ? prev : [...prev.slice(0, -1), { ...current, value }];
      const key = ++counter.current;
      return [...prev.map((l) => ({ ...l, leaving: true })), { key, value, leaving: false }];
    });
  }, [value, same]);

  useEffect(() => {
    if (!layers.some((l) => l.leaving)) return;
    const t = setTimeout(() => setLayers((prev) => prev.filter((l) => !l.leaving)), ms + 50);
    return () => clearTimeout(t);
  }, [layers, ms]);

  return layers;
}

const sameBackground = (a: Background | null, b: Background | null): boolean =>
  a === b || (!!a && !!b && a.path === b.path && a.kind === b.kind && a.loop === b.loop && a.scale === b.scale);
interface Words {
  text: string;
  layout: SlideLayout | null;
  /** The song's copyright line, which comes and goes with the slide. */
  copyright?: string;
  /** Slideshows: clicks made on this slide (not part of what makes a new slide). */
  build?: number;
}
const sameWords = (a: Words, b: Words): boolean => a.text === b.text && a.copyright === b.copyright && JSON.stringify(a.layout) === JSON.stringify(b.layout);

const OBJECT_FIT: Record<Background['scale'], CSSProperties['objectFit']> = { fit: 'contain', fill: 'cover', stretch: 'fill' };

/** How far a video may drift from its clock before it's moved back into place (seconds). */
const DRIFT = 0.4;

/** Keep a video playing, paused and positioned as its clock says. */
function useVideoClock(video: React.RefObject<HTMLVideoElement | null>, clock: VideoClock | null, loop: boolean): void {
  useEffect(() => {
    const el = video.current;
    if (!el || !clock) return;
    const sync = (): void => {
      if (el.readyState < 1) return; // Length not known yet.
      const now = Date.now();
      const want = positionIn(clock, now, el.duration, loop);
      const ended = hasEnded(clock, now, el.duration, loop);
      if (Math.abs(el.currentTime - want) > DRIFT && !el.seeking) el.currentTime = want;
      if (clock.playing && !ended && el.paused) void el.play().catch(() => undefined);
      if ((!clock.playing || ended) && !el.paused) el.pause();
    };
    sync();
    el.addEventListener('loadedmetadata', sync);
    const id = setInterval(sync, 500);
    return () => {
      clearInterval(id);
      el.removeEventListener('loadedmetadata', sync);
    };
  }, [video, clock, loop]);
}

export { showMediaLooks } from './looks';

/** The element's height, kept up to date (a look's blur is a share of it). */
function useHeight(ref: React.RefObject<HTMLElement | null>, active: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, [ref, active]);
  return height;
}

export function MediaView({
  bg,
  muted,
  thumbnail = false,
  volume = 1,
  routing = {},
  clock = null,
  look: lookOverride
}: {
  bg: Background;
  muted: boolean;
  /** Overrides the window's looks (the audience screens get theirs with the live state). */
  look?: MediaLook | null;
  thumbnail?: boolean;
  volume?: number;
  /** Output device and delay (Preferences ▸ Audio and video). */
  routing?: SoundRouting;
  /** Play, pause and position from the Live panel; without one the video just plays. */
  clock?: VideoClock | null;
}): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const shared = useMediaLooks();
  // A slide's own look wins; then the one given (the audience screens get theirs with the live state); then the window's.
  const look = lookFor(bg.look, lookOverride === undefined ? shared[bg.path] : lookOverride);
  const height = useHeight(bg.kind === 'image' ? image : video, !!look?.blur);
  useVideoClock(video, thumbnail || bg.kind !== 'video' ? null : clock, bg.loop);
  useSoundRouting(video, routing, bg.kind === 'video' && !thumbnail && !muted);
  // Volume isn't an attribute; set it on the element.
  useEffect(() => {
    if (video.current) video.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume, bg.path]);
  const style: CSSProperties = { objectFit: OBJECT_FIT[bg.scale] };
  if (look) {
    style.filter = lookFilter(look, height);
    // A blur softens the edges too: draw it a little larger so they stay off screen.
    if (look.blur) style.transform = `scale(${1 + look.blur / 1000})`;
  }
  const src = mediaUrl(bg.path);
  const overlays = lookOverlay(look).map((o, i) => <div key={i} className="look-overlay" style={o} />);
  const media =
    bg.kind === 'image' ? (
      <img ref={image} className="media" src={src} style={style} alt="" draggable={false} />
    ) : thumbnail ? (
      <video ref={video} className="media" src={`${src}#t=0.5`} style={style} preload="metadata" muted />
    ) : (
      <video ref={video} className="media" src={src} style={style} autoPlay loop={bg.loop} muted={muted} playsInline />
    );
  return overlays.length ? (
    <>
      {media}
      {overlays}
    </>
  ) : (
    media
  );
}

/** A message along the bottom of the screen; its {timer} and {clock} keep moving. */
function MessageBar({ message }: { message: LiveMessage }): React.JSX.Element {
  const now = useNow(hasTokens(message.text) ? 250 : 60_000);
  return <div className="audience-message">{fillMessage(message.text, message.timer, now)}</div>;
}

/** The lower third and the message, over the slides; each fades out with its last words still showing. */
export function LiveOverlays({ live }: { live: LiveState }): React.JSX.Element {
  const lastMessage = useRef<LiveMessage | null>(null);
  if (live.message) lastMessage.current = live.message;
  const message = live.message ?? lastMessage.current;
  const lastLowerThird = useRef<LowerThird | null>(null);
  if (live.lowerThird) lastLowerThird.current = live.lowerThird;
  const lowerThird = live.lowerThird ?? lastLowerThird.current;
  return (
    <>
      <div className={`lower-third-layer ${live.lowerThird ? 'on' : ''} ${live.message ? 'above-message' : ''}`}>
        {lowerThird && (
          <div className="lower-third" style={{ borderColor: lowerThird.color }}>
            <div className="lower-third-title">{lowerThird.title}</div>
            {lowerThird.subtitle && <div className="lower-third-subtitle">{lowerThird.subtitle}</div>}
          </div>
        )}
      </div>
      <div className={`audience-message-layer ${live.message ? 'on' : ''}`}>{message && <MessageBar message={message} />}</div>
    </>
  );
}

/** The audience picture: background media with text on top, both crossfading. */
export function AudienceView({ live, muted }: { live: LiveState; muted: boolean }): React.JSX.Element {
  const ms = live.transitionMs;
  // Pictures on slides take the media bin's looks too.
  useEffect(() => {
    if (live.mediaLooks) showMediaLooks(live.mediaLooks);
  }, [live.mediaLooks]);
  const backgrounds = useCrossfade(live.background, sameBackground, ms);
  const words = useMemo<Words>(
    () => (live.cleared ? { text: '', layout: null } : { text: live.text, layout: live.layout, copyright: live.copyright, build: live.build }),
    [live.cleared, live.text, live.layout, live.copyright, live.build]
  );
  // The incoming slide's transition (else the usual fade) moves the words: the old slide out, the new one in.
  const transition = words.layout?.transition;
  const textMs = transition ? (transition.effect === 'cut' ? 0 : Math.round(transition.duration * 1000)) : ms;
  const texts = useCrossfade(words, sameWords, textMs);
  const vars = { '--fade': `${ms}ms` } as CSSProperties;
  const textVars = { '--fade': `${textMs}ms` } as CSSProperties;
  const effect = transition?.effect ?? 'fade';
  const newestBackground = backgrounds[backgrounds.length - 1]?.value;
  // Keep the last logo while it fades out.
  const lastLogo = useRef<string | null>(null);
  if (live.logo) lastLogo.current = live.logo;

  return (
    <div className="stage" style={vars}>
      {backgrounds.map((l) => (
        // An outgoing background stays solid under the incoming one (no dip to
        // black mid-fade), unless the incoming layer is empty.
        <div key={l.key} className={`stage-layer ${l.leaving ? (newestBackground ? 'hold' : 'leaving') : 'entering'}`}>
          {l.value && (
            <MediaView
              bg={l.value}
              // The preview is always silent; the output follows the Live panel's mute and each video's own setting.
              muted={muted || !!live.videoMuted || !!live.silentVideos?.includes(l.value.path)}
              volume={(live.videoVolume ?? 1) * (live.audioLevel ?? 1)}
              routing={{ sinkId: live.audioOutputId, delayMs: live.audioDelayMs }}
              clock={live.videoClock?.path === l.value.path ? live.videoClock : null}
              look={live.mediaLooks?.[l.value.path] ?? null}
            />
          )}
        </div>
      ))}
      {texts.map((l) => (
        <div key={`t${l.key}`} className={`stage-layer text-layer tr-${effect} ${l.leaving ? 'leaving' : 'entering'}`} style={textVars}>
          {l.value.layout ? <SlideCanvas layout={l.value.layout} step={l.value.build} animate /> : <SlideText text={l.value.text} />}
          {l.value.copyright && <div className="ccli-line">{l.value.copyright}</div>}
        </div>
      ))}
      <LiveOverlays live={live} />
      {/* The church's logo (the Logo button), on black, over everything but a blackout. */}
      <div className={`stage-logo ${live.logo ? 'on' : ''}`}>{(live.logo || lastLogo.current) && <img src={mediaUrl((live.logo || lastLogo.current)!)} alt="" draggable={false} />}</div>
      <div className={`stage-black ${live.blackout ? 'on' : ''}`} />
    </div>
  );
}
