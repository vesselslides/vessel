// Keyboard jumps during a show: a group's letter (C for Chorus) jumps to it,
// and a typed slide number plus Enter jumps to that slide.
import { groupDefinitionFor } from './groups';
import type { Deck } from './types';

/**
 * A group's jump letter: ProPresenter's stored hot key (codes 1–26 are A–Z)
 * when it has one, else the church's group list ("Verse 2" → V), else its
 * first letter.
 */
export function groupKey(name: string, hotKeyCode?: number): string | undefined {
  if (hotKeyCode && hotKeyCode >= 1 && hotKeyCode <= 26) return String.fromCharCode(64 + hotKeyCode);
  const defined = groupDefinitionFor(name);
  if (defined) return defined.key;
  const first = /[a-z]/i.exec(name.trim())?.[0];
  return first?.toUpperCase();
}

/** Indexes (in play order) where a group's run of slides starts. */
export function blockStarts(deck: Deck): number[] {
  const firstCue = new Map(deck.groups.map((g) => [g.id, g.slides[0]?.cueId]));
  const starts: number[] = [];
  deck.slides.forEach((s, i) => {
    const prev = deck.slides[i - 1];
    if (!prev || prev.groupId !== s.groupId || firstCue.get(s.groupId) === s.cueId) starts.push(i);
  });
  return starts;
}

/**
 * The slide to jump to for a group letter: the start of the next block with
 * that letter after `current`, wrapping round, so pressing V again moves
 * Verse 1 → Verse 2. Null when no group has the letter.
 */
export function jumpForKey(deck: Deck, key: string, current: number): number | null {
  const letter = key.toUpperCase();
  const keyOf = new Map(deck.groups.map((g) => [g.id, g.hotkey]));
  const matches = blockStarts(deck).filter((i) => keyOf.get(deck.slides[i].groupId) === letter);
  if (!matches.length) return null;
  return matches.find((i) => i > current) ?? matches[0];
}

/** A typed slide number (1-based) as an index, or null if out of range. */
export function slideForNumber(deck: Deck, typed: string): number | null {
  const n = Number.parseInt(typed, 10);
  return Number.isInteger(n) && n >= 1 && n <= deck.slides.length ? n - 1 : null;
}

/**
 * The next slide to show going `dir` from `from`, skipping turned-off slides;
 * -1 when there is none. `from` may be -1 (before the first) or slides.length.
 */
export function nextEnabled(deck: Deck, from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < deck.slides.length; i += dir) if (deck.slides[i].enabled) return i;
  return -1;
}
