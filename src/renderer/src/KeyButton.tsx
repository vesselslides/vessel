// The song's key, and transposing: a button showing the key it's played in,
// opening a panel with ♭ / ♯ half steps, every key to pick from, and a way
// back to the key it's written in. Used in Edit, Show and the Live panel.
import { useEffect, useRef, useState } from 'react';
import { KEYS, noteIndex, prettyChord, semitonesBetween, transposeKey, type SongKey } from '../../shared/chords';

/** "+2" / "−1" for the half steps between the written and played key, or "" when they're the same. */
function shiftLabel(key: SongKey): string {
  const up = semitonesBetween(key.written, key.play);
  const steps = up > 6 ? up - 12 : up;
  return steps === 0 ? '' : steps > 0 ? `+${steps}` : `−${-steps}`;
}

export function KeyButton({
  songKey,
  guess,
  onChange,
  compact = false,
  align = 'start'
}: {
  songKey: SongKey | undefined;
  /** A key worked out from the chords, offered when the song has none yet. */
  guess?: string | null;
  onChange: (key: SongKey) => void;
  /** Just "Key G", for tight spaces. */
  compact?: boolean;
  /** Which edge the panel lines up with. */
  align?: 'start' | 'end';
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const key = songKey ?? (guess ? { written: guess, play: guess } : undefined);
  const minor = !!key && /m$/.test(key.play);
  const shift = key ? shiftLabel(key) : '';
  // Playing in a new key moves the chords; with no key yet, the one picked is the key it's written in.
  const playIn = (play: string): void => onChange(key ? { written: key.written, play } : { written: play, play });
  const label = key ? `Key ${prettyChord(key.play)}${shift ? ` (${shift})` : ''}` : 'Set key';

  return (
    <div className={`key-button ${align === 'end' ? 'align-end' : ''}`} ref={root}>
      <button
        className={shift ? 'active-toggle' : ''}
        title={key ? `Played in ${prettyChord(key.play)}, written in ${prettyChord(key.written)}. Click to transpose.` : 'Choose the key this song is in'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {compact && key ? `${prettyChord(key.play)}${shift ? ` ${shift}` : ''}` : label}
      </button>
      {open && (
        <div className="key-panel" role="dialog" aria-label="Key and transpose">
          <div className="key-step">
            <button className="key-half" aria-label="Down a half step" title="Down a half step (♭)" disabled={!key} onClick={() => key && playIn(transposeKey(key.play, -1))}>
              ♭
            </button>
            <div className="key-now">
              <span className="key-now-name">{key ? prettyChord(key.play) : '—'}</span>
              <span className="key-now-note">{key ? (shift ? `written in ${prettyChord(key.written)}, ${shift}` : 'as written') : 'no key yet'}</span>
            </div>
            <button className="key-half" aria-label="Up a half step" title="Up a half step (♯)" disabled={!key} onClick={() => key && playIn(transposeKey(key.play, 1))}>
              ♯
            </button>
          </div>
          <div className="key-grid" role="group" aria-label="Play in">
            {KEYS.map((k) => {
              const name = minor ? `${k}m` : k;
              const playing = !!key && noteIndex(key.play) === noteIndex(k);
              const written = !!key && noteIndex(key.written) === noteIndex(k);
              return (
                <button key={k} className={`${playing ? 'active' : ''} ${written ? 'written' : ''}`} title={written ? 'The key it’s written in' : undefined} onClick={() => playIn(name)}>
                  {prettyChord(name)}
                </button>
              );
            })}
          </div>
          <div className="key-foot">
            {key && shift ? (
              <button className="link-button" onClick={() => playIn(key.written)}>
                Back to {prettyChord(key.written)}
              </button>
            ) : (
              <span className="muted">{key ? 'Pick a key, or step with ♭ ♯.' : 'Pick the key the chords are written in.'}</span>
            )}
          </div>
          <p className="hint">Chords on the stage screen and chord charts follow this key. The audience never sees chords.</p>
        </div>
      )}
    </div>
  );
}
