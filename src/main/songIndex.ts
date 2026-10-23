// "Is this song already here?" for files coming in from elsewhere (Vessel
// files, playlists with media). A song matches one in the library when it's
// the same presentation (same id) with the same words, slides and settings;
// where its pictures and videos are kept doesn't matter, only their names, so
// the same song pointing at its media in another folder still matches.
import { createHash } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Presentation } from '../shared/gen/presentation_pb';
import { parsePresentation, serializePresentation, uuidOf } from '../shared/pro/presentation';
import { mediaPathsOf, relinkMedia } from '../shared/pro/relink';

const name = (path: string): string => basename(path.replace(/\\/g, '/'));

/** A fingerprint of the song with its media reduced to file names. */
export function songKey(p: Presentation): string {
  const moves: Record<string, string> = {};
  for (const path of mediaPathsOf(p)) moves[path] = `/${name(path)}`;
  return createHash('sha1').update(serializePresentation(relinkMedia(p, moves))).digest('hex');
}

export interface SongIndex {
  /** The library file holding this same song, if there is one. */
  find(p: Presentation): Promise<string | null>;
}

/** Look songs up among these library files; each is read only if a song with its id comes in. */
export function songIndex(paths: string[]): SongIndex {
  let byId: Promise<Map<string, Array<{ path: string; key: string }>>> | null = null;
  const build = async (): Promise<Map<string, Array<{ path: string; key: string }>>> => {
    const map = new Map<string, Array<{ path: string; key: string }>>();
    for (const path of paths) {
      try {
        const p = parsePresentation(new Uint8Array(await readFile(path)));
        const id = uuidOf(p.uuid);
        if (!id) continue;
        map.set(id, [...(map.get(id) ?? []), { path, key: songKey(p) }]);
      } catch {
        // Not readable: can't be the same song.
      }
    }
    return map;
  };
  return {
    async find(p) {
      const id = uuidOf(p.uuid);
      if (!id) return null;
      byId ??= build();
      const key = songKey(p);
      return (await byId).get(id)?.find((x) => x.key === key)?.path ?? null;
    }
  };
}

/** Whether two files hold the same bytes, read a piece at a time (videos can be large). */
async function sameContent(a: string, b: string): Promise<boolean> {
  const [fa, fb] = await Promise.all([open(a, 'r'), open(b, 'r')]);
  try {
    const size = 1 << 20;
    const ba = Buffer.alloc(size);
    const bb = Buffer.alloc(size);
    for (let at = 0; ; at += size) {
      const [ra, rb] = await Promise.all([fa.read(ba, 0, size, at), fb.read(bb, 0, size, at)]);
      if (ra.bytesRead !== rb.bytesRead || !ba.subarray(0, ra.bytesRead).equals(bb.subarray(0, rb.bytesRead))) return false;
      if (ra.bytesRead < size) return true;
    }
  } finally {
    await Promise.all([fa.close(), fb.close()]);
  }
}

/** A media file already in the bin with this name and the same contents, to use instead of another copy. */
export async function sameMedia(file: string, existing: string[]): Promise<string | null> {
  const want = name(file);
  let size = -1;
  try {
    size = (await stat(file)).size;
  } catch {
    return null;
  }
  for (const path of existing) {
    if (name(path) !== want) continue;
    try {
      if ((await stat(path)).size === size && (await sameContent(file, path))) return path;
    } catch {
      // Gone: not a match.
    }
  }
  return null;
}
