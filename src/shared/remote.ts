// What a phone or tablet sees and can do through the remote control.
import type { TimerState } from './timer';
import { isControlAction, type ControlAction } from './control';

export interface RemoteSlide {
  text: string;
  group: string;
  color?: string;
}

/** Everything the remote page shows; pushed to phones whenever it changes. */
export interface RemoteState {
  presentation: { name: string; slides: RemoteSlide[]; liveIndex: number | null } | null;
  service: { name: string; items: Array<{ name: string; kind: 'header' | 'presentation'; current: boolean; live: boolean }> } | null;
  live: { text: string; cleared: boolean; blackout: boolean };
  next: RemoteSlide | null;
  timer: TimerState;
  message: string;
}

/** Who signed in: the operator (everything) or the person speaking (the presenter view). */
export type RemoteRole = 'operator' | 'presenter';

export interface PresenterSlide {
  text: string;
  notes: string;
  group: string;
  color?: string;
  /** Turned-off slides are passed over by Next and Back. */
  enabled: boolean;
}

/** What the presenter view shows: the presentation on screen (or about to be), with its notes. */
export interface PresenterState {
  presentation: {
    id: string;
    name: string;
    slides: PresenterSlide[];
    liveIndex: number | null;
    /** When this presentation first went on screen (ms since 1970), for "Speaking 12:48". */
    speakingSince: number | null;
  } | null;
  blackout: boolean;
  /** Pictures of the slides once drawn, at /api/slides/<key>/<index>.jpg. */
  pictures?: { key: string; count: number };
}

export type RemoteCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'clear' }
  | { type: 'clearAll' }
  | { type: 'black' }
  | { type: 'goto'; index: number }
  | { type: 'openRow'; row: number }
  | { type: 'timer'; action: 'start' | 'pause' | 'reset' }
  | { type: 'message'; text: string }
  /** Anything else a Stream Deck, Companion or MIDI can do. */
  | { type: 'action'; action: ControlAction };

export const MAX_MESSAGE_LENGTH = 200;

/** A presenter can move through their own slides and blank the screen, nothing else. */
export function presenterMay(command: RemoteCommand): boolean {
  return command.type === 'next' || command.type === 'prev' || command.type === 'goto' || command.type === 'black';
}

/** Check untrusted input from the network; returns a clean command or null. */
export function parseRemoteCommand(input: unknown): RemoteCommand | null {
  if (!input || typeof input !== 'object') return null;
  const c = input as Record<string, unknown>;
  const index = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 10_000 ? v : null);
  switch (c.type) {
    case 'next':
    case 'prev':
    case 'clear':
    case 'clearAll':
    case 'black':
      return { type: c.type };
    case 'goto': {
      const i = index(c.index);
      return i === null ? null : { type: 'goto', index: i };
    }
    case 'openRow': {
      const i = index(c.row);
      return i === null ? null : { type: 'openRow', row: i };
    }
    case 'timer':
      return c.action === 'start' || c.action === 'pause' || c.action === 'reset' ? { type: 'timer', action: c.action } : null;
    case 'message':
      return typeof c.text === 'string' ? { type: 'message', text: c.text.slice(0, MAX_MESSAGE_LENGTH) } : null;
    case 'action':
      return isControlAction(c.action) ? { type: 'action', action: c.action } : null;
    default:
      return null;
  }
}

/** Status of the remote server, for the operator's Remote window. */
export interface RemoteStatus {
  enabled: boolean;
  pin: string;
  /** The presenter view's own PIN. */
  presenterPin: string;
  port: number | null;
  urls: string[];
  clients: number;
  /** Of those, how many are presenters. */
  presenters: number;
  error?: string;
}
