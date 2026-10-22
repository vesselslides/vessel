import { useEffect, useState } from 'react';
import { formatDuration, isRunning, parseDuration, pauseTimer, resetTimer, startTimer, type TimerMode } from '../../shared/timer';
import { DEFAULT_STAGE_LAYOUT, presetOf, STAGE_PRESETS, type StageLayout } from '../../shared/stage';
import type { StageState } from '../../shared/types';
import { StageView } from './StageView';

/** Operator controls for the stage display: preview, timer and stage message. */
export function StagePanel({
  stage,
  onChange,
  onLayout
}: {
  stage: StageState;
  onChange: (patch: Partial<StageState>) => void;
  /** A new stage layout, to show and remember. */
  onLayout: (layout: StageLayout) => void;
}): React.JSX.Element {
  const t = stage.timer;
  const layout = stage.layout ?? DEFAULT_STAGE_LAYOUT;
  const preset = presetOf(layout);
  const [adjusting, setAdjusting] = useState(false);
  const change = (patch: Partial<StageLayout>): void => onLayout({ ...layout, ...patch });
  const part = (key: 'clock' | 'timer' | 'groupName' | 'current' | 'next', label: string): React.JSX.Element => (
    <label>
      <input type="checkbox" checked={layout[key]} onChange={(e) => change({ [key]: e.target.checked })} /> {label}
    </label>
  );
  const [duration, setDuration] = useState(formatDuration(t.durationMs));
  const [durationError, setDurationError] = useState(false);
  const [message, setMessage] = useState(stage.message);
  useEffect(() => setDuration(formatDuration(t.durationMs)), [t.durationMs]);

  const commitDuration = (): void => {
    const ms = parseDuration(duration);
    setDurationError(ms === null || ms <= 0);
    if (ms !== null && ms > 0 && ms !== t.durationMs) onChange({ timer: { ...resetTimer(t), durationMs: ms } });
  };

  return (
    <section className="stage-section">
      <h3>Stage</h3>
      <div className="stage-preview">
        <StageView state={stage} />
      </div>
      <div className="stage-controls">
        <div className="stage-row">
          <select
            className="grow"
            value={preset?.id ?? 'custom'}
            title={preset?.description ?? 'Your own choice of parts'}
            onChange={(e) => {
              const chosen = STAGE_PRESETS.find((p) => p.id === e.target.value);
              if (chosen) onLayout(chosen.layout);
            }}
          >
            {STAGE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                Layout: {p.name}
              </option>
            ))}
            {!preset && <option value="custom">Layout: your own</option>}
          </select>
          <button className={adjusting ? 'active-toggle' : ''} onClick={() => setAdjusting((v) => !v)} title="Choose what the stage screen shows">
            Adjust…
          </button>
        </div>
        {adjusting && (
          <div className="stage-adjust">
            <div className="stage-parts">
              {part('clock', 'Clock')}
              {part('timer', 'Timer')}
              {part('groupName', 'Section name')}
              {part('current', 'Current slide')}
              {part('next', 'Next slide')}
            </div>
            {layout.current && layout.next && (
              <label>
                Next slide size
                <input type="range" min={20} max={60} step={5} value={Math.round(layout.nextShare * 100)} onChange={(e) => change({ nextShare: Number(e.target.value) / 100 })} />
              </label>
            )}
            {(layout.current || layout.next) && (
              <div className="stage-row">
                <select value={layout.textSize} onChange={(e) => change({ textSize: Number(e.target.value) })} title="How big lyrics may get (long slides still shrink to fit)">
                  <option value={1}>Lyrics: normal</option>
                  <option value={1.4}>Lyrics: large</option>
                  <option value={1.9}>Lyrics: very large</option>
                </select>
                <select value={layout.align} onChange={(e) => change({ align: e.target.value as StageLayout['align'] })}>
                  <option value="center">Centred</option>
                  <option value="left">Left</option>
                </select>
              </div>
            )}
          </div>
        )}
        <div className="stage-row">
          <select value={t.mode} onChange={(e) => onChange({ timer: { ...resetTimer(t), mode: e.target.value as TimerMode } })}>
            <option value="countdown">Countdown</option>
            <option value="countup">Count up</option>
          </select>
          {t.mode === 'countdown' && (
            <input
              value={duration}
              title="Length, e.g. 5, 4:30 or 90s"
              aria-invalid={durationError}
              style={durationError ? { borderColor: 'var(--live)' } : undefined}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          )}
        </div>
        <div className="stage-row">
          <button
            className={`grow ${isRunning(t) ? '' : 'primary'}`}
            onClick={() => onChange({ timer: isRunning(t) ? pauseTimer(t, Date.now()) : startTimer(t, Date.now()) })}
          >
            {isRunning(t) ? 'Pause timer' : t.elapsedMs > 0 ? 'Resume timer' : 'Start timer'}
          </button>
          <button onClick={() => onChange({ timer: resetTimer(t) })} disabled={!isRunning(t) && t.elapsedMs === 0}>
            Reset
          </button>
        </div>
        <textarea placeholder="Message for the stage, e.g. 2 minutes left" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="stage-row">
          <button className="grow" onClick={() => onChange({ message })} disabled={!message.trim() || message === stage.message}>
            {stage.message ? 'Update message' : 'Show message'}
          </button>
          <button onClick={() => onChange({ message: '' })} disabled={!stage.message}>
            Hide
          </button>
        </div>
      </div>
    </section>
  );
}
