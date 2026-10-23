// Writing and reading zip files as streams, so files with large videos never
// have to fit in memory. Used by backups (.vesselbackup) and Vessel files (.vessel).
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, join, sep } from 'node:path';

const HIGH_WATER = 32 * 1024 * 1024;

async function drained(stream: WriteStream): Promise<void> {
  if (stream.writableLength > HIGH_WATER) await once(stream, 'drain');
}

export interface ZipWriter {
  /** Add a file from disk (streamed) or from memory. Pictures and videos are already compressed, so pass `compress: false` for them. */
  add(name: string, source: string | Uint8Array, compress?: boolean): Promise<void>;
  /** Finish the file. */
  close(): Promise<void>;
  /** Give up: the half-written file is removed. */
  abort(): Promise<void>;
}

/** Start writing a zip to `target`. Names inside use forward slashes. */
export function zipWriter(target: string): ZipWriter {
  const out = createWriteStream(target);
  let failed: Error | null = null;
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) failed = err;
    else out.write(chunk);
    if (final || err) out.end();
  });
  return {
    async add(name, source, compress = true) {
      const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      zip.add(entry);
      if (typeof source !== 'string') return entry.push(source, true);
      // Stream the file in, waiting for the disk whenever too much is waiting to be written.
      for await (const chunk of createReadStream(source)) {
        entry.push(chunk as Uint8Array);
        await drained(out);
      }
      entry.push(new Uint8Array(0), true);
    },
    async close() {
      zip.end();
      await done;
      if (failed) throw failed;
    },
    async abort() {
      out.destroy();
      await rm(target, { force: true });
    }
  };
}

/** Zip paths always use forward slashes. */
export const zipPath = (...parts: string[]): string => parts.join('/').split(sep).join('/');

/**
 * Unpack the zip `file` into the folder `into`. Names that would leave the
 * folder ("../", absolute paths) are refused, so a crafted file can't write
 * anywhere else on the computer.
 */
export async function unzipTo(file: string, into: string): Promise<void> {
  await mkdir(into, { recursive: true });
  const writes: Array<Promise<void>> = [];
  const open: WriteStream[] = [];
  let bad: Error | null = null;
  const unzip = new Unzip((entry) => {
    const name = entry.name;
    if (name.endsWith('/')) return;
    const target = join(into, ...name.split('/'));
    if (name.split('/').some((p) => p === '..' || p === '') || !target.startsWith(into + sep)) {
      bad = new Error(`This file has something inside that Vessel won’t unpack (${name})`);
      return;
    }
    let stream: WriteStream | null = null;
    const pending: Uint8Array[] = [];
    const ready = mkdir(dirname(target), { recursive: true }).then(() => {
      stream = createWriteStream(target);
      open.push(stream);
      for (const c of pending) stream.write(c);
      return stream;
    });
    let finished!: () => void;
    let failed!: (e: Error) => void;
    writes.push(new Promise<void>((res, rej) => ((finished = res), (failed = rej))));
    entry.ondata = (err, chunk, final) => {
      if (err) return failed(err);
      if (stream) stream.write(chunk);
      else pending.push(chunk);
      if (final) void ready.then((s) => s.end(() => finished()), failed);
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for await (const chunk of createReadStream(file)) {
    unzip.push(chunk as Uint8Array);
    for (const s of open) if (s.writableLength > HIGH_WATER) await once(s, 'drain');
    if (bad) break;
  }
  if (!bad) unzip.push(new Uint8Array(0), true);
  await Promise.all(writes);
  if (bad) throw bad;
}
