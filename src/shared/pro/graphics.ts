// Images and shapes on a slide. In ProPresenter 7 every slide element has a
// shape (path) and a fill: an image is an element filled with media, a shape is
// one filled with a colour, and a text box's fill is the bar behind its text.
import { create } from '@bufbuild/protobuf';
import type { Color } from '../gen/common_pb';
import { Graphics_Path_Shape_Type, Graphics_PathSchema, type Graphics_Element, type Graphics_Fill, type Graphics_Path } from '../gen/graphics_pb';
import { Slide_ElementSchema, type Slide_Element } from '../gen/presentation_pb';
import type { GraphicLayout, MediaScale } from '../types';
import { backgroundMedia, backgroundOfMedia } from './background';
import { newUuid, uuidOf } from './ids';

const to255 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
export const colorCss = (c: Color): string => `rgba(${to255(c.red)}, ${to255(c.green)}, ${to255(c.blue)}, ${+(c.alpha ?? 1).toFixed(3)})`;

/** The colour an element is filled with, when its fill is switched on and is a plain colour. */
export function fillColor(fill: Graphics_Fill | undefined): string | undefined {
  return fill?.enable && fill.FillType.case === 'color' ? colorCss(fill.FillType.value) : undefined;
}

const SHAPES: Partial<Record<Graphics_Path_Shape_Type, 'rectangle' | 'ellipse' | 'rounded'>> = {
  [Graphics_Path_Shape_Type.RECTANGLE]: 'rectangle',
  [Graphics_Path_Shape_Type.ELLIPSE]: 'ellipse',
  [Graphics_Path_Shape_Type.ROUNDED_RECTANGLE]: 'rounded'
};

/** Read a non-text element as a graphic; null for anything Vessel can't draw (yet). */
export function graphicOfElement(el: Graphics_Element, z: number): GraphicLayout | null {
  const base = {
    id: uuidOf(el.uuid),
    z,
    x: el.bounds?.origin?.x ?? 0,
    y: el.bounds?.origin?.y ?? 0,
    width: el.bounds?.size?.width ?? 0,
    height: el.bounds?.size?.height ?? 0,
    rotation: el.rotation || 0,
    opacity: el.opacity ?? 1
  };
  if (base.width <= 0 || base.height <= 0 || el.hidden) return null;
  const fill = el.fill;
  if (fill?.enable && fill.FillType.case === 'media') {
    const media = backgroundOfMedia(fill.FillType.value);
    return media?.kind === 'image' ? { ...base, kind: 'image', path: media.path, scale: media.scale } : null;
  }
  const shapeType = el.path?.shape?.type ?? Graphics_Path_Shape_Type.RECTANGLE;
  const shape = SHAPES[shapeType] ?? 'rectangle';
  const stroke = el.stroke?.enable && el.stroke.color && el.stroke.width > 0 ? { width: el.stroke.width, color: colorCss(el.stroke.color) } : null;
  const color = fillColor(fill) ?? null;
  if (!color && !stroke) return null;
  const additional = el.path?.shape?.AdditionalData;
  const roundness = additional?.case === 'roundedRectangle' ? additional.value.roundness : 0;
  return { ...base, kind: 'shape', shape, fill: color, stroke, roundness };
}

/** A closed rectangle path, as ProPresenter stores it (unit-square corner points). */
export function rectanglePath(): Graphics_Path {
  const corner = (x: number, y: number) => ({ point: { x, y }, q0: { x, y }, q1: { x, y }, curved: false });
  return create(Graphics_PathSchema, {
    closed: true,
    points: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
    shape: { type: Graphics_Path_Shape_Type.RECTANGLE }
  });
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A picture on the slide itself, filling `box`. */
export function imageElement(path: string, box: Box, scale: MediaScale = 'fit', name?: string): Slide_Element {
  return create(Slide_ElementSchema, {
    element: {
      uuid: newUuid(),
      name: name ?? path.split(/[\\/]/).pop() ?? 'Image',
      bounds: { origin: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } },
      opacity: 1,
      path: rectanglePath(),
      fill: { enable: true, FillType: { case: 'media', value: backgroundMedia({ path, kind: 'image', loop: false, scale }) } }
    }
  });
}

/** A filled rectangle or ellipse on the slide itself. */
export function shapeElement(box: Box, fill: Color, shape: 'rectangle' | 'ellipse' = 'rectangle', name = 'Shape'): Slide_Element {
  const path = rectanglePath();
  if (shape === 'ellipse') path.shape = { $typeName: 'vessel.format.Graphics.Path.Shape', type: Graphics_Path_Shape_Type.ELLIPSE, AdditionalData: { case: undefined } };
  return create(Slide_ElementSchema, {
    element: {
      uuid: newUuid(),
      name,
      bounds: { origin: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } },
      opacity: 1,
      path,
      fill: { enable: true, FillType: { case: 'color', value: fill } }
    }
  });
}

/** Where a picture goes on the slide, as a fraction-based preset. */
export type ImagePlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'centre' | 'full';

export const IMAGE_PLACEMENTS: Array<{ id: ImagePlacement; label: string }> = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'centre', label: 'Centre' },
  { id: 'full', label: 'Full slide' }
];

/** Bounds for a placement on a slide of the given size (corners are logo-sized). */
export function placementBox(placement: ImagePlacement, width: number, height: number): Box {
  const margin = Math.round(height * 0.05);
  const logo = { width: Math.round(width * 0.16), height: Math.round(height * 0.16) };
  switch (placement) {
    case 'top-left':
      return { x: margin, y: margin, ...logo };
    case 'top-right':
      return { x: width - margin - logo.width, y: margin, ...logo };
    case 'bottom-left':
      return { x: margin, y: height - margin - logo.height, ...logo };
    case 'bottom-right':
      return { x: width - margin - logo.width, y: height - margin - logo.height, ...logo };
    case 'centre':
      return { x: Math.round(width * 0.25), y: Math.round(height * 0.2), width: Math.round(width * 0.5), height: Math.round(height * 0.6) };
    case 'full':
      return { x: 0, y: 0, width, height };
  }
}

/** The placement whose box matches `g`, if it was placed with one. */
export function placementOf(g: Box, width: number, height: number): ImagePlacement | null {
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 2;
  return IMAGE_PLACEMENTS.find(({ id }) => {
    const b = placementBox(id, width, height);
    return near(b.x, g.x) && near(b.y, g.y) && near(b.width, g.width) && near(b.height, g.height);
  })?.id ?? null;
}
