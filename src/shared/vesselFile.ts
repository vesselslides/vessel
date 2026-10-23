// Vessel files (.vessel): one file to share with another church or the
// community: a theme pack, a presentation, a whole service with its songs
// and media, or a collection of any of these. A zip holding:
//
//   manifest.json          what's inside, who made it, a note from them
//   presentations/*.pro    presentations, their media pointing under VESSEL_FILE_ROOT
//   playlists/*.proPlaylist  service playlists, their songs pointing under VESSEL_FILE_ROOT
//   media/<n>/<name>       pictures, videos and audio
//
// Themes travel in the manifest. Opening a Vessel file shows what's inside
// first; only what's chosen is added, and nothing already here is overwritten.
import type { Service } from './pro/service';
import type { Theme } from './theme';
import type { BinKind } from './types';

export const VESSEL_EXTENSION = 'vessel';
/** Where references inside a Vessel file point; replaced with real places when it's opened. */
export const VESSEL_FILE_ROOT = '/VESSEL-FILE';

export type VesselKind = 'presentation' | 'service' | 'themes' | 'collection';

export interface VesselManifest {
  format: 'vessel';
  version: 1;
  kind: VesselKind;
  title: string;
  /** A note from whoever made it. */
  description: string;
  /** Who made it, e.g. a church's name; may be empty. */
  author: string;
  created: number;
  /** The Vessel that made it, e.g. "Vessel 0.1.0". */
  app: string;
  presentations: Array<{ file: string; name: string; slides: number }>;
  playlists: Array<{ file: string; name: string; items: number }>;
  themes: Theme[];
  media: Array<{ file: string; name: string; kind: BinKind }>;
}

/** What to put in a Vessel file (from the Export window). */
export interface VesselExportRequest {
  kind: VesselKind;
  title: string;
  description: string;
  author: string;
  /** Presentations as they are now (unsaved edits included). */
  presentations: Array<{ name: string; bytes: Uint8Array }>;
  /** Presentations to include from disk (library songs chosen for a collection). */
  presentationPaths: string[];
  /** Service playlists; their songs are read from disk and included. */
  playlists: Service[];
  themes: Theme[];
  /** Media bin files to include as they are (their media in presentations is always included). */
  media: string[];
}

/** An opened Vessel file, waiting for the person to choose what to add. */
export interface VesselPreview {
  /** Identifies the unpacked file for the "add" step. */
  token: string;
  fileName: string;
  manifest: VesselManifest;
  /** Which presentations and themes are already here (by name), to mark them. */
  have: { presentations: boolean[]; themes: boolean[] };
  /** Size of the media, in bytes. */
  mediaBytes: number;
}

export interface VesselChoice {
  token: string;
  presentations: number[];
  playlists: number[];
  themes: number[];
  /** Add the media too (needed by the presentations; extra media goes into the media bin). */
  media: boolean;
}

export interface VesselReport {
  presentations: number;
  playlists: number;
  themes: number;
  media: number;
  /** Things that were already here, so weren't added again. */
  skipped: number;
  /** The first playlist added, to open. */
  playlist: string | null;
  /** The library folder the presentations went into. */
  folder: string;
}

/** A file name from a title: no characters that are trouble on Mac or Windows. */
export const safeFileName = (name: string, fallback = 'Untitled'): string =>
  name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;

/** A manifest read from a file, checked: the shape Vessel expects, or null. */
export function readManifest(raw: unknown): VesselManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<VesselManifest>;
  if (m.format !== 'vessel' || m.version !== 1) return null;
  const list = <T,>(v: unknown, ok: (x: T) => boolean): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object' && ok(x)) : []);
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
  const isFile = (f: unknown): boolean => typeof f === 'string' && !f.includes('..') && !f.startsWith('/');
  return {
    format: 'vessel',
    version: 1,
    kind: (['presentation', 'service', 'themes', 'collection'] as const).includes(m.kind as VesselKind) ? (m.kind as VesselKind) : 'collection',
    title: str(m.title, 120) || 'Vessel file',
    description: str(m.description, 2000),
    author: str(m.author, 120),
    created: Number(m.created) || 0,
    app: str(m.app, 60),
    presentations: list<VesselManifest['presentations'][number]>(m.presentations, (p) => isFile(p.file) && typeof p.name === 'string'),
    playlists: list<VesselManifest['playlists'][number]>(m.playlists, (p) => isFile(p.file) && typeof p.name === 'string'),
    themes: list<Theme>(m.themes, (t) => typeof t.id === 'string' && typeof t.name === 'string' && typeof t.font === 'string'),
    media: list<VesselManifest['media'][number]>(m.media, (x) => isFile(x.file) && typeof x.name === 'string')
  };
}
