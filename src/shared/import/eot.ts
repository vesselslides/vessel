// Fonts PowerPoint (and Canva) carry inside a .pptx (ppt/fonts/*.fntdata) are
// Embedded OpenType: a header, then the font file itself. Vessel takes the
// font out to draw the presentation with it on computers that don't have it.
// Compressed ones (MicroType Express) are left alone: they're rare and need a
// decompressor.

const TTEMBED_TTCOMPRESSED = 0x4;
const TTEMBED_XORENCRYPTDATA = 0x10000000;

/** The font inside an Embedded OpenType file, or null if it isn't one Vessel can read. */
export function fontFromEot(eot: Uint8Array): { data: Uint8Array; ext: 'ttf' | 'otf' } | null {
  if (eot.length < 82) return null;
  const view = new DataView(eot.buffer, eot.byteOffset, eot.byteLength);
  const eotSize = view.getUint32(0, true);
  const fontSize = view.getUint32(4, true);
  const version = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  if (![0x00010000, 0x00020001, 0x00020002].includes(version)) return null;
  if (eotSize > eot.length || fontSize === 0 || fontSize > eotSize) return null;
  if (flags & TTEMBED_TTCOMPRESSED) return null;
  // The font data is the last FontDataSize bytes of the EOT.
  const data = eot.slice(eotSize - fontSize, eotSize);
  if (flags & TTEMBED_XORENCRYPTDATA) for (let i = 0; i < data.length; i++) data[i] ^= 0x50;
  const tag = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (tag === 'OTTO') return { data, ext: 'otf' };
  if (tag === '\u0000\u0001\u0000\u0000' || tag === 'true') return { data, ext: 'ttf' };
  return null;
}
