// Choosing several slides at once, in Show and Edit: Shift-click picks a run
// from the last slide chosen, ⌘/Ctrl-click adds or takes away one, ⌘A/Ctrl+A
// picks every slide.
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface SlideSelection {
  /** Chosen slides (cue ids), in the order they appear. */
  ids: string[];
  has: (id: string) => boolean;
  /** A click on a slide; returns true when the modifier keys made it a selection click (not a plain click). */
  click: (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => boolean;
  /** Choose just this slide. */
  only: (id: string) => void;
  all: () => void;
  clear: () => void;
}

/** `order` is every slide's cue id as listed; chosen slides that no longer exist drop out. */
export function useSlideSelection(order: string[]): SlideSelection {
  const [chosen, setChosen] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const key = order.join('|');

  // Slides deleted, or another song opened: keep only what's still there.
  useEffect(() => {
    setChosen((c) => {
      const kept = c.filter((id) => order.includes(id));
      return kept.length === c.length ? c : kept;
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = useMemo(() => order.filter((id) => chosen.includes(id)), [key, chosen]); // eslint-disable-line react-hooks/exhaustive-deps
  const has = useCallback((id: string) => chosen.includes(id), [chosen]);

  const click = useCallback(
    (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean => {
      if (e.shiftKey) {
        const from = order.indexOf(anchor ?? id);
        const to = order.indexOf(id);
        if (from < 0 || to < 0) {
          setChosen([id]);
          setAnchor(id);
        } else {
          const [a, b] = from < to ? [from, to] : [to, from];
          setChosen(order.slice(a, b + 1));
        }
        return true;
      }
      if (e.metaKey || e.ctrlKey) {
        setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
        setAnchor(id);
        return true;
      }
      return false;
    },
    [key, anchor] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const only = useCallback((id: string) => {
    setChosen((c) => (c.length === 1 && c[0] === id ? c : [id]));
    setAnchor(id);
  }, []);
  const all = useCallback(() => setChosen(order), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => setChosen((c) => (c.length ? [] : c)), []);

  return { ids, has, click, only, all, clear };
}

/** ⌘A / Ctrl+A outside a text field. */
export const isSelectAll = (e: KeyboardEvent): boolean =>
  (e.metaKey || e.ctrlKey) &&
  !e.altKey &&
  !e.shiftKey &&
  e.key.toLowerCase() === 'a' &&
  !(e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]'));
