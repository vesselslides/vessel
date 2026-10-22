// Import ProPresenter 5 (.pro5) and 6 (.pro6) documents. Both are XML
// ("RVPresentationDocument"); they differ mainly in how children are named:
// PP6 wraps them as <array rvXMLIvarName="slides">, PP5 as <slides>.
import { create } from '@bufbuild/protobuf';
import { XMLParser } from 'fast-xml-parser';
import type { Color } from '../gen/common_pb';
import type { Cue } from '../gen/presentation_pb';
import { Presentation_ArrangementSchema, Presentation_CCLISchema, type Presentation } from '../gen/presentation_pb';
import { mediaKindOf } from '../media';
import type { Background, MediaScale } from '../types';
import { backgroundAction } from './background';
import type { Slide_Element } from '../gen/presentation_pb';
import { imageElement, shapeElement } from './graphics';
import { createPresentation, defaultGroupColor, newCueGroup, slideCue, textElement, type Box } from './presentation';
import { plainTextToRtf } from './rtf';
import { fileUrlToPath } from './url';

export interface XNode {
  tag: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

export interface LegacyImportReport {
  version: 5 | 6;
  groups: number;
  slides: number;
  arrangements: number;
  backgrounds: number;
  /** Pictures placed on slides (logos, title graphics). */
  images: number;
  /** Media files (backgrounds or pictures) that could not be found on this computer (file names). */
  missingMedia: string[];
  /** Slide elements Vessel can't show yet, by type (e.g. foreground images). */
  skipped: Record<string, number>;
}

export interface LegacyImportOptions {
  /** Presentation name; PP5/PP6 documents take it from the file name. */
  name: string;
  /** Map a media path stored in the document to a file on this computer, or null if missing. */
  resolveMedia?: (path: string) => string | null;
}

type Raw = Record<string, unknown>;

function toNodes(items: Raw[], keepText = false): XNode[] {
  const nodes: XNode[] = [];
  for (const item of items) {
    const tag = Object.keys(item).find((k) => k !== ':@');
    if (tag === '#text' && keepText) nodes.push({ tag, attrs: {}, children: [], text: String(item[tag]) });
    if (!tag || tag === '#text') continue;
    const kids = (item[tag] as Raw[]) ?? [];
    nodes.push({
      tag,
      attrs: (item[':@'] as Record<string, string>) ?? {},
      children: toNodes(kids, keepText),
      text: kids
        .map((k) => k['#text'])
        .filter((t) => t !== undefined)
        .join('')
    });
  }
  return nodes;
}

/**
 * `trim: false` keeps the spaces inside text runs (Word and PowerPoint split
 * words across runs) and adds text as '#text' children, in document order.
 */
export function parseXml(xml: string, { trim = true }: { trim?: boolean } = {}): XNode[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    preserveOrder: true,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: trim
  });
  return toNodes(parser.parse(xml) as Raw[], !trim);
}

/** A named child: <array rvXMLIvarName="slides"> in PP6, <slides> in PP5. */
function field(node: XNode | undefined, name: string): XNode | undefined {
  return node?.children.find((c) => c.attrs.rvXMLIvarName === name) ?? node?.children.find((c) => c.tag === name);
}

function items(node: XNode | undefined, name: string, tag?: string): XNode[] {
  return (field(node, name)?.children ?? []).filter((c) => !tag || c.tag === tag);
}

const truthy = (v: string | undefined, fallback = true): boolean => (v === undefined || v === '' ? fallback : v === 'true' || v === '1');

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseColor(v: string | undefined): Color | undefined {
  const parts = (v ?? '').trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return undefined;
  const [red, green, blue, alpha = 1] = parts;
  return { $typeName: 'vessel.format.Color', red, green, blue, alpha };
}

/** Text box position: "{x y z width height}" in PP6, attributes in PP5. */
function parseBox(el: XNode): Box | undefined {
  const pos = field(el, 'position') ?? el.children.find((c) => c.tag === '_-RVRect3D-_position');
  if (!pos) return undefined;
  let nums: number[];
  if (pos.text) nums = pos.text.replace(/[{}]/g, ' ').trim().split(/\s+/).map(Number);
  else nums = [pos.attrs.x, pos.attrs.y, pos.attrs.z, pos.attrs.width, pos.attrs.height].map(Number);
  const [x, y, , width, height] = nums;
  return [x, y, width, height].every((n) => Number.isFinite(n)) && width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

function textRtf(el: XNode): Uint8Array | undefined {
  const rtf = el.attrs.RTFData ?? field(el, 'RTFData')?.text;
  if (rtf) return decodeBase64(rtf);
  // Windows-made PP6 files may only carry plain text.
  const plain = el.attrs.PlainText ?? field(el, 'PlainText')?.text;
  return plain ? plainTextToRtf(new TextDecoder().decode(decodeBase64(plain))) : undefined;
}

// PP5/PP6 scale behaviour numbers. 2 is stretch; the rest are inferred from
// sample files, so anything unknown falls back to fill.
function parseScale(v: string | undefined): MediaScale {
  if (v === '0') return 'fit';
  if (v === '2') return 'stretch';
  return 'fill';
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export function convertLegacyPresentation(xml: string, opts: LegacyImportOptions): { presentation: Presentation; report: LegacyImportReport } {
  const root = parseXml(xml).find((n) => n.tag === 'RVPresentationDocument');
  if (!root) throw new Error('Not a version 5/6 presentation (no RVPresentationDocument)');
  const version: 5 | 6 = Number(root.attrs.versionNumber) >= 600 ? 6 : 5;
  const size = { width: Number(root.attrs.width) || 1920, height: Number(root.attrs.height) || 1080 };

  const report: LegacyImportReport = { version, groups: 0, slides: 0, arrangements: 0, backgrounds: 0, images: 0, missingMedia: [], skipped: {} };
  const skip = (what: string): void => {
    report.skipped[what] = (report.skipped[what] ?? 0) + 1;
  };

  const presentation = createPresentation(opts.name, []);
  presentation.notes = root.attrs.notes ?? '';
  presentation.ccli = create(Presentation_CCLISchema, {
    author: root.attrs.CCLIAuthor ?? root.attrs.author ?? '',
    artistCredits: root.attrs.CCLIArtistCredits ?? root.attrs.artist ?? '',
    songTitle: root.attrs.CCLISongTitle ?? '',
    publisher: root.attrs.CCLIPublisher ?? '',
    copyrightYear: Number.parseInt(root.attrs.CCLICopyrightYear ?? root.attrs.CCLICopyrightInfo ?? '', 10) || 0,
    songNumber: Number.parseInt(root.attrs.CCLISongNumber ?? root.attrs.CCLILicenseNumber ?? '', 10) || 0,
    display: truthy(root.attrs.CCLIDisplay, false),
    album: root.attrs.album ?? ''
  });

  const usedIds = new Set<string>();
  const uniqueId = (id: string | undefined): string | undefined => {
    const upper = id?.trim().toUpperCase();
    if (!upper || usedIds.has(upper)) return undefined;
    usedIds.add(upper);
    return upper;
  };

  const backgroundOf = (cue: XNode): Background | null => {
    const el = cue.children.find((c) => c.attrs.rvXMLIvarName === 'element' || c.tag === 'element' || /Element$/.test(c.tag));
    const source = el?.attrs.source;
    if (!el || !source) return null;
    const stored = fileUrlToPath(source);
    const cls = cue.attrs.elementClassName ?? el.tag;
    const kind = /Video/.test(cls) ? 'video' : /Image/.test(cls) ? 'image' : mediaKindOf(stored);
    if (!kind) return null;
    const path = opts.resolveMedia ? opts.resolveMedia(stored) : stored;
    if (!path) {
      if (!report.missingMedia.includes(fileName(stored))) report.missingMedia.push(fileName(stored));
      return null;
    }
    return { path, kind, loop: kind === 'video' && el.attrs.playbackBehavior !== '0', scale: parseScale(el.attrs.scaleBehavior) };
  };

  /** Opacity and rotation as PP5/PP6 store them on any element. */
  const withLook = (element: Slide_Element, el: XNode): Slide_Element => {
    const opacity = Number(el.attrs.opacity);
    const rotation = Number(el.attrs.rotation);
    if (element.element) {
      if (Number.isFinite(opacity) && el.attrs.opacity !== undefined) element.element.opacity = Math.max(0, Math.min(1, opacity));
      if (Number.isFinite(rotation) && rotation) element.element.rotation = rotation;
    }
    return element;
  };

  /** A picture placed on the slide (a logo or title graphic), or null if its file is missing. */
  const imageOf = (el: XNode): Slide_Element | null => {
    const source = el.attrs.source;
    const box = parseBox(el);
    if (!source || !box) return null;
    const stored = fileUrlToPath(source);
    if (mediaKindOf(stored) !== 'image') {
      skip('ImageElement');
      return null;
    }
    const path = opts.resolveMedia ? opts.resolveMedia(stored) : stored;
    if (!path) {
      if (!report.missingMedia.includes(fileName(stored))) report.missingMedia.push(fileName(stored));
      return null;
    }
    report.images++;
    return withLook(imageElement(path, box, parseScale(el.attrs.scaleBehavior), el.attrs.displayName || undefined), el);
  };

  for (const g of items(root, 'groups', 'RVSlideGrouping')) {
    const cues: Cue[] = [];
    for (const s of items(g, 'slides', 'RVDisplaySlide')) {
      // Everything on the slide itself. PP5/PP6 list elements front to back (a
      // full-slide photo comes last); Vessel draws first-to-last, so this is reversed below.
      const elements: Slide_Element[] = [];
      let background: Background | null = null;
      // PP6 has a dedicated backgroundMediaCue; PP5 lists media cues among the slide's cues.
      const mediaCues = [field(s, 'backgroundMediaCue'), ...items(s, 'cues')].filter((c): c is XNode => c?.tag === 'RVMediaCue');
      for (const el of field(s, 'displayElements')?.children ?? []) {
        if (el.tag === 'RVTextElement') {
          const rtf = textRtf(el);
          if (!rtf) continue;
          const text = textElement(rtf, parseBox(el), el.attrs.displayName || 'Text');
          // A filled text box draws a bar behind its text.
          const fill = truthy(el.attrs.drawingFill, false) ? parseColor(el.attrs.fillColor) : undefined;
          if (fill) text.element!.fill = { $typeName: 'vessel.format.Graphics.Fill', enable: true, FillType: { case: 'color', value: fill } };
          withLook(text, el);
          elements.push(text);
        } else if (el.tag === 'RVMediaCue') mediaCues.push(el);
        else if (el.tag === 'RVImageElement') {
          const image = imageOf(el);
          if (image) elements.push(image);
        } else if (el.tag === 'RVShapeElement') {
          const fill = parseColor(el.attrs.fillColor);
          const box = parseBox(el);
          if (fill && box && truthy(el.attrs.drawingFill, true)) elements.push(withLook(shapeElement(box, fill, 'rectangle', el.attrs.displayName || 'Shape'), el));
          else skip('ShapeElement');
        } else skip(el.tag.replace(/^RV/, ''));
      }
      for (const mc of mediaCues) background ??= backgroundOf(mc);

      elements.reverse();
      const cue = slideCue(elements, size, { uuid: uniqueId(s.attrs.UUID), name: s.attrs.label ?? '', enabled: truthy(s.attrs.enabled) });
      if (background) {
        cue.actions.unshift(backgroundAction(background));
        report.backgrounds++;
      }
      cues.push(cue);
      report.slides++;
    }
    const group = newCueGroup(g.attrs.name ?? '', cues);
    const gid = uniqueId(g.attrs.uuid);
    if (gid) group.group!.uuid = { $typeName: 'vessel.format.UUID', string: gid };
    group.group!.color = parseColor(g.attrs.color) ?? defaultGroupColor(g.attrs.name ?? '');
    presentation.cues.push(...cues);
    presentation.cueGroups.push(group);
    report.groups++;
  }

  const groupIds = new Set(presentation.cueGroups.map((g) => g.group!.uuid!.string));
  for (const a of items(root, 'arrangements', 'RVSongArrangement')) {
    const ids = (field(a, 'groupIDs')?.children ?? [])
      .map((c) => (c.text || c.attrs['serialization-native-value'] || '').trim().toUpperCase())
      .filter((id) => groupIds.has(id));
    const uuid = a.attrs.uuid?.trim().toUpperCase() || crypto.randomUUID().toUpperCase();
    presentation.arrangements.push(
      create(Presentation_ArrangementSchema, {
        uuid: { string: uuid },
        name: a.attrs.name ?? '',
        groupIdentifiers: ids.map((string) => ({ string }))
      })
    );
    if (uuid === root.attrs.selectedArrangementID?.trim().toUpperCase()) presentation.selectedArrangement = { $typeName: 'vessel.format.UUID', string: uuid };
    report.arrangements++;
  }

  return { presentation, report };
}

export const LEGACY_EXTENSIONS = ['pro5', 'pro6'];
export const isLegacyPath = (path: string): boolean => LEGACY_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');
