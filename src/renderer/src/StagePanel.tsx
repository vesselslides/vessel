import { useEffect, useState } from 'react';
import { formatClock, formatDuration, isRunning, parseDuration, parseTimeOfDay, pauseTimer, resetTimer, startTimer, timerToTime, timerWithMode } from '../../shared/timer';
import { DEFAULT_STAGE_LAYOUT, chordDisplayOf, presetOf, STAGE_PRESETS, type StageLayout } from '../../shared/stage';
import type { SongKey } from '../../shared/chords';
import type { StageState } from '../../shared/types';
import { StageView } from './StageView';
import { Fold } from './Fold';
import { KeyButton } from './KeyButton';

/** Operator controls for the stage display: preview, timer and stage message. */
export function StagePanel({
  stage,
  onChange,
  onLayout,
  liveSong,
  onLiveKey
}: {
  stage: StageState;
  onChange: (patch: Partial<StageState>) => void;
  /** A new stage layout, to show and remember. */
  onLayout: (layout: StageLayout) => void;
  /** The song on screen, when it has chords: its key, to transpose on the spot. */
  liveSong?: { key?: SongKey; guess: string | null } | null;
  onLiveKey?: (key: SongKey) => void;
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
  const [target, setTarget] = useState(t.target ?? '');
  const [targetError, setTargetError] = useState(false);
  useEffect(() => setTarget(t.target ?? ''), [t.target]);

  const commitTarget = (): void => {
    const time = parseTimeOfDay(target);
    setTargetError(!time);
    if (time) onChange({ timer: timerToTime(time, Date.now(), t.durationMs) });
  };

  const commitDuration = (): void => {
    const ms = parseDuration(duration);
    setDurationError(ms === null || ms <= 0);
    if (ms !== null && ms > 0 && ms !== t.durationMs) onChange({ timer: { ...resetTimer(t), durationMs: ms } });
  };

  return (
    <Fold id="stage" title="Stage" className="stage-section" active={isRunning(t) && 'timer running'} defaultOpen={true}>
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
              // A new layout keeps how chords are shown.
              if (chosen) onLayout({ ...chosen.layout, ...chordDisplayOf(layout) });
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
        {liveSong && onLiveKey && (
          <div className="stage-row stage-chords-row">
            <label title="Chords above the words on the stage screen (never on the audience screen)">
              <input type="checkbox" checked={layout.chords} onChange={(e) => change({ chords: e.target.checked })} /> Chords
            </label>
            <span className="spacer" />
            <KeyButton songKey={liveSong.key} guess={liveSong.guess} onChange={onLiveKey} align="end" />
          </div>
        )}
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
            {(layout.current || layout.next) && (
              <div className="stage-chord-options">
                <label>
                  <input type="checkbox" checked={layout.chords} onChange={(e) => change({ chords: e.target.checked })} /> Chords above the words
                </label>
                {layout.chords && (
                  <div className="stage-row">
                    <select value={layout.chordStyle} onChange={(e) => change({ chordStyle: e.target.value as StageLayout['chordStyle'] })} title="Chord names, or Nashville numbers for the key">
                      <option value="letters">Letters: G C D</option>
                      <option value="numbers">Numbers: 1 4 5</option>
                    </select>
                    {layout.chordStyle === 'letters' && (
                      <select value={layout.capo} onChange={(e) => change({ capo: Number(e.target.value) })} title="Show the chord shapes a guitarist plays with a capo">
                        <option value={0}>No capo</option>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <option key={n} value={n}>
                            Capo {n}
                          </option>
                        ))}
                      </select>
                    )}
                    <select value={layout.chordSize} onChange={(e) => change({ chordSize: Number(e.target.value) })} title="Chord size, compared with the words">
                      <option value={0.6}>Small</option>
                      <option value={0.8}>Medium</option>
                      <option value={1}>Large</option>
                    </select>
                    <input type="color" value={layout.chordColor} title="Chord colour" onChange={(e) => change({ chordColor: e.target.value })} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="stage-row">
          <select
            value={t.mode}
            onChange={(e) => {
              const mode = e.target.value;
              if (mode === 'clock') {
                // Start from the next whole half hour, a likely service time.
                const at = new Date(Date.now() + 30 * 60_000);
                at.setMinutes(at.getMinutes() < 30 ? 30 : 60, 0, 0);
                onChange({
                  timer: timerToTime({ hours: at.getHours(), minutes: at.getMinutes() }, Date.now(), t.durationMs)
                });
              } else
                onChange({
                  timer: timerWithMode(t, mode === 'countup' ? 'countup' : 'countdown')
                });
            }}
          >
            <option value="countdown">Countdown</option>
            <option value="clock">Count down to a time</option>
            <option value="countup">Count up</option>
          </select>
          {t.mode === 'clock' && (
            <input
              value={target}
              title="The time to count down to, e.g. 10:00, 9:30 am or 18:30"
              aria-invalid={targetError}
              style={targetError ? { borderColor: 'var(--live)' } : undefined}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={commitTarget}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          )}
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
        {t.mode === 'clock' && t.targetAt ? (
          <p className="hint">
            Counting down to {formatClock(t.targetAt)}
            {new Date(t.targetAt).getDate() !== new Date().getDate() ? ' tomorrow' : ''}. Put {'{timer}'} in a message to show it to everyone.
          </p>
        ) : (
          <div className="stage-row">
            <button
              className={`grow ${isRunning(t) ? '' : 'primary'}`}
              onClick={() =>
                onChange({
                  timer: isRunning(t) ? pauseTimer(t, Date.now()) : startTimer(t, Date.now())
                })
              }
            >
              {isRunning(t) ? 'Pause timer' : t.elapsedMs > 0 ? 'Resume timer' : 'Start timer'}
            </button>
            <button onClick={() => onChange({ timer: resetTimer(t) })} disabled={!isRunning(t) && t.elapsedMs === 0}>
              Reset
            </button>
          </div>
        )}
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
    </Fold>
  );
}
