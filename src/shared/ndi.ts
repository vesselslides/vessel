// NDI® output settings and status. NDI® is a registered trademark of Vizrt NDI AB.

export const NDI_SITE = 'https://ndi.video/tools/';

export interface NdiSettings {
  enabled: boolean;
  /** The source name receivers list (shown as "COMPUTER (name)"). */
  name: string;
  resolution: '1080p' | '720p';
  /** Send the words with a see-through background (no key colour needed). */
  transparent: boolean;
}

export const DEFAULT_NDI: NdiSettings = { enabled: false, name: 'Vessel Stream', resolution: '1080p', transparent: true };

export type NdiStatus =
  | { state: 'off' }
  | { state: 'unavailable'; message: string }
  | { state: 'error'; message: string }
  | { state: 'sending'; name: string; receivers: number; frames: number };

export const NDI_SIZES: Record<NdiSettings['resolution'], { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 }
};

export function normalizeNdi(raw: unknown): NdiSettings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<NdiSettings>) : {};
  const name = typeof r.name === 'string' ? r.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60) : '';
  return {
    enabled: !!r.enabled,
    name: name || DEFAULT_NDI.name,
    resolution: r.resolution === '720p' ? '720p' : '1080p',
    transparent: r.transparent !== false
  };
}
