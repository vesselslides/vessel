import { Fragment, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { cssFont } from '../../shared/fonts';
import { mediaUrl } from '../../shared/media';
import type { GraphicLayout, SlideLayout, TextBoxLayout } from '../../shared/types';

const JUSTIFY: Record<TextBoxLayout['valign'], CSSProperties['justifyContent']> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** Lengths in slide pixels become fractions of the slide frame's width. */
const slidePx = (px: number, layout: SlideLayout): string => `${((px / layout.width) * 100).toFixed(4)}cqw`;

function TextBox({ box, layout }: { box: TextBoxLayout; layout: SlideLayout }): React.JSX.Element {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  // Shrink-to-fit: lower --fit until the text no longer overflows the box.
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = (): void => {
      i.style.setProperty('--fit', '1');
      if (!box.shrink) return;
      let scale = 1;
      for (let n = 0; n < 24 && (i.scrollHeight > o.clientHeight + 1 || i.scrollWidth > o.clientWidth + 1) && scale > 0.15; n++) {
        scale *= 0.92;
        i.style.setProperty('--fit', scale.toFixed(3));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    return () => ro.disconnect();
  }, [box]);

  const font = cssFont(box.font, box.bold, box.italic);
  const style: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    fontStyle: font.italic ? 'italic' : 'normal',
    fontSize: `calc(${slidePx(box.sizePt, layout)} * var(--fit, 1))`,
    color: box.color,
    textAlign: box.align,
    textTransform: box.uppercase ? 'uppercase' : 'none',
    textShadow: box.shadow ? '0 0.05em 0.15em rgba(0, 0, 0, 0.75)' : 'none',
    WebkitTextStroke: box.outline ? `${slidePx(box.outline.width, layout)} ${box.outline.color}` : undefined,
    paintOrder: box.outline ? 'stroke fill' : undefined
  };
  return (
    <div
      ref={outer}
      className="text-box"
      style={{
        left: `${(box.x / layout.width) * 100}%`,
        top: `${(box.y / layout.height) * 100}%`,
        width: `${(box.width / layout.width) * 100}%`,
        height: `${(box.height / layout.height) * 100}%`,
        justifyContent: JUSTIFY[box.valign],
        background: box.fill
      }}
    >
      <div ref={inner} className="text-box-text" style={style}>
        {box.text}
      </div>
    </div>
  );
}

const FIT: Record<string, CSSProperties['objectFit']> = { fit: 'contain', fill: 'cover', stretch: 'fill' };

/** A picture or shape placed on the slide. */
function Graphic({ g, layout }: { g: GraphicLayout; layout: SlideLayout }): React.JSX.Element {
  const frame: CSSProperties = {
    left: `${(g.x / layout.width) * 100}%`,
    top: `${(g.y / layout.height) * 100}%`,
    width: `${(g.width / layout.width) * 100}%`,
    height: `${(g.height / layout.height) * 100}%`,
    opacity: g.opacity,
    transform: g.rotation ? `rotate(${g.rotation}deg)` : undefined
  };
  if (g.kind === 'image') {
    return <img className="slide-graphic" src={mediaUrl(g.path)} style={{ ...frame, objectFit: FIT[g.scale] }} alt="" draggable={false} />;
  }
  const radius = g.shape === 'ellipse' ? '50%' : g.shape === 'rounded' ? slidePx(Math.min(g.width, g.height) * 0.5 * Math.min(1, g.roundness || 0.2), layout) : undefined;
  return (
    <div
      className="slide-graphic"
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
 */
export function SlideCanvas({ layout }: { layout: SlideLayout }): React.JSX.Element {
  return (
    <div className="slide-fit">
      <div
        className="slide-frame"
        style={{ aspectRatio: `${layout.width} / ${layout.height}`, width: `min(100cqw, calc(100cqh * ${layout.width / layout.height}))`, background: layout.background }}
      >
        {[...layout.boxes.map((box, i) => ({ z: box.z, key: `t${i}`, node: <TextBox box={box} layout={layout} /> })), ...(layout.graphics ?? []).map((g, i) => ({ z: g.z, key: `g${i}`, node: <Graphic g={g} layout={layout} /> }))]
          .sort((a, b) => a.z - b.z)
          .map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
      </div>
    </div>
  );
}
