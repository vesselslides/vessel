import { inflateSync } from 'fflate';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Read a zip by walking its local file headers. Tolerates archives whose
 * central directory is wrong, such as ProPresenter 6 .pro6x bundles, and
 * understands ZIP64 sizes. Stored and deflated entries only.
 */
export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntry[] = [];
  let i = 0;
  while (i + 30 <= bytes.length) {
    if (view.getUint32(i, true) !== 0x04034b50) break;
    const flags = view.getUint16(i + 6, true);
    const method = view.getUint16(i + 8, true);
    let csize = view.getUint32(i + 18, true);
    let usize = view.getUint32(i + 22, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLen));
    const extraStart = i + 30 + nameLen;
    for (let j = extraStart; j + 4 <= extraStart + extraLen; ) {
      const id = view.getUint16(j, true);
      const len = view.getUint16(j + 2, true);
      if (id === 0x0001) {
        let k = j + 4;
        if (usize === 0xffffffff) {
          usize = Number(view.getBigUint64(k, true));
          k += 8;
        }
        if (csize === 0xffffffff) csize = Number(view.getBigUint64(k, true));
      }
      j += 4 + len;
    }
    if (flags & 0x08) throw new Error('Zip entries with trailing data descriptors are not supported');
    const start = extraStart + extraLen;
    const raw = bytes.subarray(start, start + csize);
    if (!name.endsWith('/')) {
      if (method === 0) entries.push({ name, data: raw });
      else if (method === 8) entries.push({ name, data: inflateSync(raw, { out: new Uint8Array(usize) }) });
      else throw new Error(`Unsupported zip compression method ${method} for ${name}`);
    }
    i = start + csize;
  }
  return entries;
}
