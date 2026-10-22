// The CCLI usage log: one entry per song per day it was shown with the audience
// output on, kept in the app's settings folder.
import { app, dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { usageKey, type UsageEntry } from '../shared/ccli';

const file = (): string => join(app.getPath('userData'), 'ccli-usage.json');
let cache: UsageEntry[] | null = null;
let writing: Promise<void> = Promise.resolve();

export async function usageLog(): Promise<UsageEntry[]> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(file(), 'utf8')) as UsageEntry[];
  } catch {
    cache = [];
  }
  return cache;
}

const clean = (s: unknown, max = 300): string => (typeof s === 'string' ? s.slice(0, max) : '');

export async function logUsage(raw: Partial<UsageEntry>): Promise<boolean> {
  const entry: UsageEntry = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? String(raw.date) : '',
    title: clean(raw.title),
    songNumber: Number.isFinite(Number(raw.songNumber)) ? Math.max(0, Math.round(Number(raw.songNumber))) : 0,
    authors: clean(raw.authors),
    publisher: clean(raw.publisher),
    ...(raw.path ? { path: clean(raw.path, 2000) } : {})
  };
  if (!entry.date || !entry.title) return false;
  const log = await usageLog();
  if (log.some((e) => usageKey(e) === usageKey(entry))) return false;
  log.push(entry);
  writing = writing.then(() => writeFile(file(), JSON.stringify(log, null, 1)));
  await writing;
  return true;
}

export async function clearUsage(): Promise<void> {
  cache = [];
  writing = writing.then(() => writeFile(file(), '[]'));
  await writing;
}

/** Ask where to save the report, then write it. */
export async function saveReport(win: BrowserWindow | null, csv: string, name: string): Promise<string | null> {
  const options = { title: 'Save the CCLI report', defaultPath: join(app.getPath('documents'), `${name.replace(/[\\/:*?"<>|]/g, '-')}.csv`), filters: [{ name: 'CSV (spreadsheet)', extensions: ['csv'] }] };
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, String(csv));
  return result.filePath;
}
