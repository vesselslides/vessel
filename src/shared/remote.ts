// What a phone or tablet sees and can do through the remote control.
import type { TimerState } from './timer';

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

export type RemoteCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'clear' }
  | { type: 'clearAll' }
  | { type: 'black' }
  | { type: 'goto'; index: number }
  | { type: 'openRow'; row: number }
  | { type: 'timer'; action: 'start' | 'pause' | 'reset' }
  | { type: 'message'; text: string };

export const MAX_MESSAGE_LENGTH = 200;

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
    default:
      return null;
  }
}

/** Status of the remote server, for the operator's Remote window. */
export interface RemoteStatus {
  enabled: boolean;
  pin: string;
  port: number | null;
  urls: string[];
  clients: number;
  error?: string;
}
