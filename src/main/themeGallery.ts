// The theme gallery's online part: the community list from Vessel's public
// repository, fetched only when the gallery is opened, and the page for
// submitting a theme. Both are off until the repository is set.
import { app, net, shell } from 'electron';
import { GALLERY_INDEX, readGalleryIndex, submitUrl, type GalleryEntry } from '../shared/themeGallery';
import type { Theme } from '../shared/theme';
import { log } from './log';
import { vesselRepo } from './updates';

export interface OnlineGallery {
  /** False when there's no repository to fetch from yet. */
  available: boolean;
  entries: GalleryEntry[];
  /** Why the list couldn't be fetched (offline, say). */
  error?: string;
}

export async function onlineGallery(): Promise<OnlineGallery> {
  const repo = vesselRepo();
  if (!repo) return { available: false, entries: [] };
  try {
    const res = await net.fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${GALLERY_INDEX}`, {
      headers: { 'user-agent': `Vessel/${app.getVersion()}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (res.status === 404) return { available: true, entries: [] };
    if (!res.ok) throw new Error(`the gallery answered ${res.status}`);
    return { available: true, entries: readGalleryIndex(await res.json()) };
  } catch (err) {
    log.warn(`Theme gallery: ${(err as Error).message}`);
    return { available: true, entries: [], error: 'The community themes couldn’t be loaded. Check the internet connection.' };
  }
}

/** Open the browser on a prefilled page proposing this theme for the gallery. False when there's nowhere to send it yet. */
export async function submitToGallery(entry: { theme: Theme; author: string; description: string }): Promise<boolean> {
  const repo = vesselRepo();
  if (!repo) return false;
  await shell.openExternal(submitUrl(repo, entry));
  return true;
}
