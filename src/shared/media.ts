import type { BinKind, MediaKind, MediaLook } from './types';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'tif', 'tiff'];
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
  const pick = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : fallback);
  const look = { blur: pick(r.blur, 0), darken: pick(r.darken, 0), color: pick(r.color, 100) };
  return look.blur === 0 && look.darken === 0 && look.color === 100 ? null : look;
}

/**
 * The CSS filter for a look on media `height` pixels tall: blur up to 4% of
 * the height (so a thumbnail blurs like the screen), darken up to 90%.
 */
export function lookFilter(look: MediaLook, height: number): string {
  const parts: string[] = [];
  if (look.blur) parts.push(`blur(${((look.blur / 100) * 0.04 * height).toFixed(1)}px)`);
  if (look.darken) parts.push(`brightness(${(1 - (look.darken / 100) * 0.9).toFixed(3)})`);
  if (look.color !== 100) parts.push(`saturate(${(look.color / 100).toFixed(2)})`);
  return parts.join(' ');
}
