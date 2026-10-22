// What the stage display shows: which parts, how big, where. Kept in settings
// and sent to the stage window with the rest of the stage state.

export interface StageLayout {
  clock: boolean;
  timer: boolean;
  /** The current slide's group ("Chorus") along the top. */
  groupName: boolean;
  current: boolean;
  next: boolean;
  /** Share of the height the next slide gets when both show (0.2–0.6). */
  nextShare: number;
  /** How large lyrics may grow: 1 normal, 1.4 large, 1.9 very large (they still shrink to fit). */
  textSize: number;
  align: 'center' | 'left';
}

export interface StagePreset {
  id: string;
  name: string;
  description: string;
  layout: StageLayout;
}

const STANDARD: StageLayout = { clock: true, timer: true, groupName: true, current: true, next: true, nextShare: 0.3, textSize: 1, align: 'center' };

export const STAGE_PRESETS: StagePreset[] = [
  { id: 'standard', name: 'Standard', description: 'Clock, timer, the current slide and the next one', layout: STANDARD },
  { id: 'lyrics', name: 'Lyrics only', description: 'The current slide as big as it fits, nothing else', layout: { ...STANDARD, clock: false, timer: false, groupName: false, next: false, textSize: 1.9 } },
  { id: 'next', name: 'Lyrics and next', description: 'A bigger next slide, so the band can see what’s coming', layout: { ...STANDARD, nextShare: 0.45, textSize: 1.4 } },
  { id: 'clock', name: 'Clock and timer', description: 'A big clock and countdown, for speakers', layout: { ...STANDARD, groupName: false, current: false, next: false } }
];

export const DEFAULT_STAGE_LAYOUT = STANDARD;

/** The preset a layout matches, if any. */
export function presetOf(layout: StageLayout): StagePreset | undefined {
  return STAGE_PRESETS.find((p) => (Object.keys(p.layout) as Array<keyof StageLayout>).every((k) => p.layout[k] === layout[k]));
}

/** A stored layout with anything missing or out of range put right. */
export function normalizeStageLayout(raw: Partial<StageLayout> | undefined): StageLayout {
  const l = { ...STANDARD, ...(raw ?? {}) };
  return {
    clock: !!l.clock,
    timer: !!l.timer,
    groupName: !!l.groupName,
    current: !!l.current,
    next: !!l.next,
    nextShare: Math.min(0.6, Math.max(0.2, Number(l.nextShare) || STANDARD.nextShare)),
    textSize: Math.min(2, Math.max(0.8, Number(l.textSize) || 1)),
    align: l.align === 'left' ? 'left' : 'center'
  };
}
