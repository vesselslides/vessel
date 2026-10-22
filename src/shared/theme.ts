// Themes: a named text style and layout for lyric slides. Applying one writes
// it into the presentation (RTF, ProPresenter text attributes, shadow and text
// box bounds), so a saved .pro looks the same in ProPresenter.
import { create } from '@bufbuild/protobuf';
import { FontSchema } from './gen/graphics_pb';
import {
  Graphics_FillSchema,
  Graphics_ShadowSchema,
  Graphics_Text_Attributes_Alignment,
  Graphics_Text_Attributes_Capitalization,
  Graphics_Text_AttributesSchema,
  Graphics_Text_ScaleBehavior,
  Graphics_Text_VerticalAlignment,
  type Graphics_Text_Attributes
} from './gen/graphics_pb';
import type { Color } from './gen/common_pb';
import type { RtfStyle } from './pro/rtf';
import type { SlideLayout } from './types';

export interface Theme {
  id: string;
  name: string;
  builtIn?: boolean;
  /** Font family, e.g. "Helvetica Neue". */
  font: string;
  bold: boolean;
  italic: boolean;
  /** Size on a 1080-pixel-high slide; scaled for other slide sizes. */
  sizePt: number;
  /** #rrggbb */
  color: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  /** Text box as fractions of the slide (0–1). */
  box: { x: number; y: number; width: number; height: number };
  uppercase: boolean;
  shadow: boolean;
  /** Outline width in slide pixels at 1080 high; 0 for none. */
  outlineWidth: number;
  outlineColor: string;
  /** A coloured bar filling the text box behind the lyrics (opacity 0–1); null for none. */
  bar?: { color: string; opacity: number } | null;
}

export const BUILT_IN_THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    builtIn: true,
    font: 'Helvetica Neue',
    bold: true,
    italic: false,
    sizePt: 84,
    color: '#ffffff',
    align: 'center',
    valign: 'middle',
    box: { x: 0.05, y: 0.08, width: 0.9, height: 0.84 },
    uppercase: false,
    shadow: true,
    outlineWidth: 0,
    outlineColor: '#000000'
  },
  {
    id: 'lower-third',
    name: 'Lower third',
    builtIn: true,
    font: 'Helvetica Neue',
    bold: true,
    italic: false,
    sizePt: 60,
    color: '#ffffff',
    align: 'center',
    valign: 'bottom',
    box: { x: 0, y: 0.7, width: 1, height: 0.26 },
    uppercase: false,
    shadow: false,
    outlineWidth: 0,
    outlineColor: '#000000',
    bar: { color: '#000000', opacity: 0.6 }
  },
  {
    id: 'bold-caps',
    name: 'Bold caps',
    builtIn: true,
    font: 'Avenir Next',
    bold: true,
    italic: false,
    sizePt: 96,
    color: '#ffffff',
    align: 'center',
    valign: 'middle',
    box: { x: 0.06, y: 0.1, width: 0.88, height: 0.8 },
    uppercase: true,
    shadow: true,
    outlineWidth: 0,
    outlineColor: '#000000'
  },
  {
    id: 'scripture',
    name: 'Scripture',
    builtIn: true,
    font: 'Georgia',
    bold: false,
    italic: false,
    sizePt: 64,
    color: '#f5f1e8',
    align: 'left',
    valign: 'top',
    box: { x: 0.08, y: 0.1, width: 0.84, height: 0.8 },
    uppercase: false,
    shadow: true,
    outlineWidth: 0,
    outlineColor: '#000000'
  },
  {
    id: 'outline',
    name: 'Outline',
    builtIn: true,
    font: 'Arial Black',
    bold: false,
    italic: false,
    sizePt: 84,
    color: '#ffffff',
    align: 'center',
    valign: 'middle',
    box: { x: 0.05, y: 0.08, width: 0.9, height: 0.84 },
    uppercase: false,
    shadow: false,
    outlineWidth: 4,
    outlineColor: '#000000'
  }
];

export const DEFAULT_THEME_ID = 'classic';

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hexToProColor = (hex: string): Color => {
  const [r, g, b] = hexToRgb(hex);
  return { $typeName: 'vessel.format.Color', red: r / 255, green: g / 255, blue: b / 255, alpha: 1 };
};

/** Scale factor from the theme's 1080-high reference to a slide of `height`. */
const scaleFor = (height: number): number => height / 1080;

export function themeRtfStyle(theme: Theme, slideHeight: number): RtfStyle {
  return {
    font: theme.font,
    sizePt: Math.round(theme.sizePt * scaleFor(slideHeight) * 10) / 10,
    color: hexToRgb(theme.color),
    align: theme.align,
    ...(theme.bold ? { bold: true } : {}),
    ...(theme.italic ? { italic: true } : {})
  };
}

const ALIGN: Record<Theme['align'], Graphics_Text_Attributes_Alignment> = {
  left: Graphics_Text_Attributes_Alignment.LEFT,
  center: Graphics_Text_Attributes_Alignment.CENTER,
  right: Graphics_Text_Attributes_Alignment.RIGHT
};

const VALIGN: Record<Theme['valign'], Graphics_Text_VerticalAlignment> = {
  top: Graphics_Text_VerticalAlignment.TOP,
  middle: Graphics_Text_VerticalAlignment.MIDDLE,
  bottom: Graphics_Text_VerticalAlignment.BOTTOM
};

/** ProPresenter's text-box defaults for the theme. */
export function themeAttributes(theme: Theme, slideHeight: number): Graphics_Text_Attributes {
  const style = themeRtfStyle(theme, slideHeight);
  return create(Graphics_Text_AttributesSchema, {
    font: create(FontSchema, { name: theme.font, family: theme.font, size: style.sizePt, bold: theme.bold, italic: theme.italic }),
    capitalization: theme.uppercase ? Graphics_Text_Attributes_Capitalization.ALL_CAPS : Graphics_Text_Attributes_Capitalization.NONE,
    fill: { case: 'textSolidFill', value: hexToProColor(theme.color) },
    paragraphStyle: { alignment: ALIGN[theme.align] },
    strokeWidth: theme.outlineWidth > 0 ? theme.outlineWidth * scaleFor(slideHeight) : 0,
    strokeColor: theme.outlineWidth > 0 ? hexToProColor(theme.outlineColor) : undefined
  });
}

export const themeShadow = (theme: Theme) =>
  create(Graphics_ShadowSchema, {
    enable: theme.shadow,
    angle: 315,
    offset: 4,
    radius: 8,
    opacity: 0.75,
    color: { $typeName: 'vessel.format.Color', red: 0, green: 0, blue: 0, alpha: 1 }
  });

/** The bar's colour as CSS, and as a ProPresenter colour. */
export const barCss = (bar: { color: string; opacity: number }): string => {
  const [r, g, b] = hexToRgb(bar.color);
  return `rgba(${r}, ${g}, ${b}, ${bar.opacity})`;
};

export function themeFill(theme: Theme) {
  const bar = theme.bar;
  return create(Graphics_FillSchema, bar ? { enable: true, FillType: { case: 'color', value: { ...hexToProColor(bar.color), alpha: bar.opacity } } } : { enable: false });
}

export const themeVerticalAlignment = (theme: Theme): Graphics_Text_VerticalAlignment => VALIGN[theme.valign];
export const THEME_SCALE_BEHAVIOR = Graphics_Text_ScaleBehavior.SCALE_FONT_DOWN;

/** Custom themes and the default for new songs, as saved in themes.json. */
export interface ThemeLibrary {
  custom: Theme[];
  defaultId: string;
}

export const EMPTY_THEME_LIBRARY: ThemeLibrary = { custom: [], defaultId: DEFAULT_THEME_ID };

export const allThemes = (lib: ThemeLibrary): Theme[] => [...BUILT_IN_THEMES, ...lib.custom];

export const findTheme = (lib: ThemeLibrary, id: string): Theme => allThemes(lib).find((t) => t.id === id) ?? BUILT_IN_THEMES[0];

/** A one-box slide layout showing `text` in the theme, for previews. */
export function themeLayout(theme: Theme, text: string, width = 1920, height = 1080): SlideLayout {
  const s = height / 1080;
  return {
    width,
    height,
    boxes: [
      {
        x: theme.box.x * width,
        y: theme.box.y * height,
        width: theme.box.width * width,
        height: theme.box.height * height,
        text,
        font: theme.font,
        bold: theme.bold,
        italic: theme.italic,
        sizePt: theme.sizePt * s,
        color: theme.color,
        align: theme.align,
        valign: theme.valign,
        uppercase: theme.uppercase,
        shadow: theme.shadow,
        outline: theme.outlineWidth > 0 ? { width: theme.outlineWidth * s, color: theme.outlineColor } : null,
        shrink: true,
        z: 0,
        fill: theme.bar ? barCss(theme.bar) : undefined
      }
    ],
    graphics: []
  };
}

/** A fresh custom theme based on another. */
export function duplicateTheme(theme: Theme, name = `${theme.name} copy`): Theme {
  const { builtIn: _builtIn, ...rest } = theme;
  return { ...rest, box: { ...theme.box }, bar: theme.bar ? { ...theme.bar } : null, id: crypto.randomUUID(), name };
}
