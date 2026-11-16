// Slide backgrounds: ProPresenter stores them as a Media action on the cue,
// targeting the background layer, with the file referenced by URL.
import { create } from '@bufbuild/protobuf';
import { Action_ActionType, Action_LayerType, ActionSchema, VesselLookSchema, type Action, type VesselLook } from '../gen/presentation_pb';
import type { Cue } from '../gen/presentation_pb';
import { Media_ScaleBehavior, Media_TransportProperties_PlaybackBehavior, MediaSchema, type Media } from '../gen/graphics_pb';
import { mediaKindOf, normalizeLook } from '../media';
import type { Background, MediaLook, MediaScale } from '../types';
import { newUuid } from './ids';
import { pathToUrl, urlToPath } from './url';

const SCALE_TO_PRO: Record<MediaScale, Media_ScaleBehavior> = {
  fit: Media_ScaleBehavior.FIT,
  fill: Media_ScaleBehavior.FILL,
  stretch: Media_ScaleBehavior.STRETCH
};

function scaleFromPro(s: Media_ScaleBehavior | undefined): MediaScale {
  if (s === Media_ScaleBehavior.FIT) return 'fit';
  if (s === Media_ScaleBehavior.STRETCH) return 'stretch';
  return 'fill';
}

/** A slide's own look as stored (saturation −100…100 is the look's colour 0…200). */
export function lookFromProto(l: VesselLook | undefined): MediaLook | undefined {
  if (!l) return undefined;
  return (
    normalizeLook({
      blur: l.blur,
      darken: l.darken,
      color: 100 + l.saturation,
      brightness: l.brightness,
      contrast: l.contrast,
      hue: l.hue,
      warmth: l.warmth,
      vignette: l.vignette
    }) ?? undefined
  );
}

export function lookToProto(look: MediaLook | null | undefined): VesselLook | undefined {
  const l = normalizeLook(look);
  if (!l) return undefined;
  return create(VesselLookSchema, {
    blur: l.blur,
    darken: l.darken,
    saturation: l.color - 100,
    brightness: l.brightness ?? 0,
    contrast: l.contrast ?? 0,
    hue: l.hue ?? 0,
    warmth: l.warmth ?? 0,
    vignette: l.vignette ?? 0
  });
}

export function isBackgroundAction(action: Action): boolean {
  return action.ActionTypeData.case === 'media' && action.ActionTypeData.value.layerType === Action_LayerType.BACKGROUND;
}

export function backgroundOfMedia(media: Media | undefined): Background | undefined {
  const props = media?.TypeProperties;
  if (!props || (props.case !== 'image' && props.case !== 'video')) return undefined;
  const path = urlToPath(props.value.file?.localUrl ?? media.url);
  if (!path) return undefined;
  const kind = props.case;
  const loop =
    props.case === 'video' ? props.value.transport?.playbackBehavior === Media_TransportProperties_PlaybackBehavior.LOOP : false;
  return { path, kind, loop, scale: scaleFromPro(props.value.drawing?.scaleBehavior) };
}

/** The background a cue sets when it fires (the first enabled one wins). */
export function backgroundOfCue(cue: Cue): Background | undefined {
  for (const action of cue.actions) {
    if (!isBackgroundAction(action) || action.ActionTypeData.case !== 'media') continue;
    const bg = backgroundOfMedia(action.ActionTypeData.value.element);
    const look = lookFromProto(action.ActionTypeData.value.vesselLook);
    if (bg) return look ? { ...bg, look } : bg;
  }
  return undefined;
}

export function backgroundMedia(bg: Background): Media {
  const file = { localUrl: pathToUrl(bg.path) };
  const drawing = { scaleBehavior: SCALE_TO_PRO[bg.scale] };
  const name = bg.path.split(/[\\/]/).pop() ?? '';
  return create(MediaSchema, {
    uuid: newUuid(),
    metadata: { format: name.split('.').pop()?.toLowerCase() ?? '' },
    TypeProperties:
      bg.kind === 'video'
        ? {
            case: 'video',
            value: {
              drawing,
              file,
              transport: {
                playRate: 1,
                playbackBehavior: bg.loop ? Media_TransportProperties_PlaybackBehavior.LOOP : Media_TransportProperties_PlaybackBehavior.STOP
              }
            }
          }
        : { case: 'image', value: { drawing, file } }
  });
}

export function backgroundAction(bg: Background): Action {
  return create(ActionSchema, {
    uuid: newUuid(),
    name: bg.path.split(/[\\/]/).pop() ?? '',
    type: Action_ActionType.MEDIA,
    isEnabled: true,
    ActionTypeData: {
      case: 'media',
      value: {
        element: backgroundMedia(bg),
        layerType: Action_LayerType.BACKGROUND,
        vesselLook: lookToProto(bg.look)
      }
    }
  });
}

let defaults: { scale: MediaScale; videoLoop: boolean } = { scale: 'fill', videoLoop: true };

/** Preferences ▸ Media: how new backgrounds fit the screen, and whether videos loop. */
export function setBackgroundDefaults(next: { scale?: MediaScale; videoLoop?: boolean }): void {
  defaults = { scale: next.scale ?? 'fill', videoLoop: next.videoLoop ?? true };
}

/** Background for a dropped or picked file, using the defaults from Preferences. */
export function backgroundForPath(path: string): Background | null {
  const kind = mediaKindOf(path);
  return kind ? { path, kind, loop: kind === 'video' && defaults.videoLoop, scale: defaults.scale } : null;
}
