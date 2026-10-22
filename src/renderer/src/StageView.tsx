import { useEffect, useState } from 'react';
import { formatClock, formatTimer, isRunning, timerValue } from '../../shared/timer';
import { DEFAULT_STAGE_LAYOUT } from '../../shared/stage';
import type { StageState } from '../../shared/types';
import { SlideText } from './SlideText';

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
          </div>
          {layout.timer ? timer : <div />}
        </div>
      )}

      {layout.current && (
        <div className="stage-current">{state.current ? <SlideText text={state.current.text} scale={layout.textSize} /> : <div className="stage-empty">—</div>}</div>
      )}

      {layout.next && (
        <div className={`stage-next ${layout.current ? '' : 'alone'}`}>
          <div className="stage-next-label">
            Next{state.next ? ` · ${state.next.groupName || state.next.label || 'slide'}` : ''}
          </div>
          <div className="stage-next-text">{state.next ? <SlideText text={state.next.text} scale={layout.textSize} /> : <div className="stage-empty">End</div>}</div>
        </div>
      )}

      {state.message.trim() && <div className="stage-message">{state.message}</div>}
    </div>
  );
}
