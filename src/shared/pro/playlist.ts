import { fromBinary } from '@bufbuild/protobuf';
import { unzipSync } from 'fflate';
import type { Playlist } from '../gen/playlist_pb';
import { PlaylistDocumentSchema, type PlaylistDocument } from '../gen/playlist_pb';
import type { PlaylistEntry, PlaylistView } from '../types';
import { urlToPath } from './url';

export interface PlaylistFile {
  document: PlaylistDocument;
  /** Files bundled inside a .proPlaylist archive, keyed by archive path. */
  bundled: Record<string, Uint8Array>;
}

const isZip = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * Read either a raw PlaylistDocument (ProPresenter's Playlists/Library file) or
 * an exported .proPlaylist, which is a zip whose "data" entry holds the document.
 */
export function parsePlaylistFile(bytes: Uint8Array): PlaylistFile {
  if (!isZip(bytes)) return { document: fromBinary(PlaylistDocumentSchema, bytes), bundled: {} };
  const entries = unzipSync(bytes);
  const dataKey = Object.keys(entries).find((k) => k === 'data' || k.endsWith('/data'));
  if (!dataKey) throw new Error('This .proPlaylist has no "data" entry');
  const { [dataKey]: data, ...bundled } = entries;
  return { document: fromBinary(PlaylistDocumentSchema, data), bundled };
}

function collect(node: Playlist, trail: string[], out: PlaylistView[]): void {
  const path = node.name ? [...trail, node.name] : trail;
  if (node.ChildrenType.case === 'playlists') {
    for (const child of node.ChildrenType.value.playlists) collect(child, path, out);
  } else if (node.ChildrenType.case === 'items') {
    const entries: PlaylistEntry[] = node.ChildrenType.value.items.map((item) => {
      const base = { id: item.uuid?.string ?? crypto.randomUUID(), name: item.name };
      switch (item.ItemType.case) {
        case 'presentation':
          return {
            ...base,
            kind: 'presentation',
            documentPath: urlToPath(item.ItemType.value.documentPath),
            arrangementName: item.ItemType.value.arrangementName || undefined
          };
        case 'header':
          return { ...base, kind: 'header' };
        case 'cue':
          return { ...base, kind: 'cue' };
        default:
          return { ...base, kind: 'other' };
      }
    });
    out.push({ id: node.uuid?.string ?? path.join('/'), name: path.join(' / ') || 'Playlist', entries });
  }
}

/** Flatten the playlist tree into leaf playlists with their items. */
export function playlistViews(doc: PlaylistDocument): PlaylistView[] {
  const out: PlaylistView[] = [];
  if (doc.rootNode) collect(doc.rootNode, [], out);
  return out;
}
