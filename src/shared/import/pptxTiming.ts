// PowerPoint's click animations: which shapes (or which lines of a shape's
// text) come and go on each click, read from a slide's <p:timing>.
//
// The common effects are kept: appear, fade, fly in, float in, wipe and zoom,
// in and out, with their timing ("with previous", "after previous", delays).
// Anything else that hides or shows something (blinds, checkerboard…) becomes
// a fade, and emphasis effects and motion paths are left still; both are
// counted so the import can say so.
import type { XNode } from '../pro/legacy';

export type BuildEffect = 'appear' | 'fade' | 'fly' | 'float' | 'wipe' | 'zoom';
/** The side something comes in from, or goes out to. */
export type BuildSide = 'left' | 'right' | 'top' | 'bottom';

export interface BuildStep {
  /** The click it happens on: 0 as the slide appears, 1 the first click, and so on. */
  step: number;
  effect: BuildEffect;
  side?: BuildSide;
  /** Seconds after the click. */
  delay: number;
  /** Seconds the effect takes. */
  duration: number;
}

export interface ShapeBuilds {
  in?: BuildStep;
  out?: BuildStep;
  /** By paragraph number (PowerPoint's "by paragraph" text). */
  paragraphs: Map<number, { in?: BuildStep; out?: BuildStep }>;
}

export interface SlideTiming {
  /** By shape id (p:cNvPr id). */
  shapes: Map<string, ShapeBuilds>;
  /** How many clicks the slide takes before the next slide. */
  steps: number;
  /** Effects shown without their motion: emphasis, motion paths, uncommon entrances and exits. */
  still: number;
}

const kid = (n: XNode | undefined, tag: string): XNode | undefined => n?.children.find((c) => c.tag === tag);
const kids = (n: XNode | undefined, tag: string): XNode[] => n?.children.filter((c) => c.tag === tag) ?? [];
const ms = (v: string | undefined): number => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n > 0 ? n : 0;
};

/** Every node under `n` (not `n` itself), depth first. */
function* descendants(n: XNode): Generator<XNode> {
  for (const c of n.children) {
    yield c;
    yield* descendants(c);
  }
}

/** The `p:cTn` of a time node (`p:par`, `p:seq`…). */
const ctnOf = (n: XNode | undefined): XNode | undefined => kid(n, 'p:cTn');

/** A time node's own start delay in ms (its first plain "delay" condition). */
function startDelay(ctn: XNode | undefined): number {
  for (const cond of kids(kid(ctn, 'p:stCondLst'), 'p:cond')) {
    if (cond.attrs.evt || cond.attrs.delay === 'indefinite') continue;
    return ms(cond.attrs.delay);
  }
  return 0;
}

/** Shapes the timing names in `<p:timing>` sometimes sit inside `mc:AlternateContent`. */
function timingOf(slide: XNode): XNode | undefined {
  const direct = kid(slide, 'p:timing');
  if (direct) return direct;
  for (const alt of kids(slide, 'mc:AlternateContent')) {
    const t = kid(kid(alt, 'mc:Choice'), 'p:timing') ?? kid(kid(alt, 'mc:Fallback'), 'p:timing');
    if (t) return t;
  }
  return undefined;
}

const SIDES: Array<[number, BuildSide]> = [
  [4, 'bottom'],
  [8, 'left'],
  [2, 'right'],
  [1, 'top']
];
/** presetSubtype is a set of sides: 1 top, 2 right, 4 bottom, 8 left. */
function sideOf(subtype: string | undefined, fallback: BuildSide): BuildSide {
  const n = Number(subtype);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return SIDES.find(([bit]) => (n & bit) !== 0)?.[1] ?? fallback;
}

// PowerPoint's preset numbers for the entrances and exits Vessel plays.
const PRESETS: Record<number, BuildEffect> = { 1: 'appear', 10: 'fade', 2: 'fly', 42: 'float', 47: 'float', 22: 'wipe', 23: 'zoom', 53: 'zoom', 31: 'zoom' };

/** What an entrance or exit looks like: by its preset, else by what it animates. */
function effectOf(ctn: XNode): { effect: BuildEffect; known: boolean } {
  const preset = PRESETS[Number(ctn.attrs.presetID)];
  if (preset) return { effect: preset, known: true };
  let fade = false;
  let move = false;
  let scale = false;
  let other = false;
  for (const n of descendants(ctn)) {
    if (n.tag === 'p:animEffect') {
      if ((n.attrs.filter ?? '').startsWith('fade')) fade = true;
      else other = true;
    } else if (n.tag === 'p:anim') {
      const attr = (kid(kid(n, 'p:cBhvr'), 'p:attrNameLst')?.children ?? []).map((a) => a.children.map((t) => t.text ?? '').join('')).join(' ');
      if (/ppt_[xy]/.test(attr)) move = true;
      else if (/ppt_[wh]/.test(attr)) scale = true;
    } else if (n.tag === 'p:animScale') scale = true;
    else if (n.tag === 'p:animRot' || n.tag === 'p:animMotion') other = true;
  }
  if (scale) return { effect: 'zoom', known: !other };
  if (move) return { effect: fade ? 'float' : 'fly', known: !other };
  if (fade) return { effect: 'fade', known: true };
  if (other) return { effect: 'fade', known: false };
  return { effect: 'appear', known: true };
}

/** How long the effect runs: its longest behaviour, delays included (seconds). */
function durationOf(ctn: XNode): number {
  let longest = 0;
  for (const n of descendants(ctn)) {
    if (n.tag !== 'p:cTn' || n === ctn) continue;
    const dur = n.attrs.dur === 'indefinite' ? 0 : ms(n.attrs.dur);
    longest = Math.max(longest, startDelay(n) + dur);
  }
  return Math.round(Math.min(longest, 10_000)) / 1000;
}

/** The shape (and paragraphs, if only some) an effect acts on. */
function targetOf(ctn: XNode): { spid: string; paragraphs?: [number, number] } | null {
  for (const n of descendants(ctn)) {
    if (n.tag !== 'p:spTgt') continue;
    const range = kid(kid(n, 'p:txEl'), 'p:pRg');
    if (range) {
      const st = Number(range.attrs.st);
      const end = Number(range.attrs.end);
      if (Number.isInteger(st) && Number.isInteger(end) && end >= st) return { spid: n.attrs.spid ?? '', paragraphs: [st, Math.min(end, st + 500)] };
    }
    return { spid: n.attrs.spid ?? '' };
  }
  return null;
}

/** The click groups of the main sequence (each `p:par` there is one click, or the slide's start). */
function clickGroups(timing: XNode): { groups: XNode[]; other: XNode[] } {
  const root = ctnOf(kid(kid(timing, 'p:tnLst'), 'p:par'));
  const seqs = kids(kid(root, 'p:childTnLst'), 'p:seq');
  const main = seqs.find((s) => ctnOf(s)?.attrs.nodeType === 'mainSeq');
  const other = seqs.filter((s) => s !== main);
  return { groups: kids(kid(ctnOf(main), 'p:childTnLst'), 'p:par'), other };
}

/** Read the slide's click animations. A slide without any has no steps and no shapes. */
export function slideTiming(slide: XNode): SlideTiming {
  const out: SlideTiming = { shapes: new Map(), steps: 0, still: 0 };
  const timing = timingOf(slide);
  if (!timing) return out;
  const { groups, other } = clickGroups(timing);
  // Effects started by clicking a shape (triggers) can't be clicked on a screen: they stay still.
  for (const seq of other) for (const n of descendants(seq)) if (n.tag === 'p:cTn' && n.attrs.presetClass) out.still++;

  const shapeOf = (spid: string): ShapeBuilds => {
    let s = out.shapes.get(spid);
    if (!s) out.shapes.set(spid, (s = { paragraphs: new Map() }));
    return s;
  };
  const record = (holder: { in?: BuildStep; out?: BuildStep }, kind: 'in' | 'out', build: BuildStep): void => {
    if (kind === 'in' && !holder.in && !holder.out) holder.in = build;
    else if (kind === 'out' && !holder.out && (!holder.in || holder.in.step <= build.step)) holder.out = build;
  };

  groups.forEach((group, i) => {
    const gctn = ctnOf(group);
    const conds = kids(kid(gctn, 'p:stCondLst'), 'p:cond');
    // The first group may start by itself as the slide appears (its first effect is "with" or "after previous").
    const auto = i === 0 && conds.some((c) => c.attrs.evt === 'onBegin');
    const step = auto ? 0 : ++out.steps;
    for (const sub of kids(kid(gctn, 'p:childTnLst'), 'p:par')) {
      const sctn = ctnOf(sub);
      const subDelay = startDelay(sctn);
      for (const eff of kids(kid(sctn, 'p:childTnLst'), 'p:par')) {
        const ctn = ctnOf(eff);
        if (!ctn) continue;
        const cls = ctn.attrs.presetClass;
        if (cls === 'emph' || cls === 'path') {
          out.still++;
          continue;
        }
        if (cls !== 'entr' && cls !== 'exit') continue;
        const target = targetOf(ctn);
        if (!target?.spid) continue;
        const { effect, known } = effectOf(ctn);
        if (!known) out.still++;
        const kind = cls === 'entr' ? 'in' : 'out';
        const build: BuildStep = {
          step,
          effect,
          delay: Math.round(subDelay + startDelay(ctn)) / 1000,
          duration: effect === 'appear' ? 0 : durationOf(ctn) || 0.5
        };
        if (effect === 'fly' || effect === 'float' || effect === 'wipe') build.side = sideOf(ctn.attrs.presetSubtype, effect === 'wipe' ? 'bottom' : 'bottom');
        const shape = shapeOf(target.spid);
        if (!target.paragraphs) record(shape, kind, build);
        else
          for (let p = target.paragraphs[0]; p <= target.paragraphs[1]; p++) {
            let para = shape.paragraphs.get(p);
            if (!para) shape.paragraphs.set(p, (para = {}));
            record(para, kind, build);
          }
      }
    }
  });
  return out;
}

/** Seconds before the slide moves on by itself (PowerPoint's "After" timing), if set. */
export function slideAdvance(slide: XNode): number | null {
  let transition = kid(slide, 'p:transition');
  if (!transition)
    for (const alt of kids(slide, 'mc:AlternateContent')) {
      transition = kid(kid(alt, 'mc:Choice'), 'p:transition') ?? kid(kid(alt, 'mc:Fallback'), 'p:transition');
      if (transition) break;
    }
  const at = transition?.attrs.advTm;
  return at !== undefined && Number.isFinite(Number(at)) ? Number(at) / 1000 : null;
}
