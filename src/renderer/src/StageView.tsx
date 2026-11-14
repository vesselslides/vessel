import { useEffect, useState, type CSSProperties } from 'react';
import { capoShape, chordNumber, prettyChord } from '../../shared/chords';
import { formatClock, formatTimer, isRunning, timerValue } from '../../shared/timer';
import { DEFAULT_STAGE_LAYOUT, type StageLayout } from '../../shared/stage';
import type { StageSlide, StageState } from '../../shared/types';
import { SlideText } from './SlideText';

/** A chord as the stage shows it: a capo's shapes or a Nashville number. */
function chordLabel(chord: string, key: string | undefined, layout: StageLayout): string {
  if (layout.chordStyle === 'numbers' && key) return chordNumber(chord, key);
  return prettyChord(key ? capoShape(chord, layout.capo, key) : chord);
}

/** The words with each chord above the letter it's played on, scaled to fit like SlideText. */
export function ChordText({ slide, layout, scale = 1 }: { slide: StageSlide; layout: StageLayout; scale?: number }): React.JSX.Element {
  const lines = slide.text.split('\n');
  const longest = Math.max(8, ...lines.map((l) => l.length));
  // Each line of words carries a line of chords above it.
  const lineHeight = 1.25 * (1 + layout.chordSize * 0.85);
  const style = {
    fontSize: `min(${(6.5 * scale).toFixed(2)}cqw, calc(90cqw / ${(longest * 0.55).toFixed(2)}), calc(86cqh / ${(lines.length * lineHeight).toFixed(2)}))`,
    '--chord-size': `${layout.chordSize}em`,
    '--chord-color': layout.chordColor
  } as CSSProperties;
  let offset = 0;
  return (
    <div className="slide-text chord-text" style={style}>
      {lines.map((line, li) => {
        const start = offset;
        offset += line.length + 1;
        const here = (slide.chords ?? []).filter((c) => c.at >= start && c.at <= start + line.length).map((c) => ({ at: c.at - start, chord: c.chord }));
        // Pieces of the line, each starting where a chord is played.
        const cuts = [...new Set([0, ...here.map((c) => c.at)])].sort((a, b) => a - b);
        return (
          <div key={li} className="chord-line">
            {cuts.map((at, i) => {
              const words = line.slice(at, cuts[i + 1] ?? line.length);
              const chords = here.filter((c) => c.at === at).map((c) => chordLabel(c.chord, slide.key, layout));
              return (
                <span key={at} className="chord-piece">
                  <span className="chord">{chords.join(' ') || '\u00a0'}</span>
                  <span className="chord-words">{words || '\u00a0'}</span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** A slide on the stage: with chords above the words when it has some and they're switched on. */
function StageText({ slide, layout }: { slide: StageSlide; layout: StageLayout }): React.JSX.Element {
  return layout.chords && slide.chords?.length ? <ChordText slide={slide} layout={layout} scale={layout.textSize} /> : <SlideText text={slide.text} scale={layout.textSize} />;
}

/** Re-render on an interval so clocks and timers move. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function timerTone(state: StageState, now: number): string {
  const t = state.timer;
  if (!isRunning(t) && t.elapsedMs === 0) return 'idle';
  if (t.mode === 'countup') return isRunning(t) ? 'ok' : 'paused';
  const left = timerValue(t, now);
  if (left < 0) return 'over';
  if (!isRunning(t)) return 'paused';
  return left <= 60_000 ? 'warn' : 'ok';
}

/** What the people on stage see: clock, timer, current and next slide, and messages, as the layout says. */
export function StageView({ state }: { state: StageState }): React.JSX.Element {
  const now = useNow();
  const tone = timerTone(state, now);
  const layout = state.layout ?? DEFAULT_STAGE_LAYOUT;
  const top = layout.clock || layout.timer || (layout.groupName && (layout.current || layout.next));
  const bigClock = !layout.current && !layout.next;
  // Rows: the top bar, the current slide, then the next slide at its share of the height.
  const rows = [top && !bigClock ? 'auto' : null, layout.current ? 'minmax(0, 1fr)' : null, layout.next ? (layout.current ? `${Math.round(layout.nextShare * 100)}%` : 'minmax(0, 1fr)') : null]
    .filter(Boolean)
    .join(' ');
  const timer = (
    <div className={`stage-timer ${tone}`}>
      {formatTimer(state.timer, now)}
      {tone === 'paused' && <span className="stage-timer-note">paused</span>}
    </div>
  );

  if (bigClock) {
    return (
      <div className="stage-view stage-big">
        {layout.clock && <div className="stage-clock">{formatClock(now)}</div>}
        {layout.timer && timer}
        {!layout.clock && !layout.timer && <div className="stage-empty">—</div>}
        {state.message.trim() && <div className="stage-message">{state.message}</div>}
      </div>
    );
  }

  return (
    <div className={`stage-view align-${layout.align}`} style={{ gridTemplateRows: rows }}>
      {top && (
        <div className="stage-top">
          <div className="stage-clock">{layout.clock ? formatClock(now) : ''}</div>
          <div className="stage-current-label" style={{ color: state.current?.groupColor }}>
            {layout.groupName && state.current ? state.current.groupName || state.current.label : ''}
            {layout.chords && state.current?.chords?.length && state.current.key ? (
              <span className="stage-key">
                {' '}
                · Key {prettyChord(state.current.key)}
                {layout.capo && layout.chordStyle === 'letters' ? ` · capo ${layout.capo}` : ''}
              </span>
            ) : null}
          </div>
          {layout.timer ? timer : <div />}
        </div>
      )}

      {layout.current && (
        <div className="stage-current">{state.current ? <StageText slide={state.current} layout={layout} /> : <div className="stage-empty">—</div>}</div>
      )}

      {layout.next && (
        <div className={`stage-next ${layout.current ? '' : 'alone'}`}>
          <div className="stage-next-label">
            Next{state.next ? ` · ${state.next.groupName || state.next.label || 'slide'}` : ''}
          </div>
          <div className="stage-next-text">{state.next ? <StageText slide={state.next} layout={layout} /> : <div className="stage-empty">End</div>}</div>
        </div>
      )}

      {state.message.trim() && <div className="stage-message">{state.message}</div>}
    </div>
  );
}
