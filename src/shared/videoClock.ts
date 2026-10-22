// Where the live video is: kept as data like the stage timer, so the output
// window and the preview each work out the position from the clock and stay
// together without streaming updates.

export interface VideoClock {
  /** The video this clock belongs to. */
  path: string;
  playing: boolean;
  /** Seconds into the video at `at`. */
  position: number;
  /** When `position` was true (epoch ms). */
  at: number;
}

export const startClock = (path: string, now: number): VideoClock => ({ path, playing: true, position: 0, at: now });

/** Seconds since the start, ignoring the video's length. */
export function clockPosition(c: VideoClock, now: number): number {
  return Math.max(0, c.position + (c.playing ? (now - c.at) / 1000 : 0));
}

/** Where the video should be: wrapped round for a loop, held at the end otherwise. Unknown lengths are left as they are. */
export function positionIn(c: VideoClock, now: number, duration: number, loop: boolean): number {
  const p = clockPosition(c, now);
  if (!Number.isFinite(duration) || duration <= 0) return p;
  return loop ? p % duration : Math.min(p, duration);
}

/** A video that plays once and has reached its end. */
export const hasEnded = (c: VideoClock, now: number, duration: number, loop: boolean): boolean =>
  !loop && Number.isFinite(duration) && duration > 0 && clockPosition(c, now) >= duration - 0.05;

export function pauseClock(c: VideoClock, now: number, duration = NaN, loop = false): VideoClock {
  return c.playing ? { ...c, playing: false, position: positionIn(c, now, duration, loop), at: now } : c;
}

/** Play from where it is; a video that has finished starts again. */
export function playClock(c: VideoClock, now: number, duration = NaN, loop = false): VideoClock {
  if (c.playing && !hasEnded(c, now, duration, loop)) return c;
  const position = hasEnded(c, now, duration, loop) ? 0 : positionIn(c, now, duration, loop);
  return { ...c, playing: true, position, at: now };
}

export function seekClock(c: VideoClock, seconds: number, now: number, duration = NaN): VideoClock {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return { ...c, position: Math.min(max, Math.max(0, seconds)), at: now };
}
