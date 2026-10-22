// Media a presentation points at (backgrounds, and pictures on slides), and
// pointing it somewhere else when files have moved ("relinking").
import { clone, create } from '@bufbuild/protobuf';
import { FilePropertiesSchema } from '../gen/common_pb';
import type { Media } from '../gen/graphics_pb';
import { PresentationSchema, type Presentation } from '../gen/presentation_pb';
import { pathToUrl, urlToPath } from './url';

/** Every Media in the presentation: cue actions on any layer, and media fills of slide elements. */
function eachMedia(p: Presentation, visit: (m: Media) => void): void {
  for (const cue of p.cues) {
    for (const action of cue.actions) {
      const data = action.ActionTypeData;
      if (data.case === 'media' && data.value.element) visit(data.value.element);
      if (data.case === 'slide' && data.value.Slide.case === 'presentation') {
        for (const el of data.value.Slide.value.baseSlide?.elements ?? []) {
          const fill = el.element?.fill;
          if (fill?.FillType.case === 'media') visit(fill.FillType.value);
        }
      }
    }
  }
}

function pathOfMedia(m: Media): string {
  const props = m.TypeProperties;
  const file = props.case === 'image' || props.case === 'video' ? props.value.file?.localUrl : undefined;
  return urlToPath(file ?? m.url);
}

/** The media files a presentation uses, each once. */
export function mediaPathsOf(p: Presentation): string[] {
  const paths = new Set<string>();
  eachMedia(p, (m) => {
    const path = pathOfMedia(m);
    if (path) paths.add(path);
  });
  return [...paths];
}

/** A copy of the presentation with media at old paths pointing at their new paths. */
export function relinkMedia(p: Presentation, moves: Record<string, string>): Presentation {
  const next = clone(PresentationSchema, p);
  eachMedia(next, (m) => {
    const to = moves[pathOfMedia(m)];
    if (!to) return;
    const props = m.TypeProperties;
    if (props.case === 'image' || props.case === 'video') {
      if (props.value.file) props.value.file.localUrl = pathToUrl(to);
      else props.value.file = create(FilePropertiesSchema, { localUrl: pathToUrl(to) });
    }
    if (m.url || (props.case !== 'image' && props.case !== 'video')) m.url = pathToUrl(to);
  });
  return next;
}

/** Whether relinking would change anything in this presentation. */
export const usesAny = (p: Presentation, paths: Iterable<string>): boolean => {
  const used = new Set(mediaPathsOf(p));
  for (const path of paths) if (used.has(path)) return true;
  return false;
};
