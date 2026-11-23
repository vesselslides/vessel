// Vessel's own fonts: a folder (Documents/Vessel/Fonts) of fonts that every
// Vessel window can draw with, whether or not they're installed on the
// computer. Fonts come from inside PowerPoint files, free downloads (Google
// Fonts) or font files the church adds. Stand-ins for missing fonts ("draw
// Proxima Nova with Figtree on this computer") are kept here too.
import { app, webContents } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { mediaUrl } from '../shared/media';
import { freeFamilyOf } from '../shared/fontSuggestions';
import type { FontState, VesselFont } from '../shared/types';
import { log } from './log';

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];

const MIME: Record<string, string> = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };

export const fontsFolder = (): string => join(app.getPath('documents'), 'Vessel', 'Fonts');
const registryFile = (): string => join(fontsFolder(), 'fonts.json');

interface Registry {
  fonts: VesselFont[];
  substitutes: Record<string, string>;
}

let cached: Registry | null = null;

async function load(): Promise<Registry> {
  if (cached) return cached;
  try {
    const raw = JSON.parse(await readFile(registryFile(), 'utf8')) as Partial<Registry>;
    cached = {
      fonts: Array.isArray(raw.fonts) ? raw.fonts.filter((f) => f && typeof f.family === 'string' && typeof f.file === 'string') : [],
      substitutes: raw.substitutes && typeof raw.substitutes === 'object' ? raw.substitutes : {}
    };
  } catch {
    cached = { fonts: [], substitutes: {} };
  }
  return cached;
}

async function save(r: Registry): Promise<void> {
  cached = r;
  await mkdir(fontsFolder(), { recursive: true });
  await writeFile(registryFile(), JSON.stringify(r, null, 2));
  broadcast();
}

/** Whether `path` is a font file inside Vessel's fonts folder (the only fonts the windows may load). */
export function isVesselFontFile(path: string): boolean {
  const folder = fontsFolder();
  return (path.startsWith(folder + '/') || path.startsWith(folder + '\\')) && FONT_EXTENSIONS.includes(extname(path).slice(1).toLowerCase());
}

export const fontMime = (path: string): string => MIME[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream';

export async function fontState(): Promise<FontState> {
  const r = await load();
  const folder = fontsFolder();
  return {
    fonts: r.fonts.filter((f) => existsSync(join(folder, f.file))).map((f) => ({ ...f, url: mediaUrl(join(folder, f.file)) })),
    substitutes: r.substitutes
  };
}

/** Tell every window the fonts changed, so they draw with them straight away. */
function broadcast(): void {
  void fontState().then((state) => {
    for (const wc of webContents.getAllWebContents()) if (!wc.isDestroyed()) wc.send('fonts:changed', state);
  });
}

const safe = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 60) || 'Font';

/**
 * Keep a font's bytes in the fonts folder for `family`. The same bytes for the
 * same family and face are kept once.
 */
export async function addFontBytes(
  family: string,
  bytes: Uint8Array,
  ext: string,
  meta: { source: VesselFont['source']; weight?: number; italic?: boolean; from?: string }
): Promise<VesselFont> {
  const r = await load();
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  const known = r.fonts.find((f) => f.family.toLowerCase() === family.toLowerCase() && f.file.includes(hash));
  if (known) return known;
  const file = `${safe(family)}${meta.weight ? `-${meta.weight}` : ''}${meta.italic ? '-italic' : ''}-${hash}.${ext.toLowerCase()}`;
  await mkdir(fontsFolder(), { recursive: true });
  await writeFile(join(fontsFolder(), file), bytes);
  const font: VesselFont = {
    id: hash + (meta.weight ?? '') + (meta.italic ? 'i' : ''),
    family,
    file,
    source: meta.source,
    ...(meta.weight ? { weight: meta.weight } : {}),
    ...(meta.italic ? { italic: true } : {}),
    ...(meta.from ? { from: meta.from } : {})
  };
  await save({ ...r, fonts: [...r.fonts, font] });
  return font;
}

/** Copy font files the church owns into the fonts folder, for `family` (the name the slides use). */
export async function addFontFiles(family: string, paths: string[]): Promise<FontState> {
  for (const path of paths) {
    const ext = extname(path).slice(1).toLowerCase();
    if (!FONT_EXTENSIONS.includes(ext)) continue;
    // One file stands in for the whole family; several are told apart by weight words in their names.
    const weight = paths.length > 1 ? weightFromName(basename(path)) : undefined;
    await addFontBytes(family, new Uint8Array(await readFile(path)), ext, { source: 'file', weight, italic: /italic|oblique/i.test(basename(path)) || undefined });
  }
  return fontState();
}

function weightFromName(name: string): number | undefined {
  const n = name.toLowerCase();
  if (/thin|hairline/.test(n)) return 100;
  if (/extra-?light|ultra-?light/.test(n)) return 200;
  if (/light/.test(n)) return 300;
  if (/semi-?bold|demi-?bold/.test(n)) return 600;
  if (/extra-?bold|ultra-?bold/.test(n)) return 800;
  if (/black|heavy/.test(n)) return 900;
  if (/bold/.test(n)) return 700;
  if (/medium/.test(n)) return 500;
  return 400;
}

export async function removeFont(id: string): Promise<FontState> {
  const r = await load();
  const font = r.fonts.find((f) => f.id === id);
  if (font) {
    await rm(join(fontsFolder(), font.file), { force: true });
    await save({ ...r, fonts: r.fonts.filter((f) => f.id !== id) });
  }
  return fontState();
}

/** Draw `missing` with `use` on this computer (the song file is left as it is); null takes the stand-in away. */
export async function setSubstitute(missing: string, use: string | null): Promise<FontState> {
  const r = await load();
  const substitutes = { ...r.substitutes };
  const key = missing.trim().toLowerCase();
  if (use?.trim()) substitutes[key] = use.trim();
  else delete substitutes[key];
  await save({ ...r, substitutes });
  return fontState();
}

// ---- Free fonts (Google Fonts) ---------------------------------------------------

const GOOGLE_CSS = 'https://fonts.googleapis.com/css';
// Without a browser's name Google Fonts answers with TrueType files, which every window can load.
const AGENT = 'Vessel';
const free = new Map<string, boolean>();
/** A free (open-source) font file's address on Google Fonts. */
const FREE_FILE = /url\((https:\/\/fonts\.gstatic\.com\/s\/[^)]+)\)/;

const fontsQuery = (family: string): string =>
  `${GOOGLE_CSS}?family=${encodeURIComponent(family).replace(/%20/g, '+')}:100,200,300,400,500,600,700,800,900,100italic,200italic,300italic,400italic,500italic,600italic,700italic,800italic,900italic`;

async function googleCss(family: string): Promise<string | null> {
  try {
    const res = await fetch(fontsQuery(family), { headers: { 'User-Agent': AGENT } });
    return res.ok ? await res.text() : null;
  } catch (err) {
    log.warn(`Couldn't reach Google Fonts for ${family}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Whether a font is free to download (it's on Google Fonts). Asked once per family. */
export async function isFreeFont(name: string): Promise<boolean> {
  const family = freeFamilyOf(name);
  if (!family) return false;
  const key = family.toLowerCase();
  if (free.has(key)) return free.get(key)!;
  const css = await googleCss(family);
  // Open-source fonts come from fonts.gstatic.com/s/…; Google also serves fonts licensed only for
  // its own apps (Proxima Nova, from /l/…), which aren't free to use elsewhere.
  const yes = !!css && FREE_FILE.test(css);
  // A failed connection isn't remembered: it may work later.
  if (css !== null) free.set(key, yes);
  return yes;
}

/** Download a free font's every weight into the fonts folder, for the name the slides use. */
export async function downloadFreeFont(name: string): Promise<FontState> {
  const family = freeFamilyOf(name);
  const css = await googleCss(family);
  if (!css || !FREE_FILE.test(css)) throw new Error(`“${family}” isn’t a free font Vessel can download.`);
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
  let added = 0;
  // The face the slides' own name asks for ("Montserrat SemiBold" is the 600 weight).
  const wantWeight = weightFromName(name) ?? 400;
  const wantItalic = /italic|oblique/i.test(name);
  let alias: { bytes: Uint8Array; ext: string } | null = null;
  for (const face of faces) {
    const url = FREE_FILE.exec(face)?.[1];
    if (!url) continue;
    const weight = Number(/font-weight:\s*(\d+)/.exec(face)?.[1]) || 400;
    const italic = /font-style:\s*italic/.test(face);
    const res = await fetch(url);
    if (!res.ok) continue;
    const ext = /\.(ttf|otf|woff2?)(\?|$)/.exec(url)?.[1] ?? 'ttf';
    const bytes = new Uint8Array(await res.arrayBuffer());
    await addFontBytes(family, bytes, ext, { source: 'download', weight, italic });
    if (weight === wantWeight && italic === wantItalic) alias = { bytes, ext };
    added++;
  }
  // Slides that name the face ("Montserrat SemiBold") find it under that name too.
  if (alias && name.trim().toLowerCase() !== family.toLowerCase()) await addFontBytes(name.trim(), alias.bytes, alias.ext, { source: 'download' });
  if (!added) throw new Error(`Google Fonts sent no files for “${family}”.`);
  return fontState();
}

/** Fonts in the folder whose family is one of `families` (for Vessel files and playlist bundles). */
export async function fontsFor(families: string[]): Promise<Array<VesselFont & { path: string }>> {
  const wanted = new Set(families.flatMap((f) => [f.toLowerCase(), freeFamilyOf(f).toLowerCase()]));
  const r = await load();
  return r.fonts.filter((f) => wanted.has(f.family.toLowerCase()) && existsSync(join(fontsFolder(), f.file))).map((f) => ({ ...f, path: join(fontsFolder(), f.file) }));
}

/** Add a font that came in a Vessel file or bundle. */
export async function addSharedFont(font: Pick<VesselFont, 'family' | 'weight' | 'italic' | 'source' | 'from'>, path: string): Promise<void> {
  const ext = extname(path).slice(1).toLowerCase();
  if (!FONT_EXTENSIONS.includes(ext)) return;
  await addFontBytes(font.family, new Uint8Array(await readFile(path)), ext, { source: font.source, weight: font.weight, italic: font.italic, from: font.from });
}

/** For tests and Preferences: forget the cached registry. */
export function resetFontCache(): void {
  cached = null;
}
