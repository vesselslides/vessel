import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readZipEntries } from '../src/shared/zip';

const text = (b: Uint8Array): string => new TextDecoder().decode(b);

/** One stored entry whose local header keeps its sizes in a ZIP64 extra field, as PP6 writes them. */
function zip64Entry(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const header = new Uint8Array(30 + nameBytes.length + 20);
  const v = new DataView(header.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 45, true);
  v.setUint32(18, 0xffffffff, true);
  v.setUint32(22, 0xffffffff, true);
  v.setUint16(26, nameBytes.length, true);
  v.setUint16(28, 20, true);
  header.set(nameBytes, 30);
  const x = 30 + nameBytes.length;
  v.setUint16(x, 0x0001, true);
  v.setUint16(x + 2, 16, true);
  v.setBigUint64(x + 4, BigInt(data.length), true);
  v.setBigUint64(x + 12, BigInt(data.length), true);
  const out = new Uint8Array(header.length + data.length);
  out.set(header);
  out.set(data, header.length);
  return out;
}

describe('zip reader', () => {
  it('reads stored and deflated entries', () => {
    const zipped = zipSync({ 'a.txt': [new TextEncoder().encode('stored'), { level: 0 }], 'dir/b.txt': new TextEncoder().encode('deflated '.repeat(50)) });
    const entries = readZipEntries(zipped);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
    expect(text(entries[0].data)).toBe('stored');
    expect(text(entries[1].data)).toBe('deflated '.repeat(50));
  });

  it('reads ZIP64 local headers and ignores a broken central directory', () => {
    const a = zip64Entry('Users/x/Media/bg.jpg', new Uint8Array([1, 2, 3]));
    const b = zip64Entry('song.pro6', new TextEncoder().encode('<RVPresentationDocument/>'));
    const junk = new Uint8Array([0x50, 0x4b, 0x01, 0x02, 9, 9, 9]); // truncated central directory
    const bundle = new Uint8Array([...a, ...b, ...junk]);
    const entries = readZipEntries(bundle);
    expect(entries.map((e) => [e.name, e.data.length])).toEqual([
      ['Users/x/Media/bg.jpg', 3],
      ['song.pro6', 25]
    ]);
  });

  const fixture = process.env.VESSEL_PRO6X_FIXTURE;
  it.skipIf(!fixture)('reads a real .pro6x bundle', () => {
    const entries = readZipEntries(new Uint8Array(readFileSync(fixture!)));
    expect(entries.some((e) => e.name.endsWith('.pro6'))).toBe(true);
    console.log('pro6x entries:', entries.length, 'media:', entries.filter((e) => /\.(jpe?g|png|mov|mp4)$/i.test(e.name)).length);
  });
});
