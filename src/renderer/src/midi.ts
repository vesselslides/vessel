// Listening to MIDI devices (Web MIDI). Every listener hears every device;
// each decides what to do with what it hears.
import { midiTriggerOf, type MidiTrigger } from '../../shared/control';

type Listener = (trigger: MidiTrigger, input: string) => void;

const listeners = new Set<Listener>();
let access: Promise<MIDIAccess | null> | null = null;
const held = new Map<string, boolean>();
const changeListeners = new Set<(inputs: string[]) => void>();

const inputNames = (a: MIDIAccess): string[] => [...a.inputs.values()].map((i) => i.name ?? 'MIDI device');

function connect(): Promise<MIDIAccess | null> {
  if (!access) {
    access = (navigator.requestMIDIAccess ? navigator.requestMIDIAccess() : Promise.reject(new Error('no MIDI')))
      .then((a) => {
        const attach = (): void => {
          a.inputs.forEach((input) => {
            input.onmidimessage = (e) => {
              const trigger = e.data ? midiTriggerOf(e.data, held) : null;
              if (trigger) for (const l of listeners) l(trigger, input.name ?? 'MIDI device');
            };
          });
          for (const l of changeListeners) l(inputNames(a));
        };
        attach();
        a.onstatechange = attach;
        return a;
      })
      .catch(() => null);
  }
  return access;
}

/** Hear MIDI triggers from every device; returns a function to stop. */
export function listenMidi(listener: Listener): () => void {
  listeners.add(listener);
  void connect();
  return () => listeners.delete(listener);
}

/** The MIDI devices plugged in now, and whenever that changes. Null if this computer has no MIDI. */
export function watchMidiInputs(onChange: (inputs: string[] | null) => void): () => void {
  changeListeners.add(onChange);
  void connect().then((a) => onChange(a ? inputNames(a) : null));
  return () => changeListeners.delete(onChange);
}
