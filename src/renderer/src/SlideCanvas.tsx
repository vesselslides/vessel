import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cssFont } from '../../shared/fonts';
import { lookFilter, lookFor, lookOverlay, mediaUrl } from '../../shared/media';
import { wordMotion } from '../../shared/motion';
import type { BuildLayout, ElementBuilds, GraphicLayout, SlideLayout, SlideMotion, TextBoxLayout } from '../../shared/types';
import { useMediaLooks } from './looks';
import { fontReplaced, useFontsVersion } from './fonts';

// ---- Slideshow builds: what's on screen after so many clicks, and the effects between

/** How a slideshow slide is drawn: at which click, and whether to play the effects that got it there. */
interface Builds {
  /** Clicks made; undefined draws everything that ever comes on (thumbnails, Edit). */
  step?: number;
  /** The clicks just made: effects play for builds after `from`, up to `to`. */
  move?: { from: number; to: number };
  /** Show what's still to come faintly, for the operator. */
  ghost?: boolean;
  /** Songs on the screens: how the words come in as the slide appears. */
  words?: SlideMotion;
}

// ---- Word animations: the text box, each line, word or letter coming in on its own

/** Seconds between one line, word or letter starting and the next, for an effect taking `d` seconds. */
const STAGGER = { line: 0.45, sentence: 0.6, word: 0.12, letter: 0.035 } as const;

/** A sentence ends at . ! ? ; or : (closing quotes and brackets may follow). */
const endsSentence = (word: string): boolean => /[.!?;:…][”’"')\]]*$/.test(word);

/**
 * The words of a text box coming in with `motion`: everything at once, or
 * each line, sentence, word or letter a little after the one before.
 * Spaces and line breaks stay plain text, so the words wrap as usual.
 */
function MotionText({ text, motion }: { text: string; motion: SlideMotion }): React.JSX.Element {
  const m = wordMotion(motion.effect);
  const d = motion.duration;
  if (!m) return <>{text}</>;
  const by = motion.by ?? m.by;
  const anim = (i: number, stagger: number): CSSProperties => ({ animationDuration: `${d}s`, animationDelay: `${(i * stagger * d).toFixed(3)}s` });
  const cls = `wm wm-${m.id}`;
  if (by === 'all')
    return (
      <span className={`${cls} wm-block`} style={anim(0, 0)}>
        {text}
      </span>
    );
  if (by === 'line')
    return (
      <>
        {text.split('\n').map((line, i) => (
          <span key={i} className={`${cls} wm-block`} style={anim(i, STAGGER.line)}>
            {line || '\u200b'}
          </span>
        ))}
      </>
    );
  const parts = text.split(/(\s+)/);
  if (by === 'word' || by === 'sentence') {
    // Sentence by sentence: the words of a sentence come in together; a new line starts a new sentence too.
    let n = 0;
    let sentence = 0;
    let started = false;
    return (
      <>
        {parts.map((part, i) => {
          if (/^\s*$/.test(part)) {
            if (by === 'sentence' && part.includes('\n') && started) {
              sentence++;
              started = false;
            }
            return part;
          }
          const at = by === 'word' ? n++ : sentence;
          started = true;
          if (by === 'sentence' && endsSentence(part)) {
            sentence++;
            started = false;
          }
          return (
            <span key={i} className={`${cls} wm-inline`} style={anim(at, by === 'word' ? STAGGER.word : STAGGER.sentence)}>
              {part}
            </span>
          );
        })}
      </>
    );
  }
  // Letter by letter, each word kept whole on its line. A typewriter's letters only appear; others move too.
  let n = 0;
  const moving = m.id !== 'typewriter';
  // Typewriter: a letter every 45 ms whatever the speed, so long slides don't drag.
  const stagger = m.id === 'typewriter' ? 0.045 / d : STAGGER.letter;
  return (
    <>
      {parts.map((part, i) =>
        /^\s*$/.test(part) ? (
          part
        ) : (
          <span key={i} className="wm-word">
            {[...part].map((ch, j) => (
              <span key={j} className={`${cls} ${moving ? 'wm-inline' : ''}`} style={anim(n++, stagger)}>
                {ch}
              </span>
            ))}
          </span>
        )
      )}
    </>
  );
}

/** Whether something with these builds is on screen after `step` clicks. */
export const shownAt = (b: ElementBuilds, step: number): boolean => (!b.in || step >= b.in.step) && !(b.out && step >= b.out.step);

const effectAnimation = (b: BuildLayout, out: boolean): string => {
  const sided = b.effect === 'fly' || b.effect === 'float' || b.effect === 'wipe';
  const name = `vb-${b.effect}${sided ? `-${b.side ?? 'bottom'}` : ''}`;
  const duration = b.effect === 'appear' ? 0.001 : b.duration;
  return `${name} ${duration}s ${out ? 'ease-in' : 'ease-out'} ${b.delay}s both${out ? ' reverse' : ''}`;
};

/** Style for an element (or a line of text) with builds: hidden, faint, animating in or out, or nothing special. */
function buildStyle(b: ElementBuilds | undefined, at: Builds): { style?: CSSProperties; className?: string } {
  if (!b || at.step === undefined) return {};
  const visible = shownAt(b, at.step);
  const m = at.move;
  if (m && m.to > m.from) {
    const within = (x: BuildLayout | undefined): x is BuildLayout => !!x && x.step > m.from && x.step <= m.to;
    if (within(b.out) && shownAt(b, m.from)) return { style: { animation: effectAnimation(b.out, true) } };
    if (visible && within(b.in)) return { style: { animation: effectAnimation(b.in, false) } };
  }
  if (visible) return {};
  return at.ghost ? { className: 'build-ghost' } : { style: { visibility: 'hidden' } };
}

/**
 * The click a slide is at, and the clicks just made. A slide that's just come
 * on plays its "as the slide appears" effects; going back draws without them.
 */
function useBuildMove(step: number | undefined, animate: boolean): Builds['move'] {
  const [move, setMove] = useState<Builds['move']>(() => (animate && step !== undefined ? { from: step === 0 ? -1 : step, to: step } : undefined));
  const last = useRef(step);
  if (last.current !== step) {
    const from = last.current;
    last.current = step;
    const next = animate && step !== undefined && from !== undefined ? { from, to: step } : undefined;
    // Set while rendering: the new click's effects start in this very frame.
    setMove(next);
    return next;
  }
  return move;
}

const JUSTIFY: Record<TextBoxLayout['valign'], CSSProperties['justifyContent']> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** Lengths in slide pixels become fractions of the slide frame's width. */
const slidePx = (px: number, layout: SlideLayout): string => `${((px / layout.width) * 100).toFixed(4)}cqw`;

/** Text whose lines come and go on their own: one block per line, so each can be hidden or animated. */
function BuiltLines({ box, at }: { box: TextBoxLayout; at: Builds }): React.JSX.Element {
  const lines = box.text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const b = box.lineBuilds?.find((l) => i >= l.first && i < l.first + l.count);
        const { style, className } = buildStyle(b, at);
        return (
          <div key={i} className={`built-line ${className ?? ''}`} style={style}>
            {line || '\u200b'}
          </div>
        );
      })}
    </>
  );
}

function TextBox({ box, layout, at }: { box: TextBoxLayout; layout: SlideLayout; at: Builds }): React.JSX.Element {
  const fontsVersion = useFontsVersion();
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  // Shrink-to-fit: lower --fit until the text no longer overflows the box.
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    // Imported slideshows: if the font is drawn with something else here (missing, or a stand-in), shrink to fit rather than spill.
    const shrink = box.shrink || (!!layout.slideshow && fontReplaced(box.font));
    const fit = (): void => {
      i.style.setProperty('--fit', '1');
      if (!shrink) return;
      // Measure the words as they end up, not mid-animation (a zoom or a drop would look too big).
      i.classList.add('wm-measure');
      let scale = 1;
      for (let n = 0; n < 24 && (i.scrollHeight > o.clientHeight + 1 || i.scrollWidth > o.clientWidth + 1) && scale > 0.15; n++) {
        scale *= 0.92;
        i.style.setProperty('--fit', scale.toFixed(3));
      }
      i.classList.remove('wm-measure');
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    // A font that arrives after drawing (Vessel's own, loading) changes the size: fit again.
    document.fonts.addEventListener('loadingdone', fit);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [box, fontsVersion, layout.slideshow]);

  const font = cssFont(box.font, box.bold, box.italic);
  const style: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    fontStyle: font.italic ? 'italic' : 'normal',
    fontSize: `calc(${slidePx(box.sizePt, layout)} * var(--fit, 1))`,
    color: box.color,
    textAlign: box.align,
    // Spacing from PowerPoint or Keynote; shrink-to-fit scales it with the text.
    lineHeight: box.lineExact ? `calc(${slidePx(box.lineExact, layout)} * var(--fit, 1))` : box.lineMultiple ? 1.15 * box.lineMultiple : undefined,
    letterSpacing: box.letterSpacing ? `calc(${slidePx(box.letterSpacing, layout)} * var(--fit, 1))` : undefined,
    textTransform: box.uppercase ? 'uppercase' : 'none',
    textShadow: box.shadow ? '0 0.05em 0.15em rgba(0, 0, 0, 0.75)' : 'none',
    WebkitTextStroke: box.outline ? `${slidePx(box.outline.width, layout)} ${box.outline.color}` : undefined,
    paintOrder: box.outline ? 'stroke fill' : undefined
  };
  const built = buildStyle(box.build, at);
  return (
    <div
      ref={outer}
      className={`text-box${layout.slideshow || at.words ? ' text-box-free' : ''} ${built.className ?? ''}`}
      style={{
        left: `${(box.x / layout.width) * 100}%`,
        top: `${(box.y / layout.height) * 100}%`,
        width: `${(box.width / layout.width) * 100}%`,
        height: `${(box.height / layout.height) * 100}%`,
        justifyContent: JUSTIFY[box.valign],
        background: box.fill,
        ...built.style
      }}
    >
      <div ref={inner} className="text-box-text" style={style}>
        {box.lineBuilds?.length && at.step !== undefined ? (
          <BuiltLines box={box} at={at} />
        ) : at.words ? (
          <MotionText text={box.text} motion={at.words} />
        ) : (
          box.text
        )}
      </div>
    </div>
  );
}

const FIT: Record<string, CSSProperties['objectFit']> = { fit: 'contain', fill: 'cover', stretch: 'fill' };

/** A picture or shape placed on the slide. */
function Graphic({ g, layout, at, looks }: { g: GraphicLayout; layout: SlideLayout; at: Builds; looks: ReturnType<typeof useMediaLooks> }): React.JSX.Element {
  const built = buildStyle(g.build, at);
  const frame: CSSProperties = {
    left: `${(g.x / layout.width) * 100}%`,
    top: `${(g.y / layout.height) * 100}%`,
    width: `${(g.width / layout.width) * 100}%`,
    height: `${(g.height / layout.height) * 100}%`,
    opacity: g.opacity,
    transform: g.rotation ? `rotate(${g.rotation}deg)` : undefined,
    ...built.style
  };
  const className = `slide-graphic ${built.className ?? ''}`;
  if (g.kind === 'image') {
    // Its look: the slide's own for this picture, else the media bin's for the file.
    const look = lookFor(g.look, looks[g.path]);
    const filter = look
      ? [look.blur ? `blur(${slidePx((look.blur / 100) * 0.04 * layout.height, layout)})` : '', lookFilter({ ...look, blur: 0 }, 0)].filter(Boolean).join(' ')
      : undefined;
    const overlays = lookOverlay(look);
    const img = (
      <img
        className={overlays.length ? 'slide-graphic-image' : className}
        src={mediaUrl(g.path)}
        style={overlays.length ? { objectFit: FIT[g.scale], filter } : { ...frame, objectFit: FIT[g.scale], filter }}
        alt=""
        draggable={false}
      />
    );
    if (!overlays.length) return img;
    return (
      <div className={className} style={frame}>
        {img}
        {overlays.map((o, i) => (
          <div key={i} className="look-overlay" style={o} />
        ))}
      </div>
    );
  }
  const radius = g.shape === 'ellipse' ? '50%' : g.shape === 'rounded' ? slidePx(Math.min(g.width, g.height) * 0.5 * Math.min(1, g.roundness || 0.2), layout) : undefined;
  return (
    <div
      className={className}
      style={{
        ...frame,
        background: g.fill ?? undefined,
        borderRadius: radius,
        boxShadow: g.stroke ? `inset 0 0 0 ${slidePx(g.stroke.width, layout)} ${g.stroke.color}` : undefined
      }}
    />
  );
}

/**
 * Draws a slide's text boxes, pictures and shapes where they sit on the slide,
 * in their stacking order, letterboxed to the slide's aspect ratio inside
 * whatever contains it.
 *
 * Slideshow slides are drawn at a click: `step` (or the layout's own `step`),
 * playing each click's effects when `animate` is on (the audience screens).
 * Without either, everything that ever comes on is drawn.
 */
export function SlideCanvas({ layout, step, animate = false, ghost = false }: { layout: SlideLayout; step?: number; animate?: boolean; ghost?: boolean }): React.JSX.Element {
  const at = layout.slideshow ? (step ?? layout.step) : undefined;
  const move = useBuildMove(at, animate);
  const looks = useMediaLooks();
  // Word animations play on the screens only, for songs (a slideshow has its own clicks).
  const builds: Builds = {
    step: at,
    move,
    ghost,
    ...(animate && !layout.slideshow && layout.words ? { words: layout.words } : {})
  };
  return (
    <div className="slide-fit">
      <div
        className="slide-frame"
        style={{ aspectRatio: `${layout.width} / ${layout.height}`, width: `min(100cqw, calc(100cqh * ${layout.width / layout.height}))`, background: layout.background }}
      >
        {[
          ...layout.boxes.map((box, i) => ({
            z: box.z,
            key: `t${i}`,
            node: <TextBox box={box} layout={layout} at={builds} />
          })),
          ...(layout.graphics ?? []).map((g, i) => ({
            z: g.z,
            key: `g${i}`,
            node: <Graphic g={g} layout={layout} at={builds} looks={looks} />
          }))
        ]
          .sort((a, b) => a.z - b.z)
          .map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
      </div>
    </div>
  );
}
