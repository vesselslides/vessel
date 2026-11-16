// Slide transitions (how a slide comes on screen) and word animations (how its
// words come in), chosen per slide in Edit or from Show's right-click menu.
import type { SlideMotion } from './types';

export interface MotionChoice {
  id: string;
  label: string;
}

/** How a slide replaces the one before it. The usual fade is no transition at all. */
export const TRANSITIONS: MotionChoice[] = [
  { id: 'fade', label: 'Fade' },
  { id: 'push', label: 'Push' },
  { id: 'slide', label: 'Slide over' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'blur', label: 'Blur' },
  { id: 'flip', label: 'Flip' },
  { id: 'cube', label: 'Cube' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'iris', label: 'Iris' },
  { id: 'cut', label: 'Cut (no fade)' }
];

/** What comes in on its own: everything at once, or each line, sentence, word or letter after the one before. */
export type WordUnit = 'all' | 'line' | 'sentence' | 'word' | 'letter';

export const WORD_UNITS: Array<{ id: WordUnit; label: string }> = [
  { id: 'all', label: 'Everything at once' },
  { id: 'line', label: 'Line by line' },
  { id: 'sentence', label: 'Sentence by sentence' },
  { id: 'word', label: 'Word by word' },
  { id: 'letter', label: 'Letter by letter' }
];

/** How the words come in once the slide is up, and what comes in on its own unless chosen otherwise. */
export const WORD_MOTIONS: Array<MotionChoice & { by: WordUnit }> = [
  { id: 'fade', label: 'Fade', by: 'all' },
  { id: 'fade-up', label: 'Fade up', by: 'line' },
  { id: 'typewriter', label: 'Typewriter', by: 'letter' },
  { id: 'pop', label: 'Pop', by: 'all' },
  { id: 'bounce', label: 'Bounce', by: 'all' },
  { id: 'blur-in', label: 'Blur in', by: 'all' },
  { id: 'drop', label: 'Drop in', by: 'line' },
  { id: 'rise', label: 'Rise', by: 'line' },
  { id: 'slide-in', label: 'Slide in', by: 'line' },
  { id: 'zoom', label: 'Zoom in', by: 'all' },
  { id: 'zoom-out', label: 'Zoom out', by: 'all' },
  { id: 'flip', label: 'Flip up', by: 'word' },
  { id: 'spin', label: 'Spin', by: 'all' },
  { id: 'glow', label: 'Glow', by: 'all' },
  { id: 'wave', label: 'Wave', by: 'letter' },
  { id: 'tracking', label: 'Spread in', by: 'all' }
];

/** Older choices that were an effect and a unit in one. */
const OLD_WORDS: Record<string, { effect: string; by: WordUnit }> = { lines: { effect: 'fade-up', by: 'line' }, words: { effect: 'fade-up', by: 'word' } };

/** Speeds, in seconds for the whole effect. */
export const SPEEDS: Array<{ id: string; label: string; seconds: number }> = [
  { id: 'slow', label: 'Slow', seconds: 1.6 },
  { id: 'normal', label: 'Normal', seconds: 0.8 },
  { id: 'fast', label: 'Fast', seconds: 0.4 }
];

export const DEFAULT_SECONDS = 0.8;

/** The speed closest to `seconds` (for showing which is chosen). */
export const speedOf = (seconds: number): string =>
  SPEEDS.reduce((best, s) => (Math.abs(s.seconds - seconds) < Math.abs(best.seconds - seconds) ? s : best), SPEEDS[1]).id;

/** A stored motion checked against the known effects, or undefined. */
export function normalizeMotion(raw: { effect?: string; duration?: number; by?: string } | undefined, kind: 'transition' | 'words'): SlideMotion | undefined {
  if (!raw?.effect) return undefined;
  const d = Number(raw.duration);
  const duration = Number.isFinite(d) && d > 0 ? Math.min(10, d) : DEFAULT_SECONDS;
  if (kind === 'transition') return TRANSITIONS.some((m) => m.id === raw.effect) ? { effect: raw.effect, duration } : undefined;
  const old = OLD_WORDS[raw.effect];
  const m = WORD_MOTIONS.find((x) => x.id === (old?.effect ?? raw.effect));
  if (!m) return undefined;
  const by = WORD_UNITS.find((u) => u.id === raw.by)?.id ?? old?.by ?? m.by;
  return { effect: m.id, duration, by };
}

export const wordMotion = (id: string | undefined): (typeof WORD_MOTIONS)[number] | undefined => WORD_MOTIONS.find((m) => m.id === id);
