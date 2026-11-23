import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { cssFont, fontNames, setFontSubstitutes } from '../src/shared/fonts';
import { freeFamilyOf, lookAlikeFor } from '../src/shared/fontSuggestions';
import { fontFromEot } from '../src/shared/import/eot';
import { DEFAULT_LYRICS_OPTIONS } from '../src/shared/import/lyrics';
import { convertPptx } from '../src/shared/import/pptx';
import { replaceFont, setTextStyle } from '../src/shared/pro/edit';
import { fontsUsedBy, type PackedFont } from '../src/shared/pro/fontsUsed';
import { createPresentation, parseLyrics, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { unbundlePlaylist, writePlaylistBundle } from '../src/main/playlistBundle';

/** A stand-in font file: TrueType's tag, then some bytes. */
const fakeFont = (fill: number): Uint8Array => Uint8Array.from([0, 1, 0, 0, ...new Array(60).fill(fill)]);

/** Wrap a font as PowerPoint embeds it (Embedded OpenType), optionally XOR-scrambled or marked compressed. */
function eot(font: Uint8Array, opts: { xor?: boolean; compressed?: boolean } = {}): Uint8Array {
  const header = 82;
  const out = new Uint8Array(header + font.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, out.length, true);
  v.setUint32(4, font.length, true);
  v.setUint32(8, 0x00020002, true);
  v.setUint32(12, (opts.xor ? 0x10000000 : 0) | (opts.compressed ? 0x4 : 0), true);
  out.set(opts.xor ? font.map((b) => b ^ 0x50) : font, header);
  return out;
}

describe('Fonts carried in PowerPoint files', () => {
  it('takes the font out of Embedded OpenType, plain or scrambled', () => {
    const font = fakeFont(7);
    expect(fontFromEot(eot(font))).toEqual({ data: font, ext: 'ttf' });
    expect(fontFromEot(eot(font, { xor: true }))).toEqual({ data: font, ext: 'ttf' });
    // Compressed (MicroType Express) and things that aren't EOT are left alone.
    expect(fontFromEot(eot(font, { compressed: true }))).toBeNull();
    expect(fontFromEot(new Uint8Array(100))).toBeNull();
  });

  it('keeps each embedded face, and says which fonts came with the file', () => {
    const NS =
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
    const files: Record<string, Uint8Array> = {
      'ppt/presentation.xml': strToU8(
        `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:embeddedFontLst><p:embeddedFont><p:font typeface="Gotham Bold"/><p:regular r:id="rIdF1"/></p:embeddedFont><p:embeddedFont><p:font typeface="Gotham"/><p:regular r:id="rIdF2"/><p:bold r:id="rIdF3"/></p:embeddedFont></p:embeddedFontLst></p:presentation>`
      ),
      'ppt/_rels/presentation.xml.rels': strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId2', 'slide', 'slides/slide1.xml')}${rel('rIdF1', 'font', 'fonts/font1.fntdata')}${rel('rIdF2', 'font', 'fonts/font2.fntdata')}${rel('rIdF3', 'font', 'fonts/font3.fntdata')}</Relationships>`
      ),
      'ppt/slides/slide1.xml': strToU8(
        `<p:sld ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="2000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"><a:latin typeface="Gotham Bold"/></a:rPr><a:t>SUBMIT &amp; ENDURE</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
      ),
      'ppt/slides/_rels/slide1.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
      'ppt/fonts/font1.fntdata': eot(fakeFont(1)),
      'ppt/fonts/font2.fntdata': eot(fakeFont(2)),
      'ppt/fonts/font3.fntdata': eot(fakeFont(3), { compressed: true })
    };
    const kept: Array<{ family: string; bold: boolean; first: number }> = [];
    const { report } = convertPptx(zipSync(files), 'Submit', {
      look: 'slideshow',
      lyrics: DEFAULT_LYRICS_OPTIONS,
      saveFont: (family, f) => kept.push({ family, bold: f.bold, first: f.data[4] })
    });
    // The compressed bold face of Gotham can't be read, so it's left out.
    expect(kept).toEqual([
      { family: 'Gotham Bold', bold: false, first: 1 },
      { family: 'Gotham', bold: false, first: 2 }
    ]);
    expect(report.embeddedFonts).toEqual(['Gotham Bold', 'Gotham']);
  });
});

describe('Missing fonts', () => {
  afterEach(() => setFontSubstitutes({}));

  it('draws a missing font with the stand-in chosen, keeping its weight', () => {
    expect(cssFont('Gotham Bold').family.startsWith('"Gotham Bold"')).toBe(true);
    setFontSubstitutes({ 'gotham bold': 'Montserrat', 'proxima nova-semibold': 'Figtree' });
    const gotham = cssFont('Gotham Bold');
    expect(gotham.family.startsWith('"Montserrat"')).toBe(true);
    // The original stays behind it, for a computer that has it after all.
    expect(gotham.family).toContain('"Gotham Bold"');
    expect(gotham.weight).toBe(700);
    expect(cssFont('Proxima Nova-SemiBold')).toMatchObject({ weight: 600 });
    expect(cssFont('Proxima Nova-SemiBold').family.startsWith('"Figtree"')).toBe(true);
    expect(cssFont('Arial').family.startsWith('"Arial"')).toBe(true);
  });

  it('knows the names a font goes by, close free look-alikes, and free families', () => {
    expect(fontNames('HelveticaNeue-Bold')).toEqual(['HelveticaNeue-Bold', 'Helvetica Neue-Bold', 'Helvetica Neue', 'HelveticaNeue']);
    expect([lookAlikeFor('Gotham Bold'), lookAlikeFor('Calibri'), lookAlikeFor('Proxima Nova Rg'), lookAlikeFor('Zapfino')]).toEqual(['Montserrat', 'Carlito', 'Figtree', undefined]);
    expect([freeFamilyOf('Montserrat SemiBold'), freeFamilyOf('Open Sans-ExtraBold Italic'), freeFamilyOf('Lato')]).toEqual(['Montserrat', 'Open Sans', 'Lato']);
  });

  it('can write the replacement into the song, for that font only', () => {
    let p = createPresentation('Song', parseLyrics('[Verse]\nOne\n\nTwo'));
    const [a] = presentationToDeck(p, 'd').slides.map((s) => s.cueId);
    p = setTextStyle(p, { font: 'Gotham Bold' }, [a]);
    expect(fontsUsedBy(p).sort()).toEqual(['Gotham Bold', 'Helvetica'].sort());
    p = replaceFont(p, 'gotham bold', 'Montserrat');
    expect(presentationToDeck(p, 'd').slides.map((s) => s.layout.boxes[0].font)).toEqual(['Montserrat', 'Helvetica']);
  });
});

describe('Fonts travel with playlists', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('packs the fonts the songs use, and keeps them on the other computer', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vessel-fonts-'));
    let song = createPresentation('Grace', parseLyrics('[Verse]\nAmazing grace'));
    song = setTextStyle(song, { font: 'Gotham Bold' });
    const songPath = join(dir, 'Grace.pro');
    writeFileSync(songPath, serializePresentation(song));
    const fontPath = join(dir, 'Gotham Bold-abc.ttf');
    writeFileSync(fontPath, fakeFont(9));
    const asked: string[][] = [];
    const file = join(dir, 'Sunday.proPlaylist');
    await writePlaylistBundle(file, { name: 'Sunday', items: [{ id: 's', kind: 'presentation', name: 'Grace', path: songPath }] }, {}, async (families) => {
      asked.push(families);
      return families.includes('Gotham Bold') ? [{ family: 'Gotham Bold', source: 'embedded', from: 'Submit', path: fontPath }] : [];
    });
    expect(asked).toEqual([['Gotham Bold']]);
    rmSync(songPath);
    const added: Array<{ font: PackedFont; bytes: number[] }> = [];
    await unbundlePlaylist(file, join(dir, 'scratch'), {
      libraryFolder: join(dir, 'Library'),
      mediaRoot: join(dir, 'Media'),
      addFont: async (font, path) => void added.push({ font, bytes: [...readFileSync(path)] })
    });
    expect(added).toEqual([{ font: expect.objectContaining({ family: 'Gotham Bold', source: 'embedded', from: 'Submit' }), bytes: [...fakeFont(9)] }]);
  });
});
