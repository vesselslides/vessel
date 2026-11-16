// Right-click menus for slides and groups, shared by Show and Edit.
import type { Presentation } from '../../shared/gen/presentation_pb';
import type { MenuEntry } from '../../shared/menu';
import { backgroundForPath } from '../../shared/pro/background';
import {
  addSlide,
  addSlideImage,
  deleteGroup,
  deleteSlide,
  duplicateSlide,
  insertSlideBefore,
  moveSlide,
  setGroupColor,
  setSlideBackground,
  setSlideAdvance,
  setSlideEnabled,
  setSlideMotion,
  setTextStyle,
  splitSlide,
  type TextStyleChange
} from '../../shared/pro/edit';
import { DEFAULT_SECONDS, SPEEDS, speedOf, TRANSITIONS, WORD_MOTIONS, WORD_UNITS, wordMotion } from '../../shared/motion';
import type { Deck, MediaItem, SlideView } from '../../shared/types';

type Apply = (change: (p: Presentation) => Presentation) => void;

/**
 * Show a native menu. If Vessel's background process predates right-click
 * menus (it was updated while running), say so instead of doing nothing.
 */
async function popup(entries: MenuEntry[]): Promise<string | null> {
  if (typeof window.vessel.showMenu !== 'function') {
    alert('Restart Vessel to use right-click menus. (It was updated while it was running.)');
    return null;
  }
  return window.vessel.showMenu(entries);
}

export const GROUP_COLOURS: Array<[string, string]> = [
  ['Blue', '#2170d9'],
  ['Red', '#d12e52'],
  ['Purple', '#8c45c7'],
  ['Orange', '#f28c1f'],
  ['Green', '#2ea66b'],
  ['Yellow', '#d9b31a'],
  ['Teal', '#1f9e9e'],
  ['Grey', '#737380']
];

export interface SlideMenuOptions {
  deck: Deck;
  /** The slide right-clicked. */
  slide: SlideView;
  /** Every slide chosen, when the right-clicked one is among several (else just it). */
  targets?: SlideView[];
  media: MediaItem[];
  apply: Apply;
  /** Show mode: put the slide on screen. */
  onGoLive?: () => void;
  /** Show mode: open it in the editor. */
  onEditText?: () => void;
  /** Ask for a timer length of the operator's own for this slide. */
  onCustomTimer?: () => void;
  /** Edit mode: the text box's current text and cursor, to split there. */
  split?: { text: string; cursor: number };
  /** Choose every slide of the song. */
  onSelectAll?: () => void;
  /** Open Adjust look for the background, or a picture, of these slides. */
  onAdjustLook?: (what: { kind: 'background' | 'picture'; path: string; slides: SlideView[] }) => void;
}

const TIMES = [3, 5, 8, 10, 15, 20, 30, 60];

const TEXT_COLOURS: Array<[string, string]> = [
  ['White', '#ffffff'],
  ['Black', '#000000'],
  ['Cream', '#fff4d6'],
  ['Gold', '#f2c14e'],
  ['Yellow', '#ffe14d'],
  ['Sky blue', '#7cc8ff'],
  ['Red', '#e5484d'],
  ['Grey', '#b8bcc4']
];

/** A Transition or Words submenu: the effects, then the speed, ticked where every chosen slide agrees. */
function motionMenu(kind: 'transition' | 'words', targets: SlideView[]): MenuEntry[] {
  const now = targets.map((t) => (kind === 'transition' ? t.layout.transition : t.layout.words));
  const all = (pred: (m: (typeof now)[number]) => boolean): boolean => now.every(pred);
  const list = kind === 'transition' ? TRANSITIONS : WORD_MOTIONS;
  const set = now.filter(Boolean);
  return [
    {
      id: `${kind}:none`,
      label: kind === 'transition' ? 'Usual fade' : 'None (all at once)',
      checked: all((m) => !m)
    },
    { type: 'separator' },
    ...list.map((m) => ({
      id: `${kind}:${m.id}`,
      label: m.label,
      checked: all((x) => x?.effect === m.id)
    })),
    ...(kind === 'words'
      ? [
          { type: 'separator' as const },
          ...WORD_UNITS.map((u) => ({
            id: `words-by:${u.id}`,
            label: u.label,
            enabled: set.length > 0,
            checked: set.length > 0 && set.every((m) => (m!.by ?? wordMotion(m!.effect)?.by) === u.id)
          }))
        ]
      : []),
    { type: 'separator' },
    ...SPEEDS.map((sp) => ({
      id: `${kind}-speed:${sp.id}`,
      label: sp.label,
      enabled: set.length > 0 || kind === 'transition',
      checked: set.length > 0 && set.every((m) => speedOf(m!.duration) === sp.id)
    }))
  ];
}

export async function openSlideMenu(o: SlideMenuOptions): Promise<void> {
  const { deck, slide, apply } = o;
  const targets = o.targets?.length ? o.targets : [slide];
  const ids = targets.map((t) => t.cueId);
  const many = targets.length > 1;
  const n = targets.length;
  const each = (fn: (p: Presentation, t: SlideView) => Presentation): void => apply((p) => targets.reduce(fn, p));
  // Audio can't be a background or a picture.
  const media = o.media.filter((m) => m.kind !== 'audio');
  const g = slide.groupId;
  const images = media.filter((m) => m.kind === 'image');
  const backgrounds = targets.map((t) => t.background).filter((b): b is NonNullable<typeof b> => !!b);
  const pictures = [...new Set(targets.flatMap((t) => t.layout.graphics.flatMap((x) => (x.kind === 'image' ? [x.path] : []))))];
  const hasText = targets.some((t) => t.layout.boxes.length > 0);
  const slideshow = !!deck.slideshow;
  const advance = slide.advance;

  const entries: MenuEntry[] = [];
  if (many) entries.push({ id: 'noop', label: `${n} slides chosen`, enabled: false });
  if (o.onGoLive && !many) entries.push({ id: 'live', label: 'Go live' });
  if (o.onEditText && !many) entries.push({ id: 'edit', label: 'Edit text…' });
  if (o.onSelectAll)
    entries.push({
      id: 'select-all',
      label: 'Choose all slides',
      accelerator: 'CmdOrCtrl+A'
    });
  if (entries.length) entries.push({ type: 'separator' });
  if (o.split && !many)
    entries.push({
      id: 'split',
      label: 'Split at cursor',
      accelerator: 'Alt+Enter',
      enabled: o.split.cursor > 0 && o.split.cursor < o.split.text.length
    });
  if (!slideshow && !many)
    entries.push(
      { id: 'before', label: 'Insert slide before' },
      { id: 'after', label: 'Insert slide after' },
      { id: 'duplicate', label: 'Duplicate' },
      { type: 'separator' }
    );
  if (!slideshow) {
    entries.push(
      { label: 'Transition', submenu: motionMenu('transition', targets) },
      {
        label: 'Words come in',
        enabled: hasText,
        submenu: motionMenu('words', targets)
      },
      {
        label: 'Text',
        enabled: hasText,
        submenu: [
          { id: 'text:bigger', label: 'Bigger' },
          { id: 'text:smaller', label: 'Smaller' },
          { type: 'separator' },
          {
            id: 'text:bold',
            label: 'Bold',
            checked: targets.every((t) => t.layout.boxes[0]?.bold)
          },
          {
            id: 'text:italic',
            label: 'Italic',
            checked: targets.every((t) => t.layout.boxes[0]?.italic)
          },
          { type: 'separator' },
          ...(['left', 'center', 'right'] as const).map((a) => ({
            id: `text:align:${a}`,
            label: a === 'left' ? 'Align left' : a === 'center' ? 'Centre' : 'Align right',
            checked: targets.every((t) => t.layout.boxes[0]?.align === a)
          })),
          { type: 'separator' },
          ...(['top', 'middle', 'bottom'] as const).map((v) => ({
            id: `text:valign:${v}`,
            label: v === 'top' ? 'Top of the slide' : v === 'middle' ? 'Middle' : 'Bottom of the slide',
            checked: targets.every((t) => t.layout.boxes[0]?.valign === v)
          })),
          { type: 'separator' },
          {
            label: 'Colour',
            submenu: TEXT_COLOURS.map(([name, hex]) => ({
              id: `text:colour:${hex}`,
              label: name
            }))
          }
        ]
      },
      { type: 'separator' }
    );
  }
  if (!slideshow && !many)
    entries.push({
      label: 'Move to group',
      enabled: deck.groups.length > 1,
      submenu: deck.groups
        .filter((x) => x.id !== g)
        .map((x) => ({
          id: `move:${x.id}`,
          label: x.name || 'Untitled group'
        }))
    });
  entries.push(
    {
      label: 'Background',
      submenu: [
        {
          id: 'bg:none',
          label: 'No background',
          checked: targets.every((t) => !t.background)
        },
        ...(media.length ? [{ type: 'separator' } as MenuEntry] : []),
        ...media.map((m, i) => ({
          id: `bg:${i}`,
          label: `${m.kind === 'video' ? '▶ ' : ''}${m.name}`,
          checked: targets.every((t) => t.background?.path === m.path)
        })),
        { type: 'separator' },
        ...(
          [
            ['fill', 'Fill the screen (crop the edges)'],
            ['fit', 'Fit (show it all, bars if needed)'],
            ['stretch', 'Stretch to the screen']
          ] as const
        ).map(([scale, label]) => ({
          id: `fit:${scale}`,
          label,
          enabled: backgrounds.length > 0,
          checked: backgrounds.length > 0 && backgrounds.every((b) => b.scale === scale)
        }))
      ]
    },
    {
      label: 'Add picture',
      enabled: images.length > 0 && !slideshow,
      submenu: images.map((m, i) => ({ id: `pic:${i}`, label: m.name }))
    }
  );
  if (o.onAdjustLook) {
    entries.push({
      id: 'look:bg',
      label: 'Adjust look of background…',
      enabled: backgrounds.length > 0
    });
    if (pictures.length <= 1)
      entries.push({
        id: 'look:pic:0',
        label: 'Adjust look of picture…',
        enabled: pictures.length === 1
      });
    else
      entries.push({
        label: 'Adjust look of picture',
        submenu: pictures.map((p, i) => ({
          id: `look:pic:${i}`,
          label: `${p.split(/[\\/]/).pop()}…`
        }))
      });
  }
  entries.push(
    { type: 'separator' },
    {
      label: 'Timer',
      submenu: [
        {
          id: 'timer:off',
          label: 'None (move on by hand)',
          checked: targets.every((t) => !t.advance)
        },
        { type: 'separator' },
        ...TIMES.map((s) => ({
          id: `timer:${s}`,
          label: `Next slide after ${s < 60 ? `${s} seconds` : '1 minute'}`,
          checked: targets.every((t) => t.advance?.seconds === s)
        })),
        ...(o.onCustomTimer && !many
          ? [
              {
                id: 'timer:custom',
                label: advance && !TIMES.includes(advance.seconds) ? `Custom time (${advance.seconds}s)…` : 'Custom time…',
                checked: !!advance && !TIMES.includes(advance.seconds)
              }
            ]
          : []),
        { type: 'separator' },
        {
          id: 'timer:first',
          label: 'Then go back to the first slide',
          enabled: !many && !!advance,
          checked: !many && advance?.to === 'first'
        }
      ]
    },
    many
      ? {
          id: 'toggle',
          label: targets.every((t) => !t.enabled) ? `Turn ${n} slides back on` : `Turn ${n} slides off (Next skips them)`
        }
      : {
          id: 'toggle',
          label: slide.enabled ? 'Turn slide off (Next skips it)' : 'Turn slide back on'
        },
    ...(slideshow ? [] : [{ id: 'delete', label: many ? `Delete ${n} slides` : 'Delete slide' }])
  );

  const choice = await popup(entries);
  if (!choice) return;
  if (choice === 'live') return o.onGoLive?.();
  if (choice === 'edit') return o.onEditText?.();
  if (choice === 'select-all') return o.onSelectAll?.();
  if (choice === 'split' && o.split) {
    const { text, cursor } = o.split;
    return apply((p) => splitSlide(p, g, slide.cueId, text.slice(0, cursor), text.slice(cursor)));
  }
  if (choice === 'before') return apply((p) => insertSlideBefore(p, g, slide.cueId).presentation);
  if (choice === 'after') return apply((p) => addSlide(p, g, '', slide.cueId).presentation);
  if (choice === 'duplicate') return apply((p) => duplicateSlide(p, g, slide.cueId));
  if (choice === 'delete') {
    if (many && !confirm(`Delete these ${n} slides?`)) return;
    return each((p, t) => deleteSlide(p, t.groupId, t.cueId));
  }
  if (choice === 'toggle') {
    const on = many ? targets.every((t) => !t.enabled) : !slide.enabled;
    return each((p, t) => setSlideEnabled(p, t.cueId, on));
  }
  if (choice === 'timer:off') return each((p, t) => setSlideAdvance(p, t.cueId, null));
  if (choice === 'timer:custom') return o.onCustomTimer?.();
  if (choice === 'timer:first' && advance) {
    const to = advance.to === 'first' ? 'next' : 'first';
    return apply((p) => setSlideAdvance(p, slide.cueId, { seconds: advance.seconds, to }));
  }
  if (choice.startsWith('timer:')) {
    const seconds = Number(choice.slice(6));
    return each((p, t) => setSlideAdvance(p, t.cueId, { seconds, to: t.advance?.to ?? 'next' }));
  }
  if (choice.startsWith('move:')) {
    const to = choice.slice(5);
    const target = deck.groups.find((x) => x.id === to);
    return apply((p) => moveSlide(p, g, slide.cueId, to, target?.slides.length ?? 0));
  }
  if (choice.startsWith('fit:')) {
    const scale = choice.slice(4) as 'fill' | 'fit' | 'stretch';
    return each((p, t) => (t.background ? setSlideBackground(p, t.cueId, { ...t.background, scale }) : p));
  }
  if (choice === 'bg:none') return each((p, t) => setSlideBackground(p, t.cueId, null));
  if (choice.startsWith('bg:')) {
    const m = media[Number(choice.slice(3))];
    const found = m && backgroundForPath(m.path);
    // The media bin's own fit for the file, if it has one.
    const bg = found && m.scale ? { ...found, scale: m.scale } : found;
    if (bg) each((p, t) => setSlideBackground(p, t.cueId, bg));
    return;
  }
  if (choice.startsWith('pic:')) {
    const m = images[Number(choice.slice(4))];
    if (m) apply((p) => addSlideImage(p, ids, m.path, 'top-right'));
    return;
  }
  if (choice === 'look:bg')
    return o.onAdjustLook?.({
      kind: 'background',
      path: backgrounds[0].path,
      slides: targets.filter((t) => t.background?.path === backgrounds[0].path)
    });
  if (choice.startsWith('look:pic:')) {
    const path = pictures[Number(choice.slice(9))];
    if (path)
      o.onAdjustLook?.({
        kind: 'picture',
        path,
        slides: targets.filter((t) => t.layout.graphics.some((x) => x.kind === 'image' && x.path === path))
      });
    return;
  }
  if (choice.startsWith('words-by:')) {
    const by = WORD_UNITS.find((u) => u.id === choice.slice(9))?.id;
    return each((p, t) => (t.layout.words && by ? setSlideMotion(p, [t.cueId], 'words', { ...t.layout.words, by }) : p));
  }
  for (const kind of ['transition', 'words'] as const) {
    if (choice === `${kind}:none`) return apply((p) => setSlideMotion(p, ids, kind, null));
    if (choice.startsWith(`${kind}:`)) {
      const effect = choice.slice(kind.length + 1);
      return each((p, t) =>
        setSlideMotion(p, [t.cueId], kind, {
          effect,
          duration: (kind === 'transition' ? t.layout.transition : t.layout.words)?.duration ?? DEFAULT_SECONDS,
          ...(kind === 'words' && t.layout.words?.by ? { by: t.layout.words.by } : {})
        })
      );
    }
    if (choice.startsWith(`${kind}-speed:`)) {
      const seconds = SPEEDS.find((sp) => sp.id === choice.slice(kind.length + 7))?.seconds ?? DEFAULT_SECONDS;
      return each((p, t) => {
        const now = kind === 'transition' ? t.layout.transition : t.layout.words;
        if (!now && kind === 'words') return p;
        return setSlideMotion(p, [t.cueId], kind, { ...now, effect: now?.effect ?? 'fade', duration: seconds });
      });
    }
  }
  if (choice.startsWith('text:')) {
    const c = choice.slice(5);
    const first = targets.find((t) => t.layout.boxes.length)?.layout.boxes[0];
    const change: TextStyleChange =
      c === 'bigger'
        ? { scale: 1.1 }
        : c === 'smaller'
          ? { scale: 1 / 1.1 }
          : c === 'bold'
            ? { bold: !targets.every((t) => t.layout.boxes[0]?.bold) }
            : c === 'italic'
              ? { italic: !targets.every((t) => t.layout.boxes[0]?.italic) }
              : c.startsWith('valign:')
                ? { valign: c.slice(7) as 'top' | 'middle' | 'bottom' }
                : c.startsWith('align:')
                ? { align: c.slice(6) as 'left' | 'center' | 'right' }
                : c.startsWith('colour:')
                  ? { color: c.slice(7) }
                  : {};
    if (first) apply((p) => setTextStyle(p, change, ids));
  }
}

export async function openGroupMenu(deck: Deck, groupId: string, apply: Apply): Promise<void> {
  const group = deck.groups.find((x) => x.id === groupId);
  if (!group) return;
  const choice = await popup([
    { id: 'add', label: 'Add slide' },
    { label: 'Colour', submenu: GROUP_COLOURS.map(([name, hex]) => ({ id: `colour:${hex}`, label: name, checked: group.colorHex.toLowerCase() === hex })) },
    { type: 'separator' },
    { id: 'delete', label: `Delete “${group.name || 'group'}” and its slides` }
  ]);
  if (choice === 'add') apply((p) => addSlide(p, groupId).presentation);
  else if (choice?.startsWith('colour:')) apply((p) => setGroupColor(p, groupId, choice.slice(7)));
  else if (choice === 'delete' && confirm(`Delete “${group.name || 'this group'}” and its ${group.slides.length} slide(s)?`)) apply((p) => deleteGroup(p, groupId));
}

/** Where a dragged slide lands: before `target` in its group. */
export type DropSide = 'before' | 'after';

/** Which half of a slide the pointer is over: dropped on the left half, a slide goes before it; on the right half, after it. */
export function dropSide(e: { clientX: number; currentTarget: EventTarget }): DropSide {
  const r = (e.currentTarget as Element).getBoundingClientRect();
  return e.clientX < r.left + r.width / 2 ? 'before' : 'after';
}

export function dropSlideOn(deck: Deck, drag: { groupId: string; cueId: string }, target: SlideView, apply: Apply, side: DropSide = 'before'): void {
  if (drag.cueId === target.cueId) return;
  const group = deck.groups.find((x) => x.id === target.groupId);
  const index = group?.slides.findIndex((s) => s.cueId === target.cueId) ?? -1;
  if (index < 0) return;
  apply((p) => moveSlide(p, drag.groupId, drag.cueId, target.groupId, side === 'after' ? index + 1 : index));
}

/** Drag type for slides, shared by Show and Edit; payload is JSON {groupId, cueId}. */
export const SLIDE_DRAG = 'application/x-vessel-slide';
