// Messages: a line of text shown along the bottom of the audience screen, over
// the slides ("Parents of child 42, please come to the nursery", "We begin in
// {timer}"). Tokens are filled in on screen, so a countdown keeps moving.
import { formatClock, formatTimer, type TimerState } from './timer';

/** A message kept for reuse (Settings.messages). */
export interface SavedMessage {
  id: string;
  text: string;
}

/** What the audience screen shows as a message. */
export interface LiveMessage {
  text: string;
  /** The timer {timer} stands for (the one under Stage). */
  timer: TimerState;
}

export const MESSAGE_TOKENS: Array<{ token: string; label: string }> = [
  { token: '{timer}', label: 'the timer' },
  { token: '{clock}', label: 'the time now' }
];

export const hasTokens = (text: string): boolean => /\{(timer|clock)\}/i.test(text);

/** The message with its tokens replaced by the timer and the time now. */
export function fillMessage(text: string, timer: TimerState, now: number): string {
  return text.replace(/\{timer\}/gi, () => formatTimer(timer, now)).replace(/\{clock\}/gi, () => formatClock(now));
}

/** Saved messages as stored, with anything unusable left out. */
export function normalizeMessages(raw: unknown): SavedMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is SavedMessage => !!m && typeof m.id === 'string' && typeof m.text === 'string' && !!m.text.trim())
    .map((m) => ({ id: m.id, text: m.text.slice(0, 500) }));
}

/** Keep `text` at the top of the saved list (once), most recent first. */
export function rememberMessage(list: SavedMessage[], text: string, limit = 30): SavedMessage[] {
  const clean = text.trim();
  if (!clean) return list;
  const existing = list.find((m) => m.text === clean);
  return [existing ?? { id: crypto.randomUUID(), text: clean }, ...list.filter((m) => m.text !== clean)].slice(0, limit);
}
