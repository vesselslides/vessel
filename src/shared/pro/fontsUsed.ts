// Which fonts a presentation's words use, to carry Vessel's copies of them
// along in Vessel files and playlist bundles.
import type { Presentation } from '../gen/presentation_pb';
import type { VesselFont } from '../types';
import { presentationToDeck } from './presentation';

/** A font from Vessel's fonts folder, with where it is on disk, to pack along. */
export type SharedFont = Pick<VesselFont, 'family' | 'weight' | 'italic' | 'source' | 'from'> & { path: string };

/** How a packed font is described inside a Vessel file or bundle. */
export type PackedFont = Pick<VesselFont, 'family' | 'weight' | 'italic' | 'source' | 'from'> & { file: string };

/** Every font the presentation's text boxes name. */
export function fontsUsedBy(p: Presentation): string[] {
  try {
    return [...new Set(presentationToDeck(p, 'fonts').slides.flatMap((s) => s.layout.boxes.map((b) => b.font.trim()).filter(Boolean)))];
  } catch {
    return [];
  }
}
