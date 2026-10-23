// The sample songs, service and media Vessel sets up the first time it runs
// (resources/samples, made by scripts/samples). Their files refer to each other
// under SAMPLES_ROOT; installing points those references at the real places.

export const SAMPLES_ROOT = '/VESSEL-SAMPLES';

export interface SamplesManifest {
  version: 1;
  /** The service playlist to open, in samples/playlists. */
  playlist: string;
  /** Media for the media bin (in samples/media), by media folder. */
  media: Array<{ file: string; folder: string; muted?: boolean }>;
  /** A placeholder logo for the Logo button (in samples/media). */
  logo: string;
  /** A Bible to add (in samples/bible), and its catalogue id. */
  bible: { file: string; id: string };
  /** Audience messages and lower thirds to start the saved lists with. */
  messages: string[];
  lowerThirds: Array<{ title: string; subtitle: string; color: string }>;
}
