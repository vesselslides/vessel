// A stage timer is stored as data, not as a ticking value: every window works
// out the time on screen from the clock, so nothing has to stream updates.

/** Count down a length of time, count up, or count down to a time of day ("service starts at 10:00"). */
export type TimerMode = 'countdown' | 'countup' | 'clock';

export interface TimerState {
  mode: TimerMode;
  /** Countdown length; ignored when counting up. */
  durationMs: number;
  /** When the current run started (epoch ms), or null while stopped. */
  startedAt: number | null;
  /** Time already run before the current start (accumulates across pauses). */
  elapsedMs: number;
  /** Counting down to a time of day: when it is (epoch ms) and how it was typed ("10:00"). */
  targetAt?: number;
  target?: string;
}

export const INITIAL_TIMER: TimerState = { mode: 'countdown', durationMs: 5 * 60_000, startedAt: null, elapsedMs: 0 };

/** Counting down to a time of day always runs; there's nothing to start or pause. */
const isClock = (t: TimerState): t is TimerState & { targetAt: number } => t.mode === 'clock' && typeof t.targetAt === 'number';

export function elapsedOf(t: TimerState, now: number): number {
  return t.elapsedMs + (t.startedAt === null ? 0 : Math.max(0, now - t.startedAt));
}

/** Milliseconds to show: remaining for a countdown (negative once over time), elapsed for a count-up. */
export function timerValue(t: TimerState, now: number): number {
  if (isClock(t)) return t.targetAt - now;
  const elapsed = elapsedOf(t, now);
  return t.mode === 'countup' ? elapsed : t.durationMs - elapsed;
}

/** Counts down (to an end, or to a time of day) rather than up. */
export const countsDown = (t: TimerState): boolean => t.mode !== 'countup';

export const isRunning = (t: TimerState): boolean => isClock(t) || t.startedAt !== null;

export function startTimer(t: TimerState, now: number): TimerState {
  return isRunning(t) ? t : { ...t, startedAt: now };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  return isRunning(t) && !isClock(t) ? { ...t, elapsedMs: elapsedOf(t, now), startedAt: null } : t;
}

export function resetTimer(t: TimerState): TimerState {
  return isClock(t) ? t : { ...t, startedAt: null, elapsedMs: 0 };
}

/** The timer switched to another mode, stopped and back at the start. */
export function timerWithMode(t: TimerState, mode: Exclude<TimerMode, 'clock'>): TimerState {
  return { mode, durationMs: t.durationMs, startedAt: null, elapsedMs: 0 };
}

/**
 * Count down to a time of day: the next time the clock shows it, unless it was
 * under an hour ago (then it shows how long ago, like any countdown past its end).
 */
export function timerToTime(target: { hours: number; minutes: number }, now: number, durationMs = INITIAL_TIMER.durationMs): TimerState {
  const at = new Date(now);
  at.setHours(target.hours, target.minutes, 0, 0);
  if (at.getTime() < now - 60 * 60_000) at.setDate(at.getDate() + 1);
  const label = `${target.hours}:${String(target.minutes).padStart(2, '0')}`;
  return { mode: 'clock', durationMs, startedAt: null, elapsedMs: 0, targetAt: at.getTime(), target: label };
}

/** Read a time of day: "10", "10:30", "9:30 am", "7pm" or "19:15". Null if it isn't one. */
export function parseTimeOfDay(input: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?\s*(m\.?)?$/.exec(input.trim().toLowerCase());
  if (!m || (m[4] && !m[3])) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (minutes > 59) return null;
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (m[3] === 'p' ? 12 : 0);
  } else if (hours > 23) return null;
  return { hours, minutes };
}

/**
 * "m:ss" (or "h:mm:ss" past an hour). Countdowns round up so the display
 * shows 0:01 until the last second has fully gone; overtime gets a minus.
 */
export function formatDuration(ms: number, roundUp = false): string {
  const negative = ms < 0;
  const abs = Math.abs(ms);
  const total = negative ? Math.floor(abs / 1000) : roundUp ? Math.ceil(abs / 1000) : Math.floor(abs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return negative && total > 0 ? `-${body}` : body;
}

export function formatTimer(t: TimerState, now: number): string {
  return formatDuration(timerValue(t, now), countsDown(t));
}

/** Parse "5", "5:00", "1:30:00" or "90s" into milliseconds; null if unreadable. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (/^\d+(\.\d+)?s$/.test(s)) return Math.round(parseFloat(s) * 1000);
  if (/^\d+(\.\d+)?m?$/.test(s)) return Math.round(parseFloat(s) * 60_000);
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, sec] = parts.length === 3 ? nums : [0, ...nums];
  if (m >= 60 && parts.length === 3) return null;
  if (sec >= 60) return null;
  return ((h * 60 + m) * 60 + sec) * 1000;
}

/** Wall clock for the stage, e.g. "9:41 AM" or "21:41", following the system locale. */
export function formatClock(now: number, seconds = false): string {
  return new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}

/**
 * A slide timer typed by the operator, in seconds: "45" (seconds), "1:30",
 * "90s" or "2m". Null when it isn't a time, or isn't between 1 second and 1 hour.
 */
export function parseSeconds(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s*(sec(ond)?s?)$/, 's').replace(/\s*(min(ute)?s?)$/, 'm');
  let seconds: number | null;
  if (/^\d+(\.\d+)?$/.test(s)) seconds = parseFloat(s);
  else {
    const ms = parseDuration(s);
    seconds = ms === null ? null : ms / 1000;
  }
  if (seconds === null || !Number.isFinite(seconds) || seconds < 1 || seconds > 3600) return null;
  return Math.round(seconds * 10) / 10;
}
