import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { Action_ActionType, ActionSchema, type Action } from '../gen/presentation_pb';
import { ApplicationInfo_Application, ApplicationInfo_Platform, ApplicationInfoSchema } from '../gen/common_pb';
import type { Color } from '../gen/common_pb';
import { Cue_CompletionActionType, Cue_CompletionTargetType, CueSchema, type Cue } from '../gen/presentation_pb';
import { Graphics_Text_Attributes_Capitalization, Graphics_Text_ScaleBehavior, Graphics_Text_VerticalAlignment } from '../gen/graphics_pb';
import { GroupSchema } from '../gen/presentation_pb';
import {
  Presentation_CueGroupSchema,
  PresentationSchema,
  type Presentation,
  type Presentation_CueGroup
} from '../gen/presentation_pb';
import { Slide_Element_Info, Slide_ElementSchema, PresentationSlide_NotesSchema, type PresentationSlide, type Slide, type Slide_Element } from '../gen/presentation_pb';
import { VersionSchema } from '../gen/common_pb';
import type { Deck, GraphicLayout, GroupView, SlideAdvance, SlideLayout, SlideView, TextBoxLayout } from '../types';
import { fillColor, graphicOfElement } from './graphics';
import { groupKey } from '../hotkeys';
import { groupDefinitionFor, OTHER_GROUP_COLOR } from '../groups';
import { backgroundOfCue } from './background';
import { newUuid, uuidOf } from './ids';
import { parseRtfStyle, plainTextToRtf, rtfToPlainText, type RtfStyle } from './rtf';

export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

export function parsePresentation(bytes: Uint8Array): Presentation {
  return fromBinary(PresentationSchema, bytes);
}

export function serializePresentation(p: Presentation): Uint8Array {
  return toBinary(PresentationSchema, p);
}

const to255 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);

export function colorToCss(c: Color | undefined): string | undefined {
  if (!c) return undefined;
  return `rgba(${to255(c.red)}, ${to255(c.green)}, ${to255(c.blue)}, ${c.alpha || 1})`;
}

export function colorToHex(c: Color | undefined): string {
  if (!c) return '#737380';
  return '#' + [c.red, c.green, c.blue].map((v) => to255(v).toString(16).padStart(2, '0')).join('');
}

export function hexToColor(hex: string): Color {
  const n = parseInt(hex.replace('#', ''), 16);
  return { $typeName: 'vessel.format.Color', red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255, alpha: 1 };
}

export { newUuid, uuidOf };

/** The PresentationSlide's base slide inside a cue, if the cue shows a slide. */
export function slideOfCue(cue: Cue): Slide | undefined {
  for (const action of cue.actions) {
    if (action.ActionTypeData.case !== 'slide') continue;
    const slide = action.ActionTypeData.value.Slide;
    if (slide.case === 'presentation') return slide.value.baseSlide;
  }
  return undefined;
}

/** The cue's PresentationSlide (its slide plus notes), if the cue shows a slide. */
export function presentationSlideOfCue(cue: Cue): PresentationSlide | undefined {
  for (const action of cue.actions) {
    if (action.ActionTypeData.case !== 'slide') continue;
    const slide = action.ActionTypeData.value.Slide;
    if (slide.case === 'presentation') return slide.value;
  }
  return undefined;
}

/** The presenter's notes for a slide, as plain text ('' when there are none). */
export function notesOfCue(cue: Cue): string {
  const rtf = presentationSlideOfCue(cue)?.notes?.rtfData;
  return rtf && rtf.length ? rtfToPlainText(rtf).trim() : '';
}

/** Notes are plain black text, as ProPresenter writes them. */
const NOTES_RTF_STYLE: RtfStyle = { font: 'Helvetica', sizePt: 18, color: [0, 0, 0], align: 'left' };

/** Set (or, with blank text, remove) a cue's notes, in place. */
export function writeCueNotes(cue: Cue, notes: string): void {
  const slide = presentationSlideOfCue(cue);
  if (!slide) throw new Error('This cue has no slide to add notes to');
  const text = notes.replace(/\s+$/, '');
  slide.notes = text.trim() ? create(PresentationSlide_NotesSchema, { rtfData: plainTextToRtf(text, NOTES_RTF_STYLE) }) : undefined;
}

/** Text elements of a slide, in drawing order. */
export function textElements(slide: Slide | undefined): Slide_Element[] {
  return (slide?.elements ?? []).filter((e) => e.element?.text?.rtfData && e.element.text.rtfData.length > 0);
}

const rgb = (c: [number, number, number]): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** Read how a cue's slide looks: size, background colour and every visible text box. */
export function layoutOfCue(cue: Cue): SlideLayout {
  const slide = slideOfCue(cue);
  const width = slide?.size?.width || SLIDE_WIDTH;
  const height = slide?.size?.height || SLIDE_HEIGHT;
  const boxes: TextBoxLayout[] = [];
  const graphics: GraphicLayout[] = [];
  // Elements draw in list order, so their index is their stacking order.
  (slide?.elements ?? []).forEach((e, z) => {
    const el = e.element;
    if (!el || el.hidden) return;
    const text = el.text;
    if (!text?.rtfData?.length) {
      const g = graphicOfElement(el, z);
      if (g) graphics.push(g);
      return;
    }
    const style = parseRtfStyle(text.rtfData);
    const attrs = text.attributes;
    const b = el.bounds;
    const outline = attrs && attrs.strokeWidth > 0 && attrs.strokeColor ? { width: attrs.strokeWidth, color: colorToCss(attrs.strokeColor)! } : null;
    boxes.push({
      z,
      fill: fillColor(el.fill),
      x: b?.origin?.x ?? 0,
      y: b?.origin?.y ?? 0,
      width: b?.size?.width || width,
      height: b?.size?.height || height,
      text: rtfToPlainText(text.rtfData),
      font: style.font,
      bold: !!style.bold,
      italic: !!style.italic,
      sizePt: style.sizePt,
      color: rgb(style.color),
      align: style.align,
      valign:
        text.verticalAlignment === Graphics_Text_VerticalAlignment.TOP ? 'top' : text.verticalAlignment === Graphics_Text_VerticalAlignment.BOTTOM ? 'bottom' : 'middle',
      uppercase: attrs?.capitalization === Graphics_Text_Attributes_Capitalization.ALL_CAPS,
      shadow: !!text.shadow?.enable,
      outline,
      shrink: text.scaleBehavior === Graphics_Text_ScaleBehavior.SCALE_FONT_DOWN || text.scaleBehavior === Graphics_Text_ScaleBehavior.SCALE_FONT_UP_DOWN
    });
  });
  return { width, height, background: slide?.drawsBackgroundColor ? colorToCss(slide.backgroundColor) : undefined, boxes, graphics };
}

/** The same layout with the first text box showing `text` (for live previews while editing). */
export function layoutWithText(layout: SlideLayout, text: string): SlideLayout {
  if (!layout.boxes.length) return layout;
  return { ...layout, boxes: [{ ...layout.boxes[0], text }, ...layout.boxes.slice(1)] };
}

export function slideTextOfCue(cue: Cue): string {
  return textElements(slideOfCue(cue))
    .map((e) => rtfToPlainText(e.element!.text!.rtfData!))
    .filter((t) => t.trim().length > 0)
    .join('\n');
}

/** A slide's own timer: ProPresenter's "after time" completion with a target. */
export function advanceOfCue(cue: Cue): SlideAdvance | undefined {
  if (cue.completionActionType !== Cue_CompletionActionType.AFTER_TIME || !(cue.completionTime > 0)) return undefined;
  const seconds = Math.round(cue.completionTime * 10) / 10;
  switch (cue.completionTargetType) {
    case Cue_CompletionTargetType.NEXT:
      return { seconds, to: 'next' };
    case Cue_CompletionTargetType.FIRST:
      return { seconds, to: 'first' };
    case Cue_CompletionTargetType.RANDOM:
      return { seconds, to: 'random' };
    case Cue_CompletionTargetType.CUE:
      return cue.completionTargetUuid ? { seconds, to: { cueId: uuidOf(cue.completionTargetUuid) } } : undefined;
    default:
      return undefined;
  }
}

function slideView(cue: Cue, group: Presentation_CueGroup | undefined, position: number): SlideView {
  return {
    id: `${position}:${uuidOf(cue.uuid)}`,
    cueId: uuidOf(cue.uuid),
    groupId: uuidOf(group?.group?.uuid),
    text: slideTextOfCue(cue),
    label: cue.name,
    groupName: group?.group?.name ?? '',
    groupColor: colorToCss(group?.group?.color),
    background: backgroundOfCue(cue),
    layout: layoutOfCue(cue),
    enabled: cue.isEnabled,
    ...(notesOfCue(cue) ? { notes: notesOfCue(cue) } : {}),
    ...(advanceOfCue(cue) ? { advance: advanceOfCue(cue) } : {})
  };
}

/** Flatten a presentation into slides, following the selected arrangement when there is one. */
export function presentationToDeck(p: Presentation, id: string, sourcePath?: string): Deck {
  const cuesById = new Map(p.cues.map((c) => [uuidOf(c.uuid), c]));
  const groupsById = new Map(p.cueGroups.map((g) => [uuidOf(g.group?.uuid), g]));

  const groups: GroupView[] = p.cueGroups.map((g) => ({
    id: uuidOf(g.group?.uuid),
    name: g.group?.name ?? '',
    color: colorToCss(g.group?.color),
    colorHex: colorToHex(g.group?.color),
    hotkey: groupKey(g.group?.name ?? '', g.group?.hotKey?.code),
    slides: g.cueIdentifiers
      .map((cid) => cuesById.get(uuidOf(cid)))
      .filter((c): c is Cue => !!c)
      .map((c, i) => slideView(c, g, i))
  }));

  let groupOrder = p.cueGroups;
  const arrangement = p.arrangements.find((a) => uuidOf(a.uuid) === uuidOf(p.selectedArrangement));
  if (arrangement) {
    groupOrder = arrangement.groupIdentifiers
      .map((gid) => groupsById.get(uuidOf(gid)))
      .filter((g): g is Presentation_CueGroup => !!g);
  }

  const slides: SlideView[] = [];
  const seen = new Set<string>();
  for (const group of groupOrder) {
    for (const cueId of group.cueIdentifiers) {
      const cue = cuesById.get(uuidOf(cueId));
      if (!cue) continue;
      seen.add(uuidOf(cue.uuid));
      slides.push(slideView(cue, group, slides.length));
    }
  }
  // Cues that belong to no group still show up, after the grouped ones.
  if (!arrangement) {
    for (const cue of p.cues) {
      if (!seen.has(uuidOf(cue.uuid))) slides.push(slideView(cue, undefined, slides.length));
    }
  }

  return {
    id,
    name: p.name,
    slides,
    groups,
    arrangements: p.arrangements.map((a) => ({ id: uuidOf(a.uuid), name: a.name, groupIds: a.groupIdentifiers.map(uuidOf) })),
    selectedArrangementId: arrangement ? uuidOf(arrangement.uuid) : undefined,
    sourcePath,
    arrangementName: arrangement?.name
  };
}

export interface Section {
  group: string;
  slides: string[];
}

/**
 * Parse lyrics typed by an operator. Blank lines separate slides; a line in
 * square brackets ("[Chorus]") starts a new group.
 */
export function parseLyrics(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const block of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const header = /^\s*\[(.+)\]\s*$/.exec(lines[0] ?? '');
    if (header) {
      current = { group: header[1].trim(), slides: [] };
      sections.push(current);
      lines.shift();
    }
    const body = lines.join('\n').trim();
    if (!body) continue;
    if (!current) {
      current = { group: '', slides: [] };
      sections.push(current);
    }
    current.slides.push(body);
  }
  return sections;
}

/** Colour for a new group, from the church's group list (Preferences ▸ Groups). */
export function defaultGroupColor(name: string): Color {
  return hexToColor(groupDefinitionFor(name)?.color ?? OTHER_GROUP_COLOR);
}


function platform(): ApplicationInfo_Platform {
  const p = typeof process !== 'undefined' ? process.platform : '';
  return p === 'win32' ? ApplicationInfo_Platform.WINDOWS : ApplicationInfo_Platform.MACOS;
}

/** A full-slide text box like the ones ProPresenter creates for lyrics. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_TEXT_BOX: Box = { x: 96, y: 96, width: SLIDE_WIDTH - 192, height: SLIDE_HEIGHT - 192 };

export function textElement(rtf: Uint8Array, box: Box = DEFAULT_TEXT_BOX, name = 'Lyrics'): Slide_Element {
  return create(Slide_ElementSchema, {
    info: Slide_Element_Info.IS_TEXT_ELEMENT,
    element: {
      uuid: newUuid(),
      name,
      opacity: 1,
      bounds: { origin: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } },
      text: {
        rtfData: rtf,
        verticalAlignment: Graphics_Text_VerticalAlignment.MIDDLE,
        scaleBehavior: Graphics_Text_ScaleBehavior.SCALE_FONT_DOWN
      }
    }
  });
}

export function newSlideCue(text: string, rtf: Uint8Array = plainTextToRtf(text)): Cue {
  return slideCue([textElement(rtf)]);
}

/** A cue that shows one slide made of the given elements. */
export function slideCue(
  elements: Slide_Element[],
  size: { width: number; height: number } = { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
  opts: { uuid?: string; name?: string; enabled?: boolean } = {}
): Cue {
  const action: Action = create(ActionSchema, {
    uuid: newUuid(),
    type: Action_ActionType.PRESENTATION_SLIDE,
    isEnabled: true,
    ActionTypeData: {
      case: 'slide',
      value: {
        Slide: {
          case: 'presentation',
          value: {
            baseSlide: { uuid: newUuid(), size, elements }
          }
        }
      }
    }
  });
  return create(CueSchema, {
    uuid: opts.uuid ? { $typeName: 'vessel.format.UUID', string: opts.uuid } : newUuid(),
    name: opts.name ?? '',
    isEnabled: opts.enabled ?? true,
    actions: [action]
  });
}

export function newCueGroup(name: string, cues: Cue[] = []): Presentation_CueGroup {
  return create(Presentation_CueGroupSchema, {
    group: create(GroupSchema, { uuid: newUuid(), name, color: defaultGroupColor(name) }),
    cueIdentifiers: cues.map((c) => c.uuid!)
  });
}

/** Build a ProPresenter-compatible presentation from plain sections of text. */
export function createPresentation(name: string, sections: Section[]): Presentation {
  const cues: Cue[] = [];
  const cueGroups = sections.map((section) => {
    const groupCues = section.slides.map((text) => newSlideCue(text));
    cues.push(...groupCues);
    return newCueGroup(section.group, groupCues);
  });
  return create(PresentationSchema, {
    applicationInfo: create(ApplicationInfoSchema, {
      platform: platform(),
      application: ApplicationInfo_Application.UNDEFINED,
      applicationVersion: create(VersionSchema, { majorVersion: 0, minorVersion: 1 })
    }),
    uuid: newUuid(),
    name,
    cues,
    cueGroups
  });
}
