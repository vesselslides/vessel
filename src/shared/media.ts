import type { BinKind, MediaKind, MediaLook } from './types';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'tif', 'tiff', 'svg'];
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aif', 'aiff'];

export function mediaKindOf(path: string): MediaKind | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return null;
}

/** What the media bin holds: pictures and videos (which can be backgrounds) and audio. */
export function binKindOf(path: string): BinKind | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.includes(ext) ? 'audio' : mediaKindOf(path);
}

/** URL the renderers use to load a local media file through the app's media protocol. */
export function mediaUrl(path: string): string {
  return `vessel-media://file/${encodeURIComponent(path)}`;
}

export function mediaName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export const PLAIN_LOOK: MediaLook = { blur: 0, darken: 0, color: 100 };

/** A look with every value in range, or null when it leaves the media as it is. */
export function normalizeLook(raw: unknown): MediaLook | null {
  const r = raw && typeof raw === 'object' ? (raw as Partial<MediaLook>) : {};
  const pick = (v: unknown, min: number, max: number, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback;
  const look: MediaLook = {
    blur: pick(r.blur, 0, 100, 0),
    darken: pick(r.darken, 0, 100, 0),
    color: pick(r.color, 0, 200, 100)
  };
  const extra: Array<[keyof MediaLook, number, number]> = [
    ['brightness', -100, 100],
    ['contrast', -100, 100],
    ['hue', -180, 180],
    ['warmth', -100, 100],
    ['vignette', 0, 100]
  ];
  for (const [key, min, max] of extra) {
    const v = pick(r[key], min, max, 0);
    if (v) look[key] = v;
  }
  return isPlainLook(look) ? null : look;
}

/** A look that changes nothing. */
export const isPlainLook = (l: MediaLook): boolean =>
  !l.blur && !l.darken && l.color === 100 && !l.brightness && !l.contrast && !l.hue && !l.warmth && !l.vignette;

/**
 * The CSS filter for a look on media `height` pixels tall: blur up to 4% of
 * the height (so a thumbnail blurs like the screen), darken up to 90%,
 * brightness and contrast up to twice (or down to nothing), and so on.
 * Warmth and the vignette are drawn over the picture (see lookOverlay).
 */
export function lookFilter(look: MediaLook, height: number): string {
  const parts: string[] = [];
  if (look.blur) parts.push(`blur(${((look.blur / 100) * 0.04 * height).toFixed(1)}px)`);
  const bright = (1 - (look.darken / 100) * 0.9) * (1 + (look.brightness ?? 0) / 100);
  if (bright !== 1) parts.push(`brightness(${bright.toFixed(3)})`);
  if (look.contrast) parts.push(`contrast(${(1 + look.contrast / 100).toFixed(3)})`);
  if (look.color !== 100) parts.push(`saturate(${(look.color / 100).toFixed(2)})`);
  if (look.hue) parts.push(`hue-rotate(${look.hue}deg)`);
  return parts.join(' ');
}

/** What's drawn over a picture for its look's warmth (an amber or blue wash) and vignette (dark corners), as a CSS background. */
export function lookOverlay(look: MediaLook | null | undefined): { background: string; mixBlendMode: 'soft-light' | 'normal' }[] {
  if (!look) return [];
  const out: { background: string; mixBlendMode: 'soft-light' | 'normal' }[] = [];
  if (look.warmth) {
    const a = Math.abs(look.warmth) / 100;
    out.push({
      background: look.warmth > 0 ? `rgba(255, 140, 20, ${(a * 0.7).toFixed(2)})` : `rgba(30, 110, 255, ${(a * 0.7).toFixed(2)})`,
      mixBlendMode: 'soft-light'
    });
  }
  if (look.vignette) {
    const a = (look.vignette / 100) * 0.85;
    out.push({
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${a.toFixed(2)}) 100%)`,
      mixBlendMode: 'normal'
    });
  }
  return out;
}

/** A slide's own look over the media bin's look for the file. */
export const lookFor = (own: MediaLook | null | undefined, shared: MediaLook | null | undefined): MediaLook | null => own ?? shared ?? null;
