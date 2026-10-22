import { useEffect, useState } from 'react';
import { bindTrigger, CONTROL_ACTIONS, describeTrigger, normalizeMidi, type ControlAction, type MidiSettings } from '../../shared/control';
import type { RemoteStatus } from '../../shared/remote';
import type { Settings } from '../../shared/types';
import { listenMidi, watchMidiInputs } from './midi';

/** Preferences ▸ Control: MIDI notes and controllers for actions, and the addresses a Stream Deck or Companion calls. */
export function ControlPrefs({
  settings,
  onSettings,
  remote,
  onOpenRemote
}: {
  settings: Settings | null;
  onSettings: (patch: Partial<Settings>) => void;
  remote: RemoteStatus | null;
  onOpenRemote: () => void;
}): React.JSX.Element {
  const midi = normalizeMidi(settings?.midi);
  const save = (next: MidiSettings): void => onSettings({ midi: next });
  const [inputs, setInputs] = useState<string[] | null>([]);
  const [learning, setLearning] = useState<ControlAction | null>(null);
  const [lastHeard, setLastHeard] = useState('');

  useEffect(() => (midi.enabled ? watchMidiInputs(setInputs) : undefined), [midi.enabled]);
  useEffect(() => {
    if (!midi.enabled) return;
    return listenMidi((trigger, input) => {
      if (midi.input && midi.input !== input) return;
      setLastHeard(`${describeTrigger(trigger)} from ${input}`);
      if (learning) {
        save(bindTrigger(midi, learning, trigger));
        setLearning(null);
      }
    });
    // Re-listen when what's being learned (or the settings it saves into) changes.
  }, [midi.enabled, midi.input, learning, settings?.midi]);

  const address = remote?.urls[0]?.replace(/\/$/, '');

  return (
    <>
      <h3>MIDI</h3>
      <p className="hint">Run slides from a MIDI pad, keyboard or lighting desk: choose an action, press Learn, then press the pad or key.</p>
      <label className="pref-check">
        <input type="checkbox" checked={midi.enabled} onChange={(e) => save({ ...midi, enabled: e.target.checked })} />
        Listen to MIDI
      </label>
      {midi.enabled && (
        <>
          <label className="pref-field">
            Device
            <select value={midi.input} onChange={(e) => save({ ...midi, input: e.target.value })}>
              <option value="">Any device</option>
              {midi.input && !inputs?.includes(midi.input) && <option value={midi.input}>{midi.input} (not plugged in)</option>}
              {inputs?.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {inputs === null && <p className="hint">This computer doesn’t offer MIDI.</p>}
          {inputs?.length === 0 && <p className="hint">No MIDI devices are plugged in.</p>}
          <table className={`midi-table ${learning ? 'midi-learning' : ''}`}>
            <tbody>
              {CONTROL_ACTIONS.map((a) => {
                const t = midi.bindings[a.id];
                return (
                  <tr key={a.id}>
                    <td>{a.label}</td>
                    <td className="muted">{learning === a.id ? 'Press a pad or key…' : t ? describeTrigger(t) : '—'}</td>
                    <td>
                      <button className={learning === a.id ? 'active-toggle' : ''} onClick={() => setLearning(learning === a.id ? null : a.id)}>
                        {learning === a.id ? 'Cancel' : 'Learn'}
                      </button>
                      {t && (
                        <button className="icon-button forget" aria-label={`Forget the MIDI trigger for ${a.label}`} onClick={() => save(bindTrigger(midi, a.id, null))}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lastHeard && <p className="hint">Last heard: {lastHeard}</p>}
        </>
      )}

      <h3>Stream Deck and Companion</h3>
      <p className="hint">
        Buttons on a Stream Deck (with an HTTP request plugin, or the Website action set to “GET request in background”) or in Bitfocus Companion can run the
        same actions over the network. They use the remote control’s address and PIN.
      </p>
      {remote?.enabled && address ? (
        <>
          <p className="control-url">
            <code>
              {address}/api/control/<b>next</b>
            </code>
          </p>
          <p className="hint">
            Send the PIN in an <code>X-Vessel-Pin</code> header, or add <code>?pin={remote.pin}</code> to the address. The last part is the action:{' '}
            {CONTROL_ACTIONS.map((a) => a.id).join(', ')}.
          </p>
        </>
      ) : (
        <p className="hint">Turn on the remote control first.</p>
      )}
      <div className="pref-buttons">
        <button onClick={onOpenRemote}>Remote control…</button>
      </div>
    </>
  );
}
