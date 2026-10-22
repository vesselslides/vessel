// Turn ProPresenter 5/6 files into Vessel/ProPresenter 7 presentations.
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { mediaKindOf } from '../shared/media';
import { convertLegacyPresentation } from '../shared/pro/legacy';
import { serializePresentation } from '../shared/pro/presentation';
import type { OpenedFile } from '../shared/types';
import { readZipEntries } from '../shared/zip';
import { addToMediaBin } from './media';

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Where media from .pro6x bundles is unpacked: Documents/Vessel/Imported Media/<bundle>. */
async function unpackMedia(bundleName: string, files: { name: string; data: Uint8Array }[]): Promise<Map<string, string>> {
  const dir = join(app.getPath('documents'), 'Vessel', 'Imported Media', bundleName.replace(/[\\/:*?"<>|]/g, '_'));
  await mkdir(dir, { recursive: true });
  const byName = new Map<string, string>();
  for (const f of files) {
    // Only the file name is used, so archive paths can never escape the folder.
    const name = baseName(f.name).replace(/[\\/:*?"<>|]/g, '_');
    if (!name || name.startsWith('.')) continue;
    const target = join(dir, name);
    if (!existsSync(target)) await writeFile(target, f.data);
    byName.set(name.toLowerCase(), target);
  }
  return byName;
}

export async function importLegacyFile(path: string): Promise<OpenedFile> {
  const ext = extname(path).toLowerCase();
  const name = basename(path, extname(path));
  let xml: string;
  let unpacked = new Map<string, string>();

  if (ext === '.pro6x' || ext === '.pro5x') {
    const entries = readZipEntries(new Uint8Array(await readFile(path)));
    const doc = entries.find((e) => /\.pro[56]$/i.test(e.name));
    if (!doc) throw new Error('This bundle has no .pro5/.pro6 document inside');
    unpacked = await unpackMedia(name, entries.filter((e) => mediaKindOf(e.name)));
    xml = new TextDecoder().decode(doc.data);
  } else {
    xml = await readFile(path, 'utf8');
  }

  // Media paths in old files point at the original computer. Try, in order: the
  // bundle's own copy, the exact path, then a file of the same name next to the document.
  const resolveMedia = (stored: string): string | null => {
    const file = baseName(stored);
    return unpacked.get(file.toLowerCase()) ?? (existsSync(stored) ? stored : null) ?? (existsSync(join(dirname(path), file)) ? join(dirname(path), file) : null);
  };

  const { presentation, report } = convertLegacyPresentation(xml, { name, resolveMedia });
  if (unpacked.size) await addToMediaBin([...unpacked.values()]);
  return { path, bytes: serializePresentation(presentation), importReport: report, unpackedMedia: unpacked.size };
}
