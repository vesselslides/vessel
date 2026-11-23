// Fonts in this window: Vessel's own (Documents/Vessel/Fonts) loaded with
// @font-face, the stand-ins chosen for missing fonts, and which fonts this
// computer has, to tell which ones a presentation is missing.
import { useSyncExternalStore } from 'react';
import { fontNames, setFontSubstitutes, substituteFor } from '../../shared/fonts';
import type { Deck, FontState } from '../../shared/types';

let state: FontState = { fonts: [], substitutes: {} };
/** Lower-cased family, full and PostScript names of the fonts installed on this computer; null until known (or if the browser won't say). */
let installed: Set<string> | null = null;
let version = 0;
const listeners = new Set<() => void>();
let started = false;

const changed = (): void => {
  version++;
  for (const l of listeners) l();
};

function writeStyle(): void {
  let style = document.getElementById('vessel-fonts') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'vessel-fonts';
    document.head.append(style);
  }
  // A font installed on the computer is used as it is; Vessel's copy only fills in where it's missing.
  const faces = state.fonts.filter((f) => !installed?.has(f.family.toLowerCase()));
  style.textContent = faces
    .map((f) => {
      const family = f.family.replace(/["\\]/g, '');
      return `@font-face { font-family: "${family}"; src: url("${f.url}"); font-weight: ${f.weight ?? '1 1000'}; font-style: ${f.italic ? 'italic' : 'normal'}; font-display: block; }`;
    })
    .join('\n');
}

function apply(next: FontState): void {
  state = next;
  setFontSubstitutes(next.substitutes);
  writeStyle();
  changed();
}

/** Load Vessel's fonts in this window and keep them current. Safe to call more than once. */
export function startVesselFonts(): void {
  if (started || typeof window === 'undefined' || !window.vessel?.fontState) return;
  started = true;
  void window.vessel.fontState().then(apply).catch(() => undefined);
  window.vessel.onFontsChanged?.(apply);
  learnInstalled();
}

/**
 * Which fonts this computer has. Chromium only says while the window is
 * visible, so a window opened behind others asks again when it's shown.
 */
function learnInstalled(): void {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string; fullName: string; postscriptName: string }>> }).queryLocalFonts;
  if (!query || installed) return;
  void query()
    .then((list) => {
      if (!list.length) return;
      installed = new Set(list.flatMap((f) => [f.family, f.fullName, f.postscriptName].map((n) => n.toLowerCase())));
      writeStyle();
      changed();
    })
    .catch(() => {
      const again = (): void => {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', again);
        learnInstalled();
      };
      document.addEventListener('visibilitychange', again);
    });
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-renders when Vessel's fonts or the stand-ins change. */
export const useFontsVersion = (): number => useSyncExternalStore(subscribe, () => version);

export const vesselFontState = (): FontState => state;

/** Families of Vessel's own fonts (for font pickers). */
export const vesselFamilies = (): string[] => [...new Set(state.fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));

/** Whether this window knows which fonts the computer has (it may never, if the browser won't say). */
export const fontsKnown = (): boolean => installed !== null;

/** Whether a font can be drawn here: installed, or in Vessel's fonts. Null while that isn't known. */
export function fontAvailable(name: string): boolean | null {
  const names = fontNames(name).map((n) => n.toLowerCase());
  if (state.fonts.some((f) => names.includes(f.family.toLowerCase()))) return true;
  if (!installed) return null;
  return names.some((n) => installed!.has(n));
}

/** Whether text in this font is drawn with something else here: a stand-in, or the fallback because it's missing. */
export const fontReplaced = (name: string): boolean => !!substituteFor(name) || fontAvailable(name) === false;

export interface MissingFont {
  /** As the slides name it. */
  font: string;
  boxes: number;
  slides: number;
  /** The stand-in chosen on this computer, if any. */
  substitute?: string;
}

/** Fonts a presentation uses that this computer can't draw (with any stand-in already chosen). Empty while unknown. */
export function missingFonts(deck: Deck): MissingFont[] {
  const found = new Map<string, MissingFont>();
  deck.slides.forEach((s) => {
    const seen = new Set<string>();
    for (const b of s.layout.boxes) {
      if (!b.font || !b.text.trim()) continue;
      const key = b.font.trim().toLowerCase();
      if (fontAvailable(b.font) !== false) continue;
      let m = found.get(key);
      if (!m) found.set(key, (m = { font: b.font.trim(), boxes: 0, slides: 0, ...(substituteFor(b.font) ? { substitute: substituteFor(b.font) } : {}) }));
      m.boxes++;
      if (!seen.has(key)) {
        seen.add(key);
        m.slides++;
      }
    }
  });
  return [...found.values()].sort((a, b) => b.boxes - a.boxes);
}
