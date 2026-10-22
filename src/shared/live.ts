// Which background shows when a slide goes live.
import type { Background } from './types';

/**
 * A slide with its own background shows it, except straight after the
 * operator cleared that same media: "Clear media" sticks until a slide with a
 * different background comes up, or media is picked from the bin.
 * `cleared` is the path of the media that was cleared, if any.
 */
export function backgroundForSlide(
  own: Background | undefined,
  current: Background | null,
  cleared: string | null
): { background: Background | null; cleared: string | null } {
  if (!own) return { background: current, cleared };
  if (cleared !== null && own.path === cleared) return { background: current, cleared };
  return { background: own, cleared: null };
}

/** What "Clear media" remembers: the media just cleared (or what was already remembered). */
export function rememberCleared(current: Background | null, cleared: string | null): string | null {
  return current?.path ?? cleared;
}
