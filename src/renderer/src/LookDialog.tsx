import { useState } from 'react';
import type { Presentation } from '../../shared/gen/presentation_pb';
import { backgroundForPath } from '../../shared/pro/background';
import { setSlideBackgroundLook, setSlidePictureLook } from '../../shared/pro/edit';
import { mediaName, normalizeLook, PLAIN_LOOK } from '../../shared/media';
import type { Background, MediaItem, MediaLook, SlideView } from '../../shared/types';
import { MediaView } from './AudienceView';

/** Where a look is kept: on the file (wherever it's used), or on the chosen slides only. */
export type LookScope = 'everywhere' | 'slides';

interface Slider {
  key: keyof MediaLook;
  label: string;
  hint: string;
  min: number;
  max: number;
  /** The value shown for the stored one (colour is stored 0–200, shown −100…100). */
  show?: (v: number) => number;
  store?: (v: number) => number;
  unit?: string;
}

const SLIDERS: Slider[] = [
  {
    key: 'brightness',
    label: 'Brightness',
    hint: 'Lighter or darker',
    min: -100,
    max: 100
  },
  {
    key: 'contrast',
    label: 'Contrast',
    hint: 'More or less difference between light and dark',
    min: -100,
    max: 100
  },
  {
    key: 'color',
    label: 'Saturation',
    hint: 'Less colour, down to black and white, or more',
    min: -100,
    max: 100,
    show: (v) => v - 100,
    store: (v) => v + 100
  },
  {
    key: 'hue',
    label: 'Hue',
    hint: 'Turn every colour around the colour wheel',
    min: -180,
    max: 180,
    unit: '°'
  },
  {
    key: 'warmth',
    label: 'Warmth',
    hint: 'Warmer (amber) or cooler (blue)',
    min: -100,
    max: 100
  },
  {
    key: 'blur',
    label: 'Blur',
    hint: 'Soften it so the words stand out',
    min: 0,
    max: 100
  },
  {
    key: 'darken',
    label: 'Darken',
    hint: 'Dim it behind light words',
    min: 0,
    max: 100
  },
  {
    key: 'vignette',
    label: 'Vignette',
    hint: 'Darker corners, to draw the eye in',
    min: 0,
    max: 100
  }
];

/**
 * Adjust a picture or video: brightness, contrast, saturation, hue, warmth,
 * blur, darken and vignette. From the media bin it's kept on the file; from a
 * slide it can also be kept for the chosen slides only.
 */
export function LookDialog({
  name,
  bg,
  look: initial,
  slides,
  scope: initialScope = 'everywhere',
  everywhere = true,
  onSave,
  onCancel
}: {
  name: string;
  bg: Background | null;
  look: MediaLook | null | undefined;
  /** Opened from slides: how many, so it can be kept for them only. */
  slides?: number;
  scope?: LookScope;
  /** False when the file isn't in the media bin: then the look can only be kept on the slides. */
  everywhere?: boolean;
  onSave: (look: MediaLook | null, scope: LookScope) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [look, setLook] = useState<MediaLook>({
    ...PLAIN_LOOK,
    ...(initial ?? {})
  });
  const [scope, setScope] = useState<LookScope>(slides ? (everywhere ? initialScope : 'slides') : 'everywhere');
  const value = (s: Slider): number => {
    const v = look[s.key] ?? (s.key === 'color' ? 100 : 0);
    return s.show ? s.show(v) : v;
  };
  const slideLabel = slides === 1 ? 'This slide only' : `These ${slides} slides only`;
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal look-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Adjust look</h2>
        <p className="hint">
          {scope === 'everywhere'
            ? `“${name}” looks like this wherever it’s used: as a background or a picture, on the screens, the stream and every song.`
            : `“${name}” looks like this on ${slides === 1 ? 'this slide' : `these ${slides} slides`}; everywhere else it keeps the media bin’s look.`}
        </p>
        <div className="look-preview">
          {bg && <MediaView bg={{ ...bg, look: undefined }} muted thumbnail look={normalizeLook(look)} />}
          <span className="look-sample">Sample words</span>
        </div>
        <div className="look-sliders">
          {SLIDERS.map((s) => (
            <label key={s.key} className="look-slider" title={s.hint}>
              <span>{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={1}
                value={value(s)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLook({ ...look, [s.key]: s.store ? s.store(v) : v });
                }}
                onDoubleClick={() => setLook({ ...look, [s.key]: s.key === 'color' ? 100 : 0 })}
              />
              <span className="look-value">
                {value(s) > 0 && s.min < 0 ? '+' : ''}
                {value(s)}
                {s.unit ?? ''}
              </span>
            </label>
          ))}
        </div>
        <p className="hint look-tip">Double-click a slider to put it back.</p>
        {!!slides && (
          <div className="segmented small look-scope" role="group" aria-label="Where this look is used">
            {everywhere && (
              <button className={scope === 'everywhere' ? 'active' : ''} onClick={() => setScope('everywhere')}>
                Everywhere it’s used
              </button>
            )}
            <button className={scope === 'slides' ? 'active' : ''} onClick={() => setScope('slides')}>
              {slideLabel}
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={() => setLook(PLAIN_LOOK)} disabled={!normalizeLook(look)}>
            Reset
          </button>
          <span className="spacer" />
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onSave(normalizeLook(look), scope)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a slide's Adjust look is for: its background, or one picture on it, on these slides. */
export interface SlideLookTarget {
  kind: 'background' | 'picture';
  path: string;
  slides: SlideView[];
}

/**
 * Adjust look opened from slides (right-click in Show or Edit). Saved
 * "everywhere", it goes on the file in the media bin and the slides drop any
 * look of their own; saved for the slides, only they change.
 */
export function SlideLookDialog({
  target,
  media,
  apply,
  onMediaLook,
  onClose
}: {
  target: SlideLookTarget;
  media: MediaItem[];
  apply: (change: (p: Presentation) => Presentation) => void;
  onMediaLook: (item: MediaItem, look: MediaLook | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const item = media.find((m) => m.path === target.path);
  const ids = target.slides.map((s) => s.cueId);
  const own = target.slides
    .map((s) =>
      target.kind === 'background'
        ? s.background?.look
        : s.layout.graphics.flatMap((g) => (g.kind === 'image' && g.path === target.path && g.look ? [g.look] : []))[0]
    )
    .find(Boolean);
  const setOwn = (look: MediaLook | null): void =>
    apply((p) => (target.kind === 'background' ? setSlideBackgroundLook(p, ids, look) : setSlidePictureLook(p, ids, look, target.path)));
  const bg = target.kind === 'background' ? (target.slides[0]?.background ?? null) : backgroundForPath(target.path);
  return (
    <LookDialog
      name={item?.name ?? mediaName(target.path)}
      bg={bg}
      look={own ?? item?.look}
      slides={ids.length}
      scope={own ? 'slides' : 'everywhere'}
      everywhere={!!item}
      onCancel={onClose}
      onSave={(look, scope) => {
        if (scope === 'everywhere' && item) {
          onMediaLook(item, look);
          if (own) setOwn(null);
        } else setOwn(look);
        onClose();
      }}
    />
  );
}
