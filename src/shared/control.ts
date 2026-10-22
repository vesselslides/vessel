// Control from outside the keyboard and mouse: MIDI (pads, keyboards,
// lighting desks) and a Stream Deck or Companion over the network. Both run
// the same actions, listed here.

export const CONTROL_ACTIONS = [
  { id: 'next', label: 'Next slide' },
  { id: 'prev', label: 'Previous slide' },
  { id: 'clear', label: 'Clear text' },
  { id: 'clear-media', label: 'Clear media' },
  { id: 'clear-all', label: 'Clear all' },
  { id: 'black', label: 'Black screen on or off' },
  { id: 'logo', label: 'Logo on or off' },
  { id: 'video', label: 'Play or pause the video' },
  { id: 'timer', label: 'Start or pause the timer' },
  { id: 'timer-reset', label: 'Reset the timer' },
  { id: 'hide-message', label: 'Hide the message' },
  { id: 'hide-lower-third', label: 'Hide the lower third' }
] as const;

export type ControlAction = (typeof CONTROL_ACTIONS)[number]['id'];

export const isControlAction = (s: unknown): s is ControlAction => CONTROL_ACTIONS.some((a) => a.id === s);

/** A MIDI message that can run an action. Channels are 0–15 (shown as 1–16). */
export interface MidiTrigger {
  kind: 'note' | 'cc' | 'program';
  channel: number;
  number: number;
}

export interface MidiSettings {
  enabled: boolean;
  /** Only listen to this device (by name); empty listens to all. */
  input: string;
  bindings: Partial<Record<ControlAction, MidiTrigger>>;
}

export const DEFAULT_MIDI: MidiSettings = { enabled: false, input: '', bindings: {} };

/**
 * The trigger in a raw MIDI message, or null. Notes count when pressed, not
 * released; a controller counts when it goes from below half-way to above (a
 * button sending 127 then 0 fires once); a program change always counts.
 * `held` remembers controllers between messages.
 */
export function midiTriggerOf(data: ArrayLike<number>, held: Map<string, boolean>): MidiTrigger | null {
  const status = data[0] ?? 0;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const number = (data[1] ?? 0) & 0x7f;
  const value = (data[2] ?? 0) & 0x7f;
  if (type === 0x90 && value > 0) return { kind: 'note', channel, number };
  if (type === 0xc0) return { kind: 'program', channel, number };
  if (type === 0xb0) {
    const key = `${channel}:${number}`;
    const down = value >= 64;
    const was = held.get(key) ?? false;
    held.set(key, down);
    return down && !was ? { kind: 'cc', channel, number } : null;
  }
  return null;
}

export const sameTrigger = (a: MidiTrigger | undefined, b: MidiTrigger | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.channel === b.channel && a.number === b.number;

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** "Note C4, channel 1", "Controller 20, channel 10", "Program 5, channel 1". */
export function describeTrigger(t: MidiTrigger): string {
  const what =
    t.kind === 'note' ? `Note ${NOTES[t.number % 12]}${Math.floor(t.number / 12) - 1}` : t.kind === 'cc' ? `Controller ${t.number}` : `Program ${t.number + 1}`;
  return `${what}, channel ${t.channel + 1}`;
}

/** The action a trigger is set to run, if any. */
export function actionForTrigger(bindings: MidiSettings['bindings'], t: MidiTrigger): ControlAction | null {
  const hit = CONTROL_ACTIONS.find((a) => sameTrigger(bindings[a.id], t));
  return hit?.id ?? null;
}

/** Stored MIDI settings, with anything unusable left out. */
export function normalizeMidi(raw: unknown): MidiSettings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<MidiSettings>) : {};
  const bindings: MidiSettings['bindings'] = {};
  for (const [action, t] of Object.entries(r.bindings ?? {})) {
    if (!isControlAction(action) || !t || typeof t !== 'object') continue;
    const { kind, channel, number } = t as MidiTrigger;
    if ((kind === 'note' || kind === 'cc' || kind === 'program') && Number.isInteger(channel) && channel >= 0 && channel < 16 && Number.isInteger(number) && number >= 0 && number < 128)
      bindings[action] = { kind, channel, number };
  }
  return { enabled: !!r.enabled, input: typeof r.input === 'string' ? r.input : '', bindings };
}

/** Set `action` to `trigger`, taking that trigger off any other action. */
export function bindTrigger(m: MidiSettings, action: ControlAction, trigger: MidiTrigger | null): MidiSettings {
  const bindings: MidiSettings['bindings'] = {};
  for (const [a, t] of Object.entries(m.bindings) as Array<[ControlAction, MidiTrigger]>) if (a !== action && !sameTrigger(t, trigger ?? undefined)) bindings[a] = t;
  if (trigger) bindings[action] = trigger;
  return { ...m, bindings };
}
