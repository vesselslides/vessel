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
  splitSlide
} from '../../shared/pro/edit';
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
  slide: SlideView;
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
}

export async function openSlideMenu(o: SlideMenuOptions): Promise<void> {
  const { deck, slide, apply } = o;
  // Audio can't be a background or a picture.
  const media = o.media.filter((m) => m.kind !== 'audio');
  const g = slide.groupId;
  const images = media.filter((m) => m.kind === 'image');
  const entries: MenuEntry[] = [];
  if (o.onGoLive) entries.push({ id: 'live', label: 'Go live' });
  if (o.onEditText) entries.push({ id: 'edit', label: 'Edit text…' });
  if (entries.length) entries.push({ type: 'separator' });
  if (o.split) entries.push({ id: 'split', label: 'Split at cursor', accelerator: 'Alt+Enter', enabled: o.split.cursor > 0 && o.split.cursor < o.split.text.length });
  entries.push(
    { id: 'before', label: 'Insert slide before' },
    { id: 'after', label: 'Insert slide after' },
    { id: 'duplicate', label: 'Duplicate' },
    { type: 'separator' },
    {
      label: 'Move to group',
      enabled: deck.groups.length > 1,
      submenu: deck.groups.filter((x) => x.id !== g).map((x) => ({ id: `move:${x.id}`, label: x.name || 'Untitled group' }))
    },
    {
      label: 'Background',
      submenu: [
        { id: 'bg:none', label: 'No background', checked: !slide.background },
        ...(media.length ? [{ type: 'separator' } as MenuEntry] : []),
        ...media.map((m, i) => ({ id: `bg:${i}`, label: `${m.kind === 'video' ? '▶ ' : ''}${m.name}`, checked: slide.background?.path === m.path }))
      ]
    },
    {
      label: 'Add picture',
      enabled: images.length > 0,
      submenu: images.map((m, i) => ({ id: `pic:${i}`, label: m.name }))
    },
    { type: 'separator' },
    {
      label: 'Timer',
      submenu: [
        { id: 'timer:off', label: 'None (move on by hand)', checked: !slide.advance },
        { type: 'separator' },
        ...[3, 5, 8, 10, 15, 20, 30, 60].map((s) => ({ id: `timer:${s}`, label: `Next slide after ${s < 60 ? `${s} seconds` : '1 minute'}`, checked: slide.advance?.seconds === s })),
        ...(o.onCustomTimer
          ? [{ id: 'timer:custom', label: slide.advance && ![3, 5, 8, 10, 15, 20, 30, 60].includes(slide.advance.seconds) ? `Custom time (${slide.advance.seconds}s)…` : 'Custom time…', checked: !!slide.advance && ![3, 5, 8, 10, 15, 20, 30, 60].includes(slide.advance.seconds) }]
          : []),
        { type: 'separator' },
        { id: 'timer:first', label: 'Then go back to the first slide', enabled: !!slide.advance, checked: slide.advance?.to === 'first' }
      ]
    },
    { id: 'toggle', label: slide.enabled ? 'Turn slide off (Next skips it)' : 'Turn slide back on' },
    { id: 'delete', label: 'Delete slide' }
  );

  const choice = await popup(entries);
  if (!choice) return;
  if (choice === 'live') return o.onGoLive?.();
  if (choice === 'edit') return o.onEditText?.();
  if (choice === 'split' && o.split) {
    const { text, cursor } = o.split;
    return apply((p) => splitSlide(p, g, slide.cueId, text.slice(0, cursor), text.slice(cursor)));
  }
  if (choice === 'before') return apply((p) => insertSlideBefore(p, g, slide.cueId).presentation);
  if (choice === 'after') return apply((p) => addSlide(p, g, '', slide.cueId).presentation);
  if (choice === 'duplicate') return apply((p) => duplicateSlide(p, g, slide.cueId));
  if (choice === 'delete') return apply((p) => deleteSlide(p, g, slide.cueId));
  if (choice === 'toggle') return apply((p) => setSlideEnabled(p, slide.cueId, !slide.enabled));
  if (choice === 'timer:off') return apply((p) => setSlideAdvance(p, slide.cueId, null));
  if (choice === 'timer:custom') return o.onCustomTimer?.();
  if (choice === 'timer:first' && slide.advance) {
    const to = slide.advance.to === 'first' ? 'next' : 'first';
    return apply((p) => setSlideAdvance(p, slide.cueId, { seconds: slide.advance!.seconds, to }));
  }
  if (choice.startsWith('timer:')) {
    const seconds = Number(choice.slice(6));
    return apply((p) => setSlideAdvance(p, slide.cueId, { seconds, to: slide.advance?.to ?? 'next' }));
  }
  if (choice.startsWith('move:')) {
    const to = choice.slice(5);
    const target = deck.groups.find((x) => x.id === to);
    return apply((p) => moveSlide(p, g, slide.cueId, to, target?.slides.length ?? 0));
  }
  if (choice === 'bg:none') return apply((p) => setSlideBackground(p, slide.cueId, null));
  if (choice.startsWith('bg:')) {
    const m = media[Number(choice.slice(3))];
    const bg = m && backgroundForPath(m.path);
    if (bg) apply((p) => setSlideBackground(p, slide.cueId, bg));
    return;
  }
  if (choice.startsWith('pic:')) {
    const m = images[Number(choice.slice(4))];
    if (m) apply((p) => addSlideImage(p, [slide.cueId], m.path, 'top-right'));
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
export function dropSlideOn(deck: Deck, drag: { groupId: string; cueId: string }, target: SlideView, apply: Apply): void {
  if (drag.cueId === target.cueId) return;
  const group = deck.groups.find((x) => x.id === target.groupId);
  const index = group?.slides.findIndex((s) => s.cueId === target.cueId) ?? -1;
  if (index < 0) return;
  apply((p) => moveSlide(p, drag.groupId, drag.cueId, target.groupId, index));
}

/** Drag type for slides, shared by Show and Edit; payload is JSON {groupId, cueId}. */
export const SLIDE_DRAG = 'application/x-vessel-slide';
