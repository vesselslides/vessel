// Editing operations on a ProPresenter presentation. Each returns a modified
// copy and leaves the input untouched, so callers can keep it for undo.
import { clone, create } from '@bufbuild/protobuf';
import { Cue_CompletionActionType, Cue_CompletionTargetType, CueSchema, type Cue } from '../gen/presentation_pb';
import { Presentation_ArrangementSchema, PresentationSchema, type Presentation, type Presentation_CueGroup } from '../gen/presentation_pb';
import { Slide_ElementSchema, type Slide_Element } from '../gen/presentation_pb';
import { newCueGroup, newSlideCue, newUuid, parseLyrics, presentationToDeck, slideCue, slideOfCue, slideTextOfCue, SLIDE_HEIGHT, SLIDE_WIDTH, textElement, textElements, uuidOf, hexToColor } from './presentation';
import type { Background, SlideAdvance } from '../types';
import { backgroundAction, isBackgroundAction } from './background';
import { plainTextToRtf, replaceRtfText, rtfToPlainText } from './rtf';
import { imageElement, placementBox, type ImagePlacement } from './graphics';
import { THEME_SCALE_BEHAVIOR, themeAttributes, themeFill, themeRtfStyle, themeShadow, themeVerticalAlignment, type Theme } from '../theme';

type Draft = Presentation;

function edit(p: Presentation, fn: (draft: Draft) => void): Presentation {
  const draft = clone(PresentationSchema, p);
  fn(draft);
  return draft;
}

function findGroup(p: Draft, groupId: string): Presentation_CueGroup {
  const g = p.cueGroups.find((x) => uuidOf(x.group?.uuid) === groupId);
  if (!g) throw new Error(`No group ${groupId}`);
  return g;
}

function findCue(p: Draft, cueId: string): Cue {
  const c = p.cues.find((x) => uuidOf(x.uuid) === cueId);
  if (!c) throw new Error(`No slide ${cueId}`);
  return c;
}

/** Drop cues that no group references any more. */
function pruneCues(p: Draft): void {
  const used = new Set(p.cueGroups.flatMap((g) => g.cueIdentifiers.map(uuidOf)));
  p.cues = p.cues.filter((c) => used.has(uuidOf(c.uuid)));
}

/** The text box of a nearby slide, used as the template for new slides. */
function templateBox(p: Draft, groupId?: string): { element: Slide_Element; size?: { width: number; height: number } } | undefined {
  const ids = groupId ? findGroup(p, groupId).cueIdentifiers.map(uuidOf) : p.cues.map((c) => uuidOf(c.uuid));
  for (const id of [...ids].reverse()) {
    const cue = p.cues.find((c) => uuidOf(c.uuid) === id);
    const slide = cue && slideOfCue(cue);
    const el = textElements(slide)[0];
    if (el) return { element: el, size: slide?.size ? { width: slide.size.width, height: slide.size.height } : undefined };
  }
  return undefined;
}

const styleSource = (p: Draft, groupId?: string): Uint8Array | undefined => templateBox(p, groupId)?.element.element!.text!.rtfData;

/** A new slide that copies a nearby slide's whole text box (position, style, shadow), with new text. */
function slideLike(p: Draft, text: string, groupId?: string): Cue {
  const template = templateBox(p, groupId) ?? templateBox(p);
  if (!template) return newSlideCue(text);
  const element = clone(Slide_ElementSchema, template.element);
  element.element!.uuid = newUuid();
  element.element!.text!.rtfData = replaceRtfText(template.element.element!.text!.rtfData, text);
  return slideCue([element], template.size);
}

/** Set or clear the background a slide triggers. Other media actions are kept. */
export function setSlideBackground(p: Presentation, cueId: string, bg: Background | null): Presentation {
  return edit(p, (d) => {
    const cue = findCue(d, cueId);
    cue.actions = cue.actions.filter((a) => !isBackgroundAction(a));
    // ProPresenter lists the media action before the slide action.
    if (bg) cue.actions.unshift(backgroundAction(bg));
  });
}

/**
 * Restyle slides with a theme. Every text box gets the theme's font, size,
 * colour, alignment, capitals, shadow and outline (mixed formatting inside a
 * box becomes uniform). Slides with a single text box also take the theme's
 * box position; slides with several keep their layout. `cueIds` limits it.
 */
export function applyTheme(p: Presentation, theme: Theme, cueIds?: string[]): Presentation {
  return edit(p, (d) => {
    const only = cueIds ? new Set(cueIds) : null;
    for (const cue of d.cues) {
      if (only && !only.has(uuidOf(cue.uuid))) continue;
      const slide = slideOfCue(cue);
      if (!slide) continue;
      const width = slide.size?.width || SLIDE_WIDTH;
      const height = slide.size?.height || SLIDE_HEIGHT;
      const boxes = textElements(slide);
      for (const el of boxes) {
        const g = el.element!;
        const text = g.text!;
        text.rtfData = plainTextToRtf(rtfToPlainText(text.rtfData!), themeRtfStyle(theme, height));
        text.attributes = themeAttributes(theme, height);
        text.shadow = themeShadow(theme);
        text.verticalAlignment = themeVerticalAlignment(theme);
        g.fill = themeFill(theme);
        text.scaleBehavior = THEME_SCALE_BEHAVIOR;
        if (boxes.length === 1) {
          g.bounds = {
            $typeName: 'vessel.format.Graphics.Rect',
            origin: { $typeName: 'vessel.format.Graphics.Point', x: theme.box.x * width, y: theme.box.y * height },
            size: { $typeName: 'vessel.format.Graphics.Size', width: theme.box.width * width, height: theme.box.height * height }
          };
        }
      }
    }
  });
}

/** Put a picture on slides at a placement (on top of what's there). */
export function addSlideImage(p: Presentation, cueIds: string[], path: string, placement: ImagePlacement): Presentation {
  return edit(p, (d) => {
    for (const cueId of cueIds) {
      const slide = slideOfCue(findCue(d, cueId));
      if (!slide) continue;
      const box = placementBox(placement, slide.size?.width || SLIDE_WIDTH, slide.size?.height || SLIDE_HEIGHT);
      slide.elements.push(imageElement(path, box, placement === 'full' ? 'fill' : 'fit'));
    }
  });
}

/** Move a picture or shape to a placement. */
export function placeSlideElement(p: Presentation, cueId: string, elementId: string, placement: ImagePlacement): Presentation {
  return edit(p, (d) => {
    const slide = slideOfCue(findCue(d, cueId));
    const el = slide?.elements.find((e) => uuidOf(e.element?.uuid) === elementId)?.element;
    if (!slide || !el) throw new Error('No such picture on this slide');
    const box = placementBox(placement, slide.size?.width || SLIDE_WIDTH, slide.size?.height || SLIDE_HEIGHT);
    el.bounds = {
      $typeName: 'vessel.format.Graphics.Rect',
      origin: { $typeName: 'vessel.format.Graphics.Point', x: box.x, y: box.y },
      size: { $typeName: 'vessel.format.Graphics.Size', width: box.width, height: box.height }
    };
  });
}

export function removeSlideElement(p: Presentation, cueId: string, elementId: string): Presentation {
  return edit(p, (d) => {
    const slide = slideOfCue(findCue(d, cueId));
    if (slide) slide.elements = slide.elements.filter((e) => uuidOf(e.element?.uuid) !== elementId);
  });
}

/** Copy one slide's picture to every other slide that doesn't already have the same picture in the same place. */
export function copyElementToAllSlides(p: Presentation, cueId: string, elementId: string): Presentation {
  return edit(p, (d) => {
    const source = slideOfCue(findCue(d, cueId))?.elements.find((e) => uuidOf(e.element?.uuid) === elementId);
    if (!source?.element) throw new Error('No such picture on this slide');
    const sig = (e: Slide_Element): string => JSON.stringify([e.element?.bounds, e.element?.fill]);
    for (const cue of d.cues) {
      const slide = slideOfCue(cue);
      if (!slide || slide.elements.some((e) => sig(e) === sig(source))) continue;
      const copy = clone(Slide_ElementSchema, source);
      copy.element!.uuid = newUuid();
      slide.elements.push(copy);
    }
  });
}

export function renamePresentation(p: Presentation, name: string): Presentation {
  return edit(p, (d) => {
    d.name = name;
  });
}

/**
 * Replace a slide's text. The first text box keeps its styling; any extra
 * text boxes on the slide are left alone.
 */
export function setSlideText(p: Presentation, cueId: string, text: string): Presentation {
  return edit(p, (d) => writeCueText(d, findCue(d, cueId), text));
}

function writeCueText(d: Draft, cue: Cue, text: string): void {
  const slide = slideOfCue(cue);
  if (!slide) throw new Error('This cue has no slide to edit');
  const [first] = textElements(slide);
  if (first) first.element!.text!.rtfData = replaceRtfText(first.element!.text!.rtfData, text);
  else slide.elements.push(textElement(replaceRtfText(styleSource(d), text)));
}

/** The group a slide belongs to (its first one, if it's in several). */
export function groupOfCue(p: Presentation, cueId: string): string | null {
  const g = p.cueGroups.find((x) => x.cueIdentifiers.some((c) => uuidOf(c) === cueId));
  return g ? uuidOf(g.group?.uuid) : null;
}

/** Split a slide in two: it keeps `before`, and a copy right after it gets `after`. */
export function splitSlide(p: Presentation, groupId: string, cueId: string, before: string, after: string): Presentation {
  const withCopy = duplicateSlide(p, groupId, cueId);
  const group = withCopy.cueGroups.find((g) => uuidOf(g.group?.uuid) === groupId)!;
  const at = group.cueIdentifiers.findIndex((c) => uuidOf(c) === cueId);
  const copyId = uuidOf(group.cueIdentifiers[at + 1]);
  return setSlideText(setSlideText(withCopy, cueId, before.replace(/\s+$/, '')), copyId, after.replace(/^\s+/, ''));
}

/** Insert a new blank slide just before another one in its group. */
export function insertSlideBefore(p: Presentation, groupId: string, beforeCueId: string): { presentation: Presentation; cueId: string } {
  const added = addSlide(p, groupId, '', beforeCueId);
  const group = added.presentation.cueGroups.find((g) => uuidOf(g.group?.uuid) === groupId)!;
  const target = group.cueIdentifiers.findIndex((c) => uuidOf(c) === beforeCueId);
  return { presentation: moveSlide(added.presentation, groupId, added.cueId, groupId, target), cueId: added.cueId };
}

/** The whole song as editable text: "[Group]" headers, blank lines between slides. */
export function presentationToLyrics(p: Presentation): string {
  const cues = new Map(p.cues.map((c) => [uuidOf(c.uuid), c]));
  return p.cueGroups
    .map((g) => {
      const slides = g.cueIdentifiers.map((id) => cues.get(uuidOf(id))).filter((c): c is Cue => !!c).map(slideTextOfCue);
      const header = g.group?.name ? `[${g.group.name}]` : '';
      return [header, slides.join('\n\n')].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

/**
 * Rewrite a song from lyrics text. Sections are matched to existing groups by
 * name (in order) and their slides are reused one by one, so styling, colours,
 * backgrounds and pictures stay; extra slides copy their neighbours' look, and
 * groups or slides no longer in the text are removed (also from arrangements).
 */
export function applyLyrics(p: Presentation, text: string): Presentation {
  const sections = parseLyrics(text);
  return edit(p, (d) => {
    const cuesById = new Map(d.cues.map((c) => [uuidOf(c.uuid), c]));
    const unused = [...d.cueGroups];
    const groups: Presentation_CueGroup[] = [];
    const cues: Cue[] = [];
    for (const section of sections) {
      const at = unused.findIndex((g) => (g.group?.name ?? '').toLowerCase() === section.group.toLowerCase());
      const group = at >= 0 ? unused.splice(at, 1)[0] : newCueGroup(section.group);
      const existing = group.cueIdentifiers.map((id) => cuesById.get(uuidOf(id))).filter((c): c is Cue => !!c);
      const template = existing[0] ?? groups[groups.length - 1]?.cueIdentifiers.map((id) => cuesById.get(uuidOf(id))).find(Boolean);
      const slideCues = section.slides.map((slideText, i) => {
        let cue = existing[i];
        if (!cue) {
          if (template) {
            cue = clone(CueSchema, template);
            cue.uuid = newUuid();
            for (const action of cue.actions) action.uuid = newUuid();
            const slide = slideOfCue(cue);
            if (slide) {
              slide.uuid = newUuid();
              for (const el of slide.elements) if (el.element) el.element.uuid = newUuid();
            }
          } else cue = slideLike(d, slideText);
          cuesById.set(uuidOf(cue.uuid), cue);
        }
        writeCueText(d, cue, slideText);
        return cue;
      });
      group.cueIdentifiers = slideCues.map((c) => c.uuid!);
      groups.push(group);
      cues.push(...slideCues);
    }
    const kept = new Set(groups.map((g) => uuidOf(g.group?.uuid)));
    for (const a of d.arrangements) a.groupIdentifiers = a.groupIdentifiers.filter((g) => kept.has(uuidOf(g)));
    d.cueGroups = groups;
    d.cues = cues;
  });
}

/** Insert a new slide into a group, after `afterCueId` or at the end. Returns the new cue id too. */
export function addSlide(p: Presentation, groupId: string, text = '', afterCueId?: string): { presentation: Presentation; cueId: string } {
  let cueId = '';
  const presentation = edit(p, (d) => {
    const group = findGroup(d, groupId);
    const cue = slideLike(d, text, groupId);
    cueId = uuidOf(cue.uuid);
    const at = afterCueId ? group.cueIdentifiers.findIndex((c) => uuidOf(c) === afterCueId) + 1 : group.cueIdentifiers.length;
    group.cueIdentifiers.splice(at > 0 ? at : group.cueIdentifiers.length, 0, cue.uuid!);
    const cueAt = afterCueId ? d.cues.findIndex((c) => uuidOf(c.uuid) === afterCueId) + 1 : d.cues.length;
    d.cues.splice(cueAt > 0 ? cueAt : d.cues.length, 0, cue);
  });
  return { presentation, cueId };
}

export function duplicateSlide(p: Presentation, groupId: string, cueId: string): Presentation {
  return edit(p, (d) => {
    const group = findGroup(d, groupId);
    const copy = clone(CueSchema, findCue(d, cueId));
    copy.uuid = newUuid();
    for (const action of copy.actions) action.uuid = newUuid();
    const slide = slideOfCue(copy);
    if (slide) {
      slide.uuid = newUuid();
      for (const el of slide.elements) if (el.element) el.element.uuid = newUuid();
    }
    const at = group.cueIdentifiers.findIndex((c) => uuidOf(c) === cueId) + 1;
    group.cueIdentifiers.splice(at, 0, copy.uuid);
    d.cues.splice(d.cues.findIndex((c) => uuidOf(c.uuid) === cueId) + 1, 0, copy);
  });
}

export function deleteSlide(p: Presentation, groupId: string, cueId: string): Presentation {
  return edit(p, (d) => {
    const group = findGroup(d, groupId);
    group.cueIdentifiers = group.cueIdentifiers.filter((c) => uuidOf(c) !== cueId);
    pruneCues(d);
  });
}

/** Move a slide to `toIndex` within `toGroupId` (which may be its current group). */
export function moveSlide(p: Presentation, fromGroupId: string, cueId: string, toGroupId: string, toIndex: number): Presentation {
  return edit(p, (d) => {
    const from = findGroup(d, fromGroupId);
    const to = findGroup(d, toGroupId);
    const fromIndex = from.cueIdentifiers.findIndex((c) => uuidOf(c) === cueId);
    if (fromIndex < 0) throw new Error(`Slide ${cueId} is not in that group`);
    const [id] = from.cueIdentifiers.splice(fromIndex, 1);
    // Removing it first shifts later positions in the same group down by one.
    const target = from === to && fromIndex < toIndex ? toIndex - 1 : toIndex;
    to.cueIdentifiers.splice(Math.max(0, Math.min(target, to.cueIdentifiers.length)), 0, id);
  });
}

export function addGroup(p: Presentation, name: string): { presentation: Presentation; groupId: string } {
  let groupId = '';
  const presentation = edit(p, (d) => {
    const cue = slideLike(d, '');
    const group = newCueGroup(name, [cue]);
    groupId = uuidOf(group.group?.uuid);
    d.cues.push(cue);
    d.cueGroups.push(group);
  });
  return { presentation, groupId };
}

export function renameGroup(p: Presentation, groupId: string, name: string): Presentation {
  return edit(p, (d) => {
    findGroup(d, groupId).group!.name = name;
  });
}

export function setGroupColor(p: Presentation, groupId: string, hex: string): Presentation {
  return edit(p, (d) => {
    findGroup(d, groupId).group!.color = hexToColor(hex);
  });
}

export function moveGroup(p: Presentation, groupId: string, toIndex: number): Presentation {
  return edit(p, (d) => {
    const from = d.cueGroups.findIndex((g) => uuidOf(g.group?.uuid) === groupId);
    const [g] = d.cueGroups.splice(from, 1);
    d.cueGroups.splice(Math.max(0, Math.min(toIndex, d.cueGroups.length)), 0, g);
  });
}

/** Delete a group, its slides, and every use of it in arrangements. */
export function deleteGroup(p: Presentation, groupId: string): Presentation {
  return edit(p, (d) => {
    d.cueGroups = d.cueGroups.filter((g) => uuidOf(g.group?.uuid) !== groupId);
    for (const a of d.arrangements) a.groupIdentifiers = a.groupIdentifiers.filter((g) => uuidOf(g) !== groupId);
    pruneCues(d);
  });
}

export function addArrangement(p: Presentation, name: string, groupIds?: string[]): { presentation: Presentation; arrangementId: string } {
  let arrangementId = '';
  const presentation = edit(p, (d) => {
    const ids = groupIds ?? d.cueGroups.map((g) => uuidOf(g.group?.uuid));
    const a = create(Presentation_ArrangementSchema, {
      uuid: newUuid(),
      name,
      groupIdentifiers: ids.map((id) => ({ $typeName: 'vessel.format.UUID' as const, string: id }))
    });
    arrangementId = uuidOf(a.uuid);
    d.arrangements.push(a);
    d.selectedArrangement = a.uuid;
  });
  return { presentation, arrangementId };
}

export function renameArrangement(p: Presentation, arrangementId: string, name: string): Presentation {
  return edit(p, (d) => {
    const a = d.arrangements.find((x) => uuidOf(x.uuid) === arrangementId);
    if (a) a.name = name;
  });
}

/** Replace the group order of an arrangement (groups may repeat). */
export function setArrangementGroups(p: Presentation, arrangementId: string, groupIds: string[]): Presentation {
  return edit(p, (d) => {
    const a = d.arrangements.find((x) => uuidOf(x.uuid) === arrangementId);
    if (!a) throw new Error(`No arrangement ${arrangementId}`);
    a.groupIdentifiers = groupIds.map((id) => ({ $typeName: 'vessel.format.UUID' as const, string: id }));
  });
}

export function deleteArrangement(p: Presentation, arrangementId: string): Presentation {
  return edit(p, (d) => {
    d.arrangements = d.arrangements.filter((a) => uuidOf(a.uuid) !== arrangementId);
    if (uuidOf(d.selectedArrangement) === arrangementId) d.selectedArrangement = undefined;
  });
}

/** Choose which arrangement plays; undefined plays every group in document order. */
export function selectArrangement(p: Presentation, arrangementId: string | undefined): Presentation {
  return edit(p, (d) => {
    const a = arrangementId ? d.arrangements.find((x) => uuidOf(x.uuid) === arrangementId) : undefined;
    d.selectedArrangement = a?.uuid ? { ...a.uuid } : undefined;
  });
}

/** Give a slide its own timer (ProPresenter's "go to next after"), or take it off with null. */
export function setSlideAdvance(p: Presentation, cueId: string, advance: SlideAdvance | null): Presentation {
  return edit(p, (d) => {
    const cue = d.cues.find((c) => uuidOf(c.uuid) === cueId);
    if (cue) writeAdvance(cue, advance);
  });
}

function writeAdvance(cue: Cue, advance: SlideAdvance | null): void {
  if (!advance) {
    cue.completionTargetType = Cue_CompletionTargetType.NONE;
    cue.completionActionType = Cue_CompletionActionType.FIRST;
    cue.completionTime = 0;
    cue.completionTargetUuid = undefined;
    return;
  }
  cue.completionActionType = Cue_CompletionActionType.AFTER_TIME;
  cue.completionTime = advance.seconds;
  cue.completionTargetUuid = undefined;
  if (typeof advance.to === 'object') {
    cue.completionTargetType = Cue_CompletionTargetType.CUE;
    cue.completionTargetUuid = { $typeName: 'vessel.format.UUID', string: advance.to.cueId };
  } else {
    cue.completionTargetType = { next: Cue_CompletionTargetType.NEXT, first: Cue_CompletionTargetType.FIRST, random: Cue_CompletionTargetType.RANDOM }[advance.to];
  }
}

/**
 * Time every slide: each moves on after `seconds`. With `loop`, the last slide
 * goes back to the first (an announcement loop); otherwise it stays. Null
 * takes every timer off.
 */
export function setPresentationTimer(p: Presentation, seconds: number | null, loop = true): Presentation {
  const order = presentationToDeck(p, '').slides.map((s) => s.cueId);
  const last = order[order.length - 1];
  return edit(p, (d) => {
    for (const cue of d.cues) {
      const id = uuidOf(cue.uuid);
      if (seconds === null) writeAdvance(cue, null);
      else if (id === last) writeAdvance(cue, loop ? { seconds, to: 'first' } : null);
      else writeAdvance(cue, { seconds, to: 'next' });
    }
  });
}

/** Turn a slide off (skipped by Next/Previous) or back on. */
export function setSlideEnabled(p: Presentation, cueId: string, enabled: boolean): Presentation {
  return edit(p, (d) => {
    const cue = d.cues.find((c) => uuidOf(c.uuid) === cueId);
    if (cue) cue.isEnabled = enabled;
  });
}

/**
 * Add another presentation's groups and slides to the end of `p` (a passage
 * into a sermon). Everything gets new ids, so the same passage can be added
 * twice; if `p` plays an arrangement, the new groups are added to it too.
 */
export function appendPresentation(p: Presentation, source: Presentation): { presentation: Presentation; firstCueId: string | null } {
  let firstCueId: string | null = null;
  const presentation = edit(p, (d) => {
    const cueById = new Map(source.cues.map((c) => [uuidOf(c.uuid), c]));
    const selected = d.arrangements.find((a) => uuidOf(a.uuid) === uuidOf(d.selectedArrangement));
    for (const g of source.cueGroups) {
      const cues = g.cueIdentifiers.map((id) => cueById.get(uuidOf(id))).filter((c): c is Cue => !!c).map((c) => ({ ...clone(CueSchema, c), uuid: newUuid() }));
      if (!cues.length) continue;
      firstCueId ??= uuidOf(cues[0].uuid);
      d.cues.push(...cues);
      const group = newCueGroup(g.group?.name ?? '', cues);
      if (g.group?.color) group.group!.color = { ...g.group.color };
      d.cueGroups.push(group);
      selected?.groupIdentifiers.push({ ...group.group!.uuid! });
    }
  });
  return { presentation, firstCueId };
}

/** Slide sizes offered for new presentations. */
export const SLIDE_SIZES: Array<{ width: number; height: number; label: string }> = [
  { width: 1920, height: 1080, label: '1920 × 1080 (Full HD, 16:9)' },
  { width: 1280, height: 720, label: '1280 × 720 (HD, 16:9)' },
  { width: 3840, height: 2160, label: '3840 × 2160 (4K, 16:9)' },
  { width: 1024, height: 768, label: '1024 × 768 (4:3)' },
  { width: 1920, height: 1440, label: '1920 × 1440 (4:3)' }
];

/**
 * Give every slide a new size, moving and scaling what's on it to match. For
 * new presentations, before a theme is applied (themes size text to the slide).
 */
export function resizePresentation(p: Presentation, width: number, height: number): Presentation {
  if (!(width > 0) || !(height > 0)) return p;
  return edit(p, (d) => {
    for (const cue of d.cues) {
      const slide = slideOfCue(cue);
      if (!slide) continue;
      const fromW = slide.size?.width || SLIDE_WIDTH;
      const fromH = slide.size?.height || SLIDE_HEIGHT;
      if (fromW === width && fromH === height) continue;
      const sx = width / fromW;
      const sy = height / fromH;
      for (const el of slide.elements) {
        const b = el.element?.bounds;
        if (!b?.origin || !b.size) continue;
        b.origin.x *= sx;
        b.origin.y *= sy;
        b.size.width *= sx;
        b.size.height *= sy;
      }
      slide.size = { $typeName: 'vessel.format.Graphics.Size', width, height };
    }
  });
}
