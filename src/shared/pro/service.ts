// Service playlists: an ordered list of headers and presentations, stored in
// ProPresenter's playlist format (.proPlaylist = zip with a "data" entry
// holding a PlaylistDocument).
import { create, toBinary } from '@bufbuild/protobuf';
import { zipSync } from 'fflate';
import { PlaylistItemSchema, PlaylistSchema, type Playlist, type PlaylistItem } from '../gen/playlist_pb';
import { PlaylistDocument_Type, PlaylistDocumentSchema, type PlaylistDocument } from '../gen/playlist_pb';
import { hexToColor, colorToHex } from './presentation';
import { newUuid, uuidOf } from './ids';
import { pathToUrl, urlToPath } from './url';
import { parsePlaylistFile } from './playlist';

export type ServiceItem =
  | { id: string; kind: 'header'; name: string; color: string }
  | { id: string; kind: 'presentation'; name: string; path: string; arrangementName?: string };

export interface Service {
  name: string;
  items: ServiceItem[];
}

export const newServiceId = (): string => newUuid().string;

function itemToProto(item: ServiceItem): PlaylistItem {
  const base = { uuid: { $typeName: 'vessel.format.UUID' as const, string: item.id }, name: item.name };
  if (item.kind === 'header') {
    return create(PlaylistItemSchema, { ...base, ItemType: { case: 'header', value: { color: hexToColor(item.color) } } });
  }
  return create(PlaylistItemSchema, {
    ...base,
    ItemType: { case: 'presentation', value: { documentPath: pathToUrl(item.path), arrangementName: item.arrangementName ?? '' } }
  });
}

export function serviceToDocument(service: Service): PlaylistDocument {
  const playlist = create(PlaylistSchema, {
    uuid: newUuid(),
    name: service.name,
    ChildrenType: { case: 'items', value: { items: service.items.map(itemToProto) } }
  });
  return create(PlaylistDocumentSchema, {
    type: PlaylistDocument_Type.PRESENTATION,
    rootNode: create(PlaylistSchema, {
      uuid: newUuid(),
      name: 'root',
      ChildrenType: { case: 'playlists', value: { playlists: [playlist] } }
    })
  });
}

/** The first playlist in a document that holds items. */
function firstItemsPlaylist(node: Playlist | undefined): Playlist | undefined {
  if (!node) return undefined;
  if (node.ChildrenType.case === 'items') return node;
  if (node.ChildrenType.case === 'playlists') {
    for (const child of node.ChildrenType.value.playlists) {
      const found = firstItemsPlaylist(child);
      if (found) return found;
    }
  }
  return undefined;
}

export function documentToService(doc: PlaylistDocument, fallbackName: string): Service {
  const playlist = firstItemsPlaylist(doc.rootNode);
  const items: ServiceItem[] = [];
  if (playlist?.ChildrenType.case === 'items') {
    for (const it of playlist.ChildrenType.value.items) {
      const id = uuidOf(it.uuid) || newServiceId();
      if (it.ItemType.case === 'header') items.push({ id, kind: 'header', name: it.name, color: colorToHex(it.ItemType.value.color) });
      else if (it.ItemType.case === 'presentation') {
        const path = urlToPath(it.ItemType.value.documentPath);
        if (path) items.push({ id, kind: 'presentation', name: it.name, path, arrangementName: it.ItemType.value.arrangementName || undefined });
      }
    }
  }
  return { name: playlist?.name || fallbackName, items };
}

export function encodeService(service: Service): Uint8Array {
  return zipSync({ data: toBinary(PlaylistDocumentSchema, serviceToDocument(service)) }, { level: 6 });
}

export function decodeService(bytes: Uint8Array, fallbackName: string): Service {
  return documentToService(parsePlaylistFile(bytes).document, fallbackName);
}

/** Move the item at `from` so it ends up before the item currently at `to` (or last). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(from < to ? to - 1 : to, 0, item);
  return next;
}
