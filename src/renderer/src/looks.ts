// The media bin's looks by file path (Adjust look), shared by everything that
// draws media in this window: backgrounds and pictures placed on slides.
import { useSyncExternalStore } from 'react';
import type { MediaLook } from '../../shared/types';

let looks: Record<string, MediaLook> = {};
const listeners = new Set<() => void>();

export function showMediaLooks(next: Record<string, MediaLook> | undefined): void {
  const value = next ?? {};
  if (value === looks) return;
  looks = value;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The window's looks, by path; re-renders when they change. */
export const useMediaLooks = (): Record<string, MediaLook> => useSyncExternalStore(subscribe, () => looks);
