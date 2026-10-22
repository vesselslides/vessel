import { useState } from 'react';
import { parseSeconds } from '../../shared/timer';

/** A timer length of your own, for a whole presentation (loop or once) or one slide. */
export function TimerDialog({
  title,
  seconds,
  loop,
  onSave,
  onCancel
}: {
  title: string;
  /** The current length, if there is one. */
  seconds?: number;
  /** For a whole presentation: loop back to the first slide, or play through once. Undefined for one slide. */
  loop?: boolean;
  onSave: (seconds: number, loop: boolean) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [text, setText] = useState(seconds ? String(seconds) : '');
  const [looping, setLooping] = useState(loop ?? true);
  const value = parseSeconds(text);
  const save = (): void => {
    if (value !== null) onSave(value, looping);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal timer-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <label>
          Move on after
          <input
            autoFocus
            value={text}
            placeholder="e.g. 12, 1:30 or 2m"
            aria-invalid={!!text.trim() && value === null}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </label>
        <p className={`hint ${text.trim() && value === null ? 'error' : ''}`}>
          {!text.trim()
            ? 'Seconds (12), minutes and seconds (1:30), or minutes (2m). Up to an hour.'
            : value === null
              ? 'That isn’t a time Vessel understands, or it’s over an hour.'
              : `Each slide stays up for ${value >= 60 ? `${Math.floor(value / 60)} min ${Math.round(value % 60)} s` : `${value} seconds`}.`}
        </p>
        {loop !== undefined && (
          <div className="timer-choice">
            <label>
              <input type="radio" checked={looping} onChange={() => setLooping(true)} /> Loop back to the first slide
            </label>
            <label>
              <input type="radio" checked={!looping} onChange={() => setLooping(false)} /> Play through once, stopping on the last slide
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={value === null} onClick={save}>
            Set timer
          </button>
        </div>
      </div>
    </div>
  );
}
