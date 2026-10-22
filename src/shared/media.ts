import type { BinKind, MediaKind } from './types';

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
