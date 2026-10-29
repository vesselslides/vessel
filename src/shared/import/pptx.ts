// PowerPoint (.pptx) to a presentation. Google Slides and Keynote export this
// format too. Two ways in:
//  - 'slides' keeps each slide's look: background, pictures, shapes and text
//    boxes where they sit, with their font, size, colour and alignment;
//  - 'lyrics' takes only the words and makes a song of them, to be shown with
//    a theme like any other song.
import type { Color } from '../gen/common_pb';
import type { Cue } from '../gen/presentation_pb';
import { Graphics_Text_VerticalAlignment } from '../gen/graphics_pb';
import type { Presentation } from '../gen/presentation_pb';
import type { Slide_Element } from '../gen/presentation_pb';
import { mediaKindOf } from '../media';
import { imageElement, shapeElement, type Box } from '../pro/graphics';
import type { XNode } from '../pro/legacy';
import { createPresentation, newCueGroup, slideCue, textElement, writeCueNotes } from '../pro/presentation';
import { plainTextToRtf, type RtfStyle } from '../pro/rtf';
import { xmlOf, zipFiles } from './documents';
import { extractStanzas, stanzasToPresentation, type LyricsOptions, type LyricsReport } from './lyrics';

export interface PptxOptions {
  look: 'slides' | 'lyrics';
  lyrics: LyricsOptions;
  /** Store a picture from the file (by its path in the zip) and return where it was saved, or null. */
  saveMedia?: (zipPath: string, data: Uint8Array) => string | null;
}

export interface PptxReport {
  slides: number;
  groups: number;
  pictures: number;
  hiddenSlides: number;
  /** Slides that came with speaker notes. */
  notes: number;
  /** Things not brought across, by kind (tables, charts, videos…). */
  skipped: Record<string, number>;
  lyrics?: LyricsReport;
}

const WIDTH = 1920;
const EMU_PER_PT = 12700;

// ---- XML helpers ---------------------------------------------------------------

const kid = (n: XNode | undefined, tag: string): XNode | undefined => n?.children.find((c) => c.tag === tag);
const kids = (n: XNode | undefined, tag: string): XNode[] => n?.children.filter((c) => c.tag === tag) ?? [];
const path = (n: XNode | undefined, ...tags: string[]): XNode | undefined => tags.reduce<XNode | undefined>((at, t) => kid(at, t), n);
const textOf = (n: XNode): string => n.children.filter((c) => c.tag === '#text').map((c) => c.text).join('');
const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? n : fallback;
};

/** Shapes inside `mc:AlternateContent` are read from the fallback, which every reader understands. */
function shapesOf(tree: XNode | undefined): XNode[] {
  const out: XNode[] = [];
  for (const c of tree?.children ?? []) {
    if (c.tag === 'mc:AlternateContent') out.push(...shapesOf(kid(c, 'mc:Fallback') ?? kid(c, 'mc:Choice')));
    else out.push(c);
  }
  return out;
}

function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

// ---- Colours ---------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number; a: number };

const hexRgb = (hex: string | undefined): Rgb | undefined =>
  hex && /^[0-9a-f]{6}$/i.test(hex) ? { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255, a: 1 } : undefined;

const PRESET: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' };

function toHsl({ r, g, b }: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number, a: number): Rgb {
  if (s === 0) return { r: l, g: l, b: l, a };
  const hue = (p: number, q: number, t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue(p, q, h + 1 / 3), g: hue(p, q, h), b: hue(p, q, h - 1 / 3), a };
}

/** lumMod/lumOff (theme tints), tint/shade and alpha, as PowerPoint applies them. */
function applyModifiers(c: Rgb, node: XNode): Rgb {
  let out = { ...c };
  for (const m of node.children) {
    const v = num(m.attrs.val, 100000) / 100000;
    if (m.tag === 'a:alpha') out.a = v;
    else if (m.tag === 'a:lumMod' || m.tag === 'a:lumOff') {
      const [h, s, l] = toHsl(out);
      out = fromHsl(h, s, Math.max(0, Math.min(1, m.tag === 'a:lumMod' ? l * v : l + v)), out.a);
    } else if (m.tag === 'a:tint') out = { r: 1 - (1 - out.r) * v, g: 1 - (1 - out.g) * v, b: 1 - (1 - out.b) * v, a: out.a };
    else if (m.tag === 'a:shade') out = { r: out.r * v, g: out.g * v, b: out.b * v, a: out.a };
  }
  return out;
}

const toColor = (c: Rgb): Color => ({ $typeName: 'vessel.format.Color', red: c.r, green: c.g, blue: c.b, alpha: c.a });

// ---- The file --------------------------------------------------------------------

interface Theme {
  colors: Map<string, Rgb>;
  majorFont: string;
  minorFont: string;
}

/** A slide, layout or master: its XML, where its relationships resolve, and its colours. */
interface Part {
  path: string;
  root: XNode;
  theme: Theme;
  clrMap: Record<string, string>;
}

class PptxFile {
  private xmlCache = new Map<string, XNode | null>();
  constructor(readonly files: Map<string, Uint8Array>) {}

  xml(name: string): XNode | null {
    if (!this.xmlCache.has(name)) {
      const bytes = this.files.get(name);
      this.xmlCache.set(name, bytes ? (xmlOf(bytes).find((n) => !n.tag.startsWith('?') && n.tag !== '#text') ?? null) : null);
    }
    return this.xmlCache.get(name)!;
  }

  /** Relationship id → part path (or external target), plus by type. */
  rels(part: string): { byId: Map<string, string>; ofType: (suffix: string) => string | undefined } {
    const dir = part.split('/').slice(0, -1).join('/');
    const file = part.split('/').pop();
    const root = this.xml(`${dir ? `${dir}/` : ''}_rels/${file}.rels`);
    const byId = new Map<string, string>();
    const types: Array<[string, string]> = [];
    for (const r of kids(root ?? undefined, 'Relationship')) {
      if (r.attrs.TargetMode === 'External') continue;
      const target = resolveTarget(part, r.attrs.Target ?? '');
      byId.set(r.attrs.Id, target);
      types.push([r.attrs.Type ?? '', target]);
    }
    return { byId, ofType: (suffix) => types.find(([t]) => t.endsWith(suffix))?.[1] };
  }

  theme(themePath: string | undefined): Theme {
    const root = themePath ? this.xml(themePath) : null;
    const scheme = path_(root, 'a:themeElements', 'a:clrScheme');
    const colors = new Map<string, Rgb>();
    for (const c of scheme?.children ?? []) {
      const v = kid(c, 'a:srgbClr')?.attrs.val ?? kid(c, 'a:sysClr')?.attrs.lastClr;
      const rgb = hexRgb(v);
      if (rgb) colors.set(c.tag.replace(/^a:/, ''), rgb);
    }
    const fonts = path_(root, 'a:themeElements', 'a:fontScheme');
    return {
      colors,
      majorFont: path(fonts, 'a:majorFont', 'a:latin')?.attrs.typeface || 'Calibri Light',
      minorFont: path(fonts, 'a:minorFont', 'a:latin')?.attrs.typeface || 'Calibri'
    };
  }
}

const path_ = (n: XNode | null | undefined, ...tags: string[]): XNode | undefined => path(n ?? undefined, ...tags);

/** The colour inside a fill or colour-holding node (srgbClr, schemeClr…), or undefined. */
function colorIn(node: XNode | undefined, part: Part, placeholderColor?: Rgb): Rgb | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    let base: Rgb | undefined;
    if (c.tag === 'a:srgbClr') base = hexRgb(c.attrs.val);
    else if (c.tag === 'a:sysClr') base = hexRgb(c.attrs.lastClr) ?? (c.attrs.val === 'window' ? hexRgb('FFFFFF') : hexRgb('000000'));
    else if (c.tag === 'a:prstClr') base = hexRgb(PRESET[c.attrs.val ?? ''] ?? '000000');
    else if (c.tag === 'a:scrgbClr') base = { r: num(c.attrs.r, 0) / 100000, g: num(c.attrs.g, 0) / 100000, b: num(c.attrs.b, 0) / 100000, a: 1 };
    else if (c.tag === 'a:schemeClr') {
      const name = c.attrs.val ?? '';
      if (name === 'phClr') base = placeholderColor;
      else base = part.theme.colors.get(part.clrMap[name] ?? name);
    } else continue;
    return base ? applyModifiers(base, c) : undefined;
  }
  return undefined;
}

type Fill = { kind: 'none' } | { kind: 'color'; color: Rgb } | { kind: 'image'; zipPath: string };

/** The fill set directly in a shape, picture or background property node, or undefined if it inherits. */
function fillIn(props: XNode | undefined, part: Part, file: PptxFile): Fill | undefined {
  if (!props) return undefined;
  if (kid(props, 'a:noFill')) return { kind: 'none' };
  const solid = kid(props, 'a:solidFill');
  if (solid) {
    const color = colorIn(solid, part);
    return color ? { kind: 'color', color } : undefined;
  }
  const grad = kid(props, 'a:gradFill');
  if (grad) {
    // Gradients become their first colour.
    const color = colorIn(path(grad, 'a:gsLst', 'a:gs'), part);
    return color ? { kind: 'color', color } : undefined;
  }
  // Shapes and backgrounds use a:blipFill; pictures carry p:blipFill directly.
  const blip = kid(kid(props, 'a:blipFill') ?? kid(props, 'p:blipFill'), 'a:blip');
  if (blip) {
    const target = file.rels(part.path).byId.get(blip.attrs['r:embed'] ?? '');
    return target ? { kind: 'image', zipPath: target } : undefined;
  }
  return undefined;
}

// ---- Geometry --------------------------------------------------------------------

interface Frame {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rot: number;
}

function frameOf(xfrm: XNode | undefined): Frame | undefined {
  const off = kid(xfrm, 'a:off');
  const ext = kid(xfrm, 'a:ext');
  if (!off || !ext) return undefined;
  return { x: num(off.attrs.x, 0), y: num(off.attrs.y, 0), cx: num(ext.attrs.cx, 0), cy: num(ext.attrs.cy, 0), rot: num(xfrm?.attrs.rot, 0) / 60000 };
}

/** Maps a group's child coordinates onto the slide. */
type Transform = (f: Frame) => Frame;
const identity: Transform = (f) => f;

function groupTransform(grpSpPr: XNode | undefined, outer: Transform): Transform {
  const xfrm = kid(grpSpPr, 'a:xfrm');
  const frame = frameOf(xfrm);
  const chOff = kid(xfrm, 'a:chOff');
  const chExt = kid(xfrm, 'a:chExt');
  if (!frame || !chOff || !chExt) return outer;
  const cx0 = num(chOff.attrs.x, 0);
  const cy0 = num(chOff.attrs.y, 0);
  const sx = num(chExt.attrs.cx, 0) ? frame.cx / num(chExt.attrs.cx, 1) : 1;
  const sy = num(chExt.attrs.cy, 0) ? frame.cy / num(chExt.attrs.cy, 1) : 1;
  return (f) => outer({ x: frame.x + (f.x - cx0) * sx, y: frame.y + (f.y - cy0) * sy, cx: f.cx * sx, cy: f.cy * sy, rot: f.rot + frame.rot });
}

// ---- Placeholders and text styles ---------------------------------------------

interface Placeholder {
  type: string;
  idx?: string;
}

function placeholderOf(shape: XNode): Placeholder | undefined {
  const nv = kid(shape, 'p:nvSpPr') ?? kid(shape, 'p:nvPicPr') ?? kid(shape, 'p:nvGraphicFramePr');
  const ph = path(nv, 'p:nvPr', 'p:ph');
  return ph ? { type: ph.attrs.type ?? 'obj', idx: ph.attrs.idx } : undefined;
}

const masterType = (type: string): string => (type === 'ctrTitle' ? 'title' : type === 'subTitle' || type === 'obj' ? 'body' : type);

/** The layout or master shape a placeholder takes its position and style from. */
function matchPlaceholder(part: Part | undefined, ph: Placeholder, byTypeOnly: boolean): XNode | undefined {
  const tree = path(part?.root, 'p:cSld', 'p:spTree');
  const shapes = shapesOf(tree).filter((s) => placeholderOf(s));
  if (!byTypeOnly && ph.idx !== undefined) {
    const byIdx = shapes.find((s) => placeholderOf(s)!.idx === ph.idx);
    if (byIdx) return byIdx;
  }
  const want = byTypeOnly ? masterType(ph.type) : ph.type;
  return shapes.find((s) => (byTypeOnly ? masterType(placeholderOf(s)!.type) : placeholderOf(s)!.type) === want);
}

interface Context {
  file: PptxFile;
  slide: Part;
  layout?: Part;
  master?: Part;
  /** presentation.xml's default text style, for text boxes that aren't placeholders. */
  defaultTextStyle?: XNode;
  scale: number;
  opts: PptxOptions;
  report: PptxReport;
  skip: (what: string) => void;
}

/** A source of text properties and the part its colours resolve in. */
type StyleSource = { node: XNode | undefined; part: Part };

function levelProps(list: XNode | undefined, level: number): XNode | undefined {
  return kid(list, `a:lvl${level + 1}pPr`);
}

// ---- Converting a shape ------------------------------------------------------------

interface TextBox {
  text: string;
  style: RtfStyle;
  anchor: 't' | 'ctr' | 'b';
  box: Box;
  placeholder?: string;
}

function convertShapes(
  shapes: XNode[],
  part: Part,
  ctx: Context,
  transform: Transform,
  out: { elements: Slide_Element[]; texts: TextBox[] },
  onlyDecoration: boolean
): void {
  const { file, scale } = ctx;
  const box = (f: Frame): Box => ({ x: f.x * scale, y: f.y * scale, width: f.cx * scale, height: f.cy * scale });

  for (const shape of shapes) {
    if (shape.tag === 'p:grpSp') {
      convertShapes(shapesOf(shape).filter((c) => c.tag !== 'p:nvGrpSpPr' && c.tag !== 'p:grpSpPr'), part, ctx, groupTransform(kid(shape, 'p:grpSpPr'), transform), out, onlyDecoration);
      continue;
    }
    const ph = placeholderOf(shape);
    // Placeholders on layouts and masters are empty frames ("Click to add title"); only slides fill them in.
    if (onlyDecoration && ph) continue;
    const name = path(shape, shape.tag === 'p:pic' ? 'p:nvPicPr' : 'p:nvSpPr', 'p:cNvPr')?.attrs.name ?? '';

    if (shape.tag === 'p:graphicFrame') {
      const uri = path(shape, 'a:graphic', 'a:graphicData')?.attrs.uri ?? '';
      if (!onlyDecoration) ctx.skip(uri.endsWith('/table') ? 'tables' : uri.includes('chart') ? 'charts' : uri.includes('diagram') ? 'SmartArt graphics' : 'embedded objects');
      continue;
    }
    if (shape.tag === 'p:cxnSp') {
      if (!onlyDecoration) ctx.skip('lines and connectors');
      continue;
    }
    if (shape.tag !== 'p:sp' && shape.tag !== 'p:pic') continue;

    // Where it sits: its own frame, or the placeholder's on the layout, then the master.
    const layoutShape = ph && part === ctx.slide ? matchPlaceholder(ctx.layout, ph, false) : undefined;
    const masterShape = ph && part !== ctx.master ? matchPlaceholder(ctx.master, layoutShape ? (placeholderOf(layoutShape) ?? ph) : ph, true) : undefined;
    const spPr = kid(shape, 'p:spPr');
    const frame = frameOf(kid(spPr, 'a:xfrm')) ?? frameOf(path(layoutShape, 'p:spPr', 'a:xfrm')) ?? frameOf(path(masterShape, 'p:spPr', 'a:xfrm'));
    if (!frame || frame.cx <= 0 || frame.cy <= 0) continue;
    const at = transform(frame);
    const b = box(at);
    const rotate = (el: Slide_Element): Slide_Element => {
      if (el.element && at.rot) el.element.rotation = at.rot;
      return el;
    };

    if (shape.tag === 'p:pic') {
      const nvPr = path(shape, 'p:nvPicPr', 'p:nvPr');
      if (kid(nvPr, 'a:videoFile') || kid(nvPr, 'a:audioFile') || kid(nvPr, 'a:quickTimeFile')) {
        ctx.skip(kid(nvPr, 'a:audioFile') ? 'audio clips' : 'videos');
        continue;
      }
      const fill = fillIn(shape, part, file);
      const element = fill?.kind === 'image' ? pictureElement(fill.zipPath, b, 'stretch', name, ctx) : null;
      if (element) out.elements.push(rotate(element));
      continue;
    }

    // A shape: its fill (direct, or from the theme's shape style), then its text.
    let fill = fillIn(spPr, part, file);
    if (!fill && !ph) {
      const fillRef = path(shape, 'p:style', 'a:fillRef');
      const color = num(fillRef?.attrs.idx, 0) > 0 ? colorIn(fillRef, part) : undefined;
      if (color) fill = { kind: 'color', color };
    }
    const prst = path(spPr, 'a:prstGeom')?.attrs.prst ?? 'rect';
    if (fill?.kind === 'color' && fill.color.a > 0) out.elements.push(rotate(shapeElement(b, toColor(fill.color), prst === 'ellipse' ? 'ellipse' : 'rectangle', name || 'Shape')));
    else if (fill?.kind === 'image') {
      const element = pictureElement(fill.zipPath, b, 'fill', name, ctx);
      if (element) out.elements.push(rotate(element));
    }

    const text = textBoxOf(shape, part, ctx, ph, layoutShape, masterShape, b);
    if (!text) continue;
    if (ph && ['sldNum', 'dt', 'ftr', 'hdr'].includes(ph.type)) {
      // Slide numbers, dates and footers are PowerPoint's own fields; leave them off.
      continue;
    }
    out.texts.push(text);
    const element = textElement(plainTextToRtf(text.text, text.style), text.box, name || 'Text');
    if (element.element?.text) {
      element.element.text.verticalAlignment =
        text.anchor === 'ctr' ? Graphics_Text_VerticalAlignment.MIDDLE : text.anchor === 'b' ? Graphics_Text_VerticalAlignment.BOTTOM : Graphics_Text_VerticalAlignment.TOP;
    }
    out.elements.push(rotate(element));
  }
}

function pictureElement(zipPath: string, b: Box, scale: 'stretch' | 'fill', name: string, ctx: Context): Slide_Element | null {
  // Lyrics only: pictures aren't wanted, so nothing is saved.
  if (ctx.opts.look === 'lyrics') return null;
  const ext = zipPath.split('.').pop()?.toLowerCase() ?? '';
  if (mediaKindOf(zipPath) !== 'image') {
    ctx.skip(`${ext.toUpperCase() || 'unknown'} pictures`);
    return null;
  }
  const data = ctx.file.files.get(zipPath);
  const saved = data && ctx.opts.saveMedia ? ctx.opts.saveMedia(zipPath, data) : null;
  if (!saved) return null;
  ctx.report.pictures++;
  return imageElement(saved, b, scale, name || undefined);
}

function textBoxOf(shape: XNode, part: Part, ctx: Context, ph: Placeholder | undefined, layoutShape: XNode | undefined, masterShape: XNode | undefined, b: Box): TextBox | null {
  const body = kid(shape, 'p:txBody');
  if (!body) return null;
  const master = ctx.master;
  const styles: StyleSource[] = [
    { node: kid(body, 'a:lstStyle'), part },
    { node: path(layoutShape, 'p:txBody', 'a:lstStyle'), part: ctx.layout ?? part },
    { node: path(masterShape, 'p:txBody', 'a:lstStyle'), part: master ?? part }
  ];
  if (ph && master) {
    const t = masterType(ph.type);
    const txStyles = path(master.root, 'p:txStyles');
    styles.push({ node: kid(txStyles, t === 'title' ? 'p:titleStyle' : t === 'body' ? 'p:bodyStyle' : 'p:otherStyle'), part: master });
  } else if (ctx.defaultTextStyle) styles.push({ node: ctx.defaultTextStyle, part: master ?? part });

  const lines: string[] = [];
  let first: { rPr?: XNode; level: number; pPr?: XNode } | undefined;
  for (const p of kids(body, 'a:p')) {
    const pPr = kid(p, 'a:pPr');
    const level = num(pPr?.attrs.lvl, 0);
    let line = '';
    for (const r of p.children) {
      if (r.tag === 'a:r' || r.tag === 'a:fld') {
        const t = kid(r, 'a:t');
        let s = t ? textOf(t) : '';
        const rPr = kid(r, 'a:rPr');
        if (rPr?.attrs.cap === 'all' || (!rPr?.attrs.cap && styleValue(styles, level, (n) => n.attrs.cap) === 'all')) s = s.toUpperCase();
        if (s.trim() && !first) first = { rPr, level, pPr };
        line += s;
      } else if (r.tag === 'a:br') line += '\n';
    }
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  const text = lines.join('\n').replace(/\u000b/g, '\n');
  if (!text.trim() || !first) return null;

  // Style of the first run, falling back through the list styles.
  const own = (attr: string): string | undefined => first!.rPr?.attrs[attr];
  const inherited = (attr: string): string | undefined => styleValue(styles, first!.level, (n) => n.attrs[attr]);
  const autofit = path(body, 'a:bodyPr', 'a:normAutofit');
  const fontScale = num(autofit?.attrs.fontScale, 100000) / 100000;
  const sz = num(own('sz') ?? inherited('sz'), ph && masterType(ph.type) === 'title' ? 4400 : 1800) / 100;

  const runColor = first.rPr ? colorIn(kid(first.rPr, 'a:solidFill'), part) : undefined;
  let color = runColor;
  if (!color) {
    for (const s of styles) {
      const def = kid(levelProps(s.node, first.level), 'a:defRPr');
      color = colorIn(kid(def, 'a:solidFill'), s.part);
      if (color) break;
    }
  }
  // Text in a drawn shape (not a placeholder) defaults to the shape style's font colour.
  if (!color && !ph) color = colorIn(path(shape, 'p:style', 'a:fontRef'), part);
  color ??= ctx.slide.theme.colors.get(ctx.slide.clrMap.tx1 ?? 'dk1') ?? { r: 0, g: 0, b: 0, a: 1 };

  const latin = kid(first.rPr, 'a:latin')?.attrs.typeface ?? styleValue(styles, first.level, (n) => kid(n, 'a:latin')?.attrs.typeface);
  const theme = ctx.slide.theme;
  const font = !latin || latin === '+mn-lt' ? theme.minorFont : latin === '+mj-lt' ? theme.majorFont : latin;
  const algn = first.pPr?.attrs.algn ?? styleParagraph(styles, first.level, 'algn');
  const truthy = (v: string | undefined): boolean => v === '1' || v === 'true';

  const bodyPr = [kid(body, 'a:bodyPr'), path(layoutShape, 'p:txBody', 'a:bodyPr'), path(masterShape, 'p:txBody', 'a:bodyPr')];
  const bodyAttr = (attr: string): string | undefined => bodyPr.find((n) => n?.attrs[attr] !== undefined)?.attrs[attr];
  const anchor = (bodyAttr('anchor') ?? 't') as 't' | 'ctr' | 'b';
  const inset = (attr: string, fallback: number): number => num(bodyAttr(attr), fallback) * ctx.scale;
  const l = inset('lIns', 91440);
  const r = inset('rIns', 91440);
  const t = inset('tIns', 45720);
  const bt = inset('bIns', 45720);
  const inner: Box = { x: b.x + l, y: b.y + t, width: Math.max(1, b.width - l - r), height: Math.max(1, b.height - t - bt) };

  return {
    text,
    anchor: anchor === 'ctr' || anchor === 'b' ? anchor : 't',
    box: inner,
    placeholder: ph?.type,
    style: {
      font,
      sizePt: Math.round(sz * fontScale * EMU_PER_PT * ctx.scale * 10) / 10,
      color: [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)],
      align: algn === 'ctr' || algn === 'dist' ? 'center' : algn === 'r' ? 'right' : 'left',
      ...(truthy(own('b') ?? inherited('b')) ? { bold: true } : {}),
      ...(truthy(own('i') ?? inherited('i')) ? { italic: true } : {})
    }
  };
}

/** A run property from the first list style that sets it (a:lvlNpPr/a:defRPr). */
function styleValue(styles: StyleSource[], level: number, get: (defRPr: XNode) => string | undefined): string | undefined {
  for (const s of styles) {
    const def = kid(levelProps(s.node, level), 'a:defRPr');
    const v = def && get(def);
    if (v !== undefined) return v;
  }
  return undefined;
}

function styleParagraph(styles: StyleSource[], level: number, attr: string): string | undefined {
  for (const s of styles) {
    const v = levelProps(s.node, level)?.attrs[attr];
    if (v !== undefined) return v;
  }
  return undefined;
}

// ---- Backgrounds -------------------------------------------------------------------

function backgroundOf(part: Part, file: PptxFile): Fill | undefined {
  const bg = path(part.root, 'p:cSld', 'p:bg');
  if (!bg) return undefined;
  const direct = fillIn(kid(bg, 'p:bgPr'), part, file);
  if (direct) return direct;
  const ref = kid(bg, 'p:bgRef');
  const color = ref ? colorIn(ref, part) : undefined;
  return color ? { kind: 'color', color } : undefined;
}

// ---- The whole file ------------------------------------------------------------------

/** The speaker notes for a slide: the notes page's body text, as plain lines. */
function speakerNotes(file: PptxFile, slidePath: string): string {
  const notesPath = file.rels(slidePath).ofType('/notesSlide');
  const root = notesPath ? file.xml(notesPath) : null;
  if (!root) return '';
  const lines: string[] = [];
  for (const shape of shapesOf(path(root, 'p:cSld', 'p:spTree'))) {
    // The notes are in the body placeholder; the others hold the slide picture and the page number.
    if (placeholderOf(shape)?.type !== 'body') continue;
    for (const p of kids(kid(shape, 'p:txBody'), 'a:p')) {
      let line = '';
      for (const r of p.children) {
        if (r.tag === 'a:r' || r.tag === 'a:fld') line += kid(r, 'a:t') ? textOf(kid(r, 'a:t')!) : '';
        else if (r.tag === 'a:br') line += '\n';
      }
      lines.push(line);
    }
  }
  return lines.join('\n').replace(/\u000b/g, '\n').trim();
}

export function convertPptx(bytes: Uint8Array, name: string, opts: PptxOptions): { presentation: Presentation; report: PptxReport } {
  const file = new PptxFile(zipFiles(bytes));
  const presPath = 'ppt/presentation.xml';
  const pres = file.xml(presPath);
  if (!pres) throw new Error('This file has no PowerPoint presentation inside. Is it a .pptx?');
  const presRels = file.rels(presPath);
  const size = kid(pres, 'p:sldSz');
  const cx = num(size?.attrs.cx, 12192000);
  const cy = num(size?.attrs.cy, 6858000);
  const scale = WIDTH / cx;
  const slideSize = { width: WIDTH, height: Math.round(cy * scale) };

  // PowerPoint sections ("Verse", "Chorus", or one per song) become groups.
  const sectionOf = new Map<string, string>();
  for (const ext of kids(kid(pres, 'p:extLst'), 'p:ext')) {
    for (const section of kids(kid(ext, 'p14:sectionLst'), 'p14:section')) {
      for (const id of kids(kid(section, 'p14:sldIdLst'), 'p14:sldId')) sectionOf.set(id.attrs.id, section.attrs.name ?? '');
    }
  }

  const report: PptxReport = { slides: 0, groups: 0, pictures: 0, hiddenSlides: 0, notes: 0, skipped: {} };
  const skip = (what: string): void => {
    report.skipped[what] = (report.skipped[what] ?? 0) + 1;
  };
  const partCache = new Map<string, Part>();
  const partOf = (p: string, inherit?: Part): Part | undefined => {
    if (partCache.has(p)) return partCache.get(p);
    const root = file.xml(p);
    if (!root) return undefined;
    const rels = file.rels(p);
    const themePath = rels.ofType('/theme');
    const theme = themePath ? file.theme(themePath) : (inherit?.theme ?? file.theme(undefined));
    const own = kid(root, 'p:clrMap')?.attrs;
    const override = path(root, 'p:clrMapOvr', 'a:overrideClrMapping')?.attrs;
    const clrMap = { ...(inherit?.clrMap ?? {}), ...(own ?? {}), ...(override ?? {}) };
    const part = { path: p, root, theme, clrMap };
    partCache.set(p, part);
    return part;
  };

  const slides: Array<{ cue: Cue; section: string; texts: TextBox[] }> = [];
  for (const id of kids(kid(pres, 'p:sldIdLst'), 'p:sldId')) {
    const slidePath = presRels.byId.get(id.attrs['r:id'] ?? '');
    if (!slidePath) continue;
    const layoutPath = file.rels(slidePath).ofType('/slideLayout');
    const masterPath = layoutPath ? file.rels(layoutPath).ofType('/slideMaster') : undefined;
    const master = masterPath ? partOf(masterPath) : undefined;
    const layout = layoutPath ? partOf(layoutPath, master) : undefined;
    const slideRoot = file.xml(slidePath);
    if (!slideRoot) continue;
    const slide: Part = { path: slidePath, root: slideRoot, theme: (layout ?? master)?.theme ?? file.theme(undefined), clrMap: { ...(layout ?? master)?.clrMap, ...path(slideRoot, 'p:clrMapOvr', 'a:overrideClrMapping')?.attrs } };
    if (!Object.keys(slide.clrMap).length) Object.assign(slide.clrMap, { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' });

    const ctx: Context = { file, slide, layout, master, defaultTextStyle: kid(pres, 'p:defaultTextStyle'), scale, opts, report, skip };
    const out = { elements: [] as Slide_Element[], texts: [] as TextBox[] };
    // Hidden slides are skipped in a PowerPoint show, so they're left out here too.
    if (slideRoot.attrs.show === '0' || slideRoot.attrs.show === 'false') {
      report.hiddenSlides++;
      continue;
    }

    if (opts.look === 'slides') {
      const bg = backgroundOf(slide, file) ?? (layout && backgroundOf(layout, file)) ?? (master && backgroundOf(master, file)) ?? { kind: 'color', color: { r: 1, g: 1, b: 1, a: 1 } };
      const full: Box = { x: 0, y: 0, width: slideSize.width, height: slideSize.height };
      if (bg.kind === 'color') out.elements.push(shapeElement(full, toColor(bg.color), 'rectangle', 'Background'));
      else if (bg.kind === 'image') {
        const element = pictureElement(bg.zipPath, full, 'fill', 'Background', ctx);
        if (element) out.elements.push(element);
      }
      // The master's and layout's own artwork (logos, bars), unless the slide or layout hides it.
      const showMaster = slideRoot.attrs.showMasterSp !== '0' && layout?.root.attrs.showMasterSp !== '0';
      if (master && showMaster) convertShapes(shapesOf(path(master.root, 'p:cSld', 'p:spTree')), master, ctx, identity, out, true);
      if (layout && slideRoot.attrs.showMasterSp !== '0') convertShapes(shapesOf(path(layout.root, 'p:cSld', 'p:spTree')), layout, ctx, identity, out, true);
    }
    convertShapes(shapesOf(path(slideRoot, 'p:cSld', 'p:spTree')), slide, ctx, identity, out, false);

    const cue = slideCue(out.elements, slideSize);
    const notes = speakerNotes(file, slidePath);
    if (notes) {
      writeCueNotes(cue, notes);
      report.notes++;
    }
    slides.push({ cue, section: sectionOf.get(id.attrs.id) ?? '', texts: out.texts });
  }

  if (opts.look === 'lyrics') return lyricsFromSlides(name, slides, opts, report);

  const presentation = createPresentation(name, []);
  let group: { name: string; cues: Cue[] } | undefined;
  const groups: Array<{ name: string; cues: Cue[] }> = [];
  for (const s of slides) {
    if (!group || group.name !== s.section) {
      group = { name: s.section, cues: [] };
      groups.push(group);
    }
    group.cues.push(s.cue);
  }
  for (const g of groups) {
    presentation.cues.push(...g.cues);
    presentation.cueGroups.push(newCueGroup(g.name, g.cues));
  }
  report.slides = slides.length;
  report.groups = groups.length;
  return { presentation, report };
}

/**
 * Words only. Text boxes are read top to bottom, left to right; a title that
 * repeats on most slides (the song's name) is taken as the name and left off.
 */
function lyricsFromSlides(
  name: string,
  slides: Array<{ texts: TextBox[] }>,
  opts: PptxOptions,
  report: PptxReport
): { presentation: Presentation; report: PptxReport } {
  const shown = slides.filter((s) => s.texts.length);
  const titleOf = (s: { texts: TextBox[] }): string | undefined => s.texts.find((t) => t.placeholder === 'title' || t.placeholder === 'ctrTitle')?.text.trim();
  const counts = new Map<string, number>();
  for (const s of shown) {
    const t = titleOf(s);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const [repeated, times] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const songTitle = repeated && times! >= 2 && times! >= shown.length / 2 ? repeated : undefined;

  const extracted: ReturnType<typeof extractStanzas> = { stanzas: [], ccli: {}, removedChordLines: 0 };
  for (const s of shown) {
    const boxes = s.texts.filter((t) => !(songTitle && t.text.trim() === songTitle)).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    // Each slide stays a slide: its lines never merge with the next slide's.
    const lines = boxes.flatMap((t) => t.text.split('\n')).filter((l) => l.trim());
    if (!lines.length) continue;
    const one = extractStanzas(lines.join('\n'), opts.lyrics);
    extracted.stanzas.push(...one.stanzas);
    Object.assign(extracted.ccli, one.ccli);
    extracted.removedChordLines += one.removedChordLines;
  }
  const { presentation, report: lyrics } = stanzasToPresentation(songTitle ?? name, extracted, opts.lyrics);
  return { presentation, report: { ...report, slides: lyrics.slides, groups: lyrics.groups, pictures: 0, notes: 0, lyrics } };
}
