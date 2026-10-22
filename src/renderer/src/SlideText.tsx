import type { CSSProperties } from 'react';

/**
 * Renders slide text scaled to its container, so thumbnails and the full-screen
 * output lay out identically. The container must set `container-type: size`.
 */
export function SlideText({ text, visible = true, scale = 1 }: { text: string; visible?: boolean; scale?: number }): React.JSX.Element {
  const lines = text.split('\n');
  const longest = Math.max(8, ...lines.map((l) => l.length));
  const style: CSSProperties = {
    // `scale` raises the largest size short lines may reach; long text still shrinks to fit.
    fontSize: `min(${(6.5 * scale).toFixed(2)}cqw, calc(90cqw / ${(longest * 0.52).toFixed(2)}), calc(86cqh / ${(lines.length * 1.25).toFixed(2)}))`,
    opacity: visible ? 1 : 0
  };
  return (
    <div className="slide-text" style={style}>
      {text}
    </div>
  );
}
