// The stream output: a second picture for livestreaming software (OBS, vMix…),
// usually just the lyrics on a solid colour the software keys out.

/** Off, an ordinary window to capture, or full screen on a display (by id). */
export type StreamTarget = null | 'window' | number;

export interface StreamLook {
  /** The colour behind the words, for the streaming software to key out. */
  background: 'green' | 'blue' | 'black' | 'magenta';
  /** The slide as designed, or the words along the bottom (lower-third lyrics). */
  style: 'slide' | 'lower';
  /** Show background pictures and videos too, instead of the colour. */
  media: boolean;
  /** Show the lower third and messages. */
  overlays: boolean;
}

export const DEFAULT_STREAM_LOOK: StreamLook = { background: 'green', style: 'lower', media: false, overlays: true };

export const KEY_COLOURS: Record<StreamLook['background'], { label: string; css: string }> = {
  green: { label: 'Green (for chroma key)', css: '#00b140' },
  blue: { label: 'Blue (for chroma key)', css: '#0047bb' },
  magenta: { label: 'Magenta (for chroma key)', css: '#ff00ff' },
  black: { label: 'Black (for luma key, or as it is)', css: '#000000' }
};

export function normalizeStreamLook(raw: unknown): StreamLook {
  const r = raw && typeof raw === 'object' ? (raw as Partial<StreamLook>) : {};
  return {
    background: r.background && r.background in KEY_COLOURS ? r.background : DEFAULT_STREAM_LOOK.background,
    style: r.style === 'slide' ? 'slide' : 'lower',
    media: !!r.media,
    overlays: r.overlays !== false
  };
}

export function normalizeStreamTarget(raw: unknown): StreamTarget {
  return raw === 'window' || (typeof raw === 'number' && Number.isFinite(raw)) ? raw : null;
}
