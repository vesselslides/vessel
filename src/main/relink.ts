// Finding media that has moved: look through a folder the operator picks for
// files with the same names as the missing ones.
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** Folders never worth looking in. */
const SKIP = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information']);

/** Which of these paths no longer exist. */
export function missingPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.filter((p): p is string => typeof p === 'string' && !!p))].filter((p) => !existsSync(p));
}

const nameOf = (path: string): string => basename(path.replace(/\\/g, '/')).toLowerCase();

/**
 * Look through `folder` (and the folders in it, up to `maxDepth` deep) for files
 * named like the missing ones; names match whatever their case. Returns
 * missing path → where it was found. Stops after `maxEntries` files and folders,
 * so picking a whole drive can't hang the app.
 */
export async function findMoved(folder: string, missing: string[], maxDepth = 8, maxEntries = 100_000): Promise<Record<string, string>> {
  const wanted = new Map<string, string[]>();
  for (const path of missing) {
    const name = nameOf(path);
    if (name) wanted.set(name, [...(wanted.get(name) ?? []), path]);
  }
  const found: Record<string, string> = {};
  let seen = 0;
  // Breadth first, so a file near the top of the chosen folder wins over a copy deep inside it.
  let level = [folder];
  for (let depth = 0; depth <= maxDepth && level.length && wanted.size && seen < maxEntries; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue; // No permission, or gone.
      }
      for (const entry of entries) {
        if (++seen > maxEntries) break;
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP.has(entry.name) && !entry.name.endsWith('.app')) next.push(full);
          continue;
        }
        const paths = wanted.get(entry.name.toLowerCase());
        if (!paths) continue;
        for (const path of paths) found[path] = full;
        wanted.delete(entry.name.toLowerCase());
      }
    }
    level = next;
  }
  return found;
}
