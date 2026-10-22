// Checking for a newer Vessel: releases are published on GitHub (the
// "repository" in package.json), with installers named by electron-builder's
// artifactName, e.g. Vessel-1.2.0-mac-arm64.dmg or Vessel-1.2.0-win.exe.

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface Release {
  version: string;
  notes: string;
  /** The release's web page, for when no installer fits. */
  page: string;
  assets: ReleaseAsset[];
}

/** "github:owner/name", "owner/name" or a github.com URL → "owner/name"; null if it isn't one. */
export function githubRepo(repository: unknown): string | null {
  const raw = typeof repository === 'string' ? repository : repository && typeof repository === 'object' ? (repository as { url?: unknown }).url : null;
  if (typeof raw !== 'string') return null;
  const m = /^(?:github:|(?:git\+)?https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(raw.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Compare "1.2.10" with "1.2.9" (a leading v and anything after a hyphen are ignored): above 0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] => v.trim().replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** A GitHub "latest release" response, or null if it isn't a usable, published release. */
export function parseRelease(json: unknown): Release | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (r.draft || r.prerelease || typeof r.tag_name !== 'string') return null;
  const assets = Array.isArray(r.assets) ? r.assets : [];
  return {
    version: r.tag_name.replace(/^v/i, ''),
    notes: typeof r.body === 'string' ? r.body.trim() : '',
    page: typeof r.html_url === 'string' ? r.html_url : '',
    assets: assets.flatMap((a) =>
      a && typeof a.name === 'string' && typeof a.browser_download_url === 'string' ? [{ name: a.name, url: a.browser_download_url, size: Number(a.size) || 0 }] : []
    )
  };
}

/** The installer for this computer: the Mac disk image for its chip, or the Windows installer (the one for both chips first). */
export function installerFor(release: Release, platform: string, arch: string): ReleaseAsset | null {
  const named = (re: RegExp): ReleaseAsset | undefined => release.assets.find((a) => re.test(a.name));
  if (platform === 'darwin') return named(new RegExp(`-mac-${arch}\\.dmg$`, 'i')) ?? null;
  if (platform === 'win32') return named(/-win\.exe$/i) ?? named(new RegExp(`-win-${arch}\\.exe$`, 'i')) ?? null;
  return null;
}

/** Release notes short enough for a dialog. */
export function shortNotes(notes: string, max = 600): string {
  const plain = notes.replace(/\r/g, '').replace(/^#+\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, '')}…` : plain;
}
