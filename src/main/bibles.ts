// Bibles added from downloaded XML files. Each is read once and kept as JSON in
// the app's settings folder (bibles/), with an index of names for the picker.
import { app, net } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { FREE_BIBLES } from '../shared/bible/catalog';
import { parseBibleXml, tidyBookName, verseCount, type Bible } from '../shared/bible/formats';
import { decodeText, zipFiles } from '../shared/import/documents';
import type { BibleInfo } from '../shared/types';

const folder = (): string => join(app.getPath('userData'), 'bibles');
const indexPath = (): string => join(folder(), 'index.json');
const loaded = new Map<string, Bible>();

export async function listBibles(): Promise<BibleInfo[]> {
  try {
    return JSON.parse(await readFile(indexPath(), 'utf8')) as BibleInfo[];
  } catch {
    return [];
  }
}

async function saveIndex(list: BibleInfo[]): Promise<void> {
  await mkdir(folder(), { recursive: true });
  await writeFile(indexPath(), JSON.stringify(list, null, 2));
}

const safeId = (id: string): boolean => /^[a-z0-9-]+$/.test(id);

export async function loadBible(id: string): Promise<Bible | null> {
  if (!safeId(id)) return null;
  const cached = loaded.get(id);
  if (cached) return cached;
  try {
    const bible = JSON.parse(await readFile(join(folder(), `${id}.json`), 'utf8')) as Bible;
    loaded.set(id, bible);
    return bible;
  } catch {
    return null;
  }
}

/** Name and short name from a Digital Bible Library metadata file (eBible.org zips carry one). */
function metadataOf(xml: string): { name?: string; abbreviation?: string } {
  const first = (tag: string): string | undefined => new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml)?.[1].trim();
  return { name: first('nameLocal') ?? first('name'), abbreviation: first('abbreviationLocal') ?? first('abbreviation') };
}

interface Download {
  xml: string;
  name?: string;
  abbreviation?: string;
}

/** The XML inside a download: the file itself, or the largest .xml in a zip (with its metadata, if any). */
function xmlOf(path: string, bytes: Uint8Array): Download {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = [...zipFiles(bytes).entries()].filter(([name]) => !name.startsWith('__MACOSX'));
    const xml = entries.filter(([name]) => /\.(xml|osis|usfx|zef)$/i.test(name) && !/metadata\.xml$/i.test(name)).sort((a, b) => b[1].length - a[1].length)[0];
    if (!xml) throw new Error('There’s no XML Bible in this zip file.');
    const meta = entries.find(([name]) => /metadata\.xml$/i.test(name));
    return { xml: decodeText(xml[1]), ...(meta ? metadataOf(decodeText(meta[1])) : {}) };
  }
  if (!/\.(xml|osis|usfx|zef|txt)$/i.test(path) && bytes[0] !== 0x3c && bytes[0] !== 0xef && bytes[0] !== 0xff && bytes[0] !== 0xfe) {
    throw new Error('This doesn’t look like an XML file.');
  }
  return { xml: decodeText(bytes) };
}

function readDownload(path: string, bytes: Uint8Array, fallbackName: string): Bible {
  const { xml, name, abbreviation } = xmlOf(path, bytes);
  const bible = parseBibleXml(xml, fallbackName);
  // The file's own title wins; metadata fills in when the file has none.
  const untitled = bible.name === fallbackName.replace(/\.[^.]+$/, '');
  return { ...bible, ...(untitled && name ? { name } : {}), ...(untitled && abbreviation ? { abbreviation } : {}) };
}

/** Read a downloaded Bible and keep it. Adding the same translation again replaces it. */
export async function addBible(path: string): Promise<BibleInfo> {
  const bytes = new Uint8Array(await readFile(path));
  return keep(readDownload(path, bytes, basename(path)));
}

const MAX_DOWNLOAD = 40 * 1024 * 1024;

/** Download one of the free Bibles (only those listed in FREE_BIBLES) and keep it. */
export async function downloadFreeBible(id: string, onProgress: (received: number, total: number) => void = () => undefined): Promise<BibleInfo> {
  const entry = FREE_BIBLES.find((b) => b.id === id);
  if (!entry) throw new Error('That Bible isn’t one Vessel can download.');
  let response: Response;
  try {
    response = await net.fetch(entry.url);
  } catch {
    throw new Error('Couldn’t reach ebible.org. Check the internet connection and try again.');
  }
  if (!response.ok || !response.body) throw new Error(`ebible.org answered ${response.status}. Try again later.`);
  // Read it piece by piece so the window can show how far along it is (ebible.org can be slow).
  const total = Number(response.headers.get('content-length')) || entry.sizeMb * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_DOWNLOAD) throw new Error('The download was larger than expected, so it wasn’t used.');
      chunks.push(value);
      onProgress(received, total);
    }
  } catch (err) {
    if (received > MAX_DOWNLOAD) throw err;
    throw new Error('The download stopped part way. Check the internet connection and try again.');
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return keepCatalogBible(bytes, entry);
}

/** Add a Bible that comes with Vessel (the samples' World English Bible), named as the catalogue names it. */
export async function addBundledBible(path: string, id: string): Promise<BibleInfo> {
  const entry = FREE_BIBLES.find((b) => b.id === id);
  if (!entry) throw new Error(`No catalogue Bible called ${id}`);
  return keepCatalogBible(new Uint8Array(await readFile(path)), entry);
}

/** Keep a catalogue Bible from its downloaded (zipped) bytes. */
function keepCatalogBible(bytes: Uint8Array, entry: (typeof FREE_BIBLES)[number]): Promise<BibleInfo> {
  const bible = readDownload(`${entry.id}.zip`, bytes, entry.name);
  // The catalogue's names are the familiar ones ("World English Bible", "WEB"), and it knows the credit to show.
  const language = bible.language || entry.language;
  return keep({
    ...bible,
    name: entry.name,
    abbreviation: entry.abbreviation,
    language,
    books: bible.books.map((b) => ({ ...b, name: tidyBookName(b.name, language) })),
    ...(entry.credit ? { credit: entry.credit } : {})
  });
}

async function keep(bible: Bible): Promise<BibleInfo> {
  const list = await listBibles();
  const existing = list.find((b) => b.name === bible.name && b.abbreviation === bible.abbreviation);
  const base = bible.abbreviation.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bible';
  let id = existing?.id ?? base;
  for (let n = 2; !existing && list.some((b) => b.id === id); n++) id = `${base}-${n}`;
  await mkdir(folder(), { recursive: true });
  await writeFile(join(folder(), `${id}.json`), JSON.stringify(bible));
  loaded.set(id, bible);
  const info: BibleInfo = {
    id,
    name: bible.name,
    abbreviation: bible.abbreviation,
    language: bible.language,
    format: bible.format,
    books: bible.books.length,
    verses: verseCount(bible),
    ...(bible.credit ? { credit: bible.credit } : {})
  };
  await saveIndex([...list.filter((b) => b.id !== id), info]);
  return info;
}

export async function removeBible(id: string): Promise<BibleInfo[]> {
  const list = (await listBibles()).filter((b) => b.id !== id);
  await saveIndex(list);
  loaded.delete(id);
  const file = join(folder(), `${id}.json`);
  if (safeId(id) && existsSync(file)) await rm(file);
  return list;
}
