// Edit ▸ Text (font, size, bold, italic, colour, alignment on some or all
// slides) and media bin ▸ Adjust look (blur, darken, colour).
import { describe, expect, it } from 'vitest';
import { lookFilter, normalizeLook } from '../src/shared/media';
import { setTextStyle } from '../src/shared/pro/edit';
import { createPresentation, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';

const song = () =>
  createPresentation('Talk', [
    { group: 'Verse', slides: ['One', 'Two'] },
    { group: 'Chorus', slides: ['Sing'] }
  ]);
const boxes = (p: ReturnType<typeof song>) => presentationToDeck(p, 'd').groups.flatMap((g) => g.slides.map((s) => s.layout.boxes[0]));

describe('text style', () => {
  it('changes the font, weight, colour and alignment of every slide, keeping the words', () => {
    const before = boxes(song());
    const after = boxes(parsePresentation(serializePresentation(setTextStyle(song(), { font: 'Georgia', bold: true, italic: true, color: '#ffcc00', align: 'left' }))));
    expect(after.map((b) => b.text)).toEqual(['One', 'Two', 'Sing']);
    for (const b of after) {
      expect(b).toMatchObject({ font: 'Georgia', bold: true, italic: true, color: 'rgb(255, 204, 0)', align: 'left' });
      expect(b.sizePt).toBe(before[0].sizePt);
    }
  });

  it('scales the size, and can change one group only', () => {
    const p = song();
    const deck = presentationToDeck(p, 'd');
    const chorus = deck.groups[1].slides.map((s) => s.cueId);
    const size = boxes(p)[0].sizePt;
    const after = boxes(setTextStyle(p, { scale: 1.5, bold: false }, chorus));
    expect(after.map((b) => b.sizePt)).toEqual([size, size, Math.round(size * 1.5 * 10) / 10]);
    expect(boxes(p).map((b) => b.sizePt)).toEqual([size, size, size]); // the original is untouched
  });
});

describe('media look', () => {
  it('keeps values in range and drops a look that changes nothing', () => {
    expect(normalizeLook({ blur: 150, darken: -5, color: 40.4 })).toEqual({ blur: 100, darken: 0, color: 40 });
    expect(normalizeLook({ blur: 0, darken: 0, color: 100 })).toBeNull();
    expect(normalizeLook('nonsense')).toBeNull();
  });

  it('blurs by a share of the height, so a thumbnail looks like the screen', () => {
    expect(lookFilter({ blur: 50, darken: 0, color: 100 }, 1080)).toBe('blur(21.6px)');
    expect(lookFilter({ blur: 50, darken: 0, color: 100 }, 108)).toBe('blur(2.2px)');
    expect(lookFilter({ blur: 0, darken: 50, color: 0 }, 1080)).toBe('brightness(0.550) saturate(0.00)');
  });
});

describe('slides with several text boxes', () => {
  it('edits one box without touching the others', async () => {
    const { strToU8, zipSync } = await import('fflate');
    const { convertPptx } = await import('../src/shared/import/pptx');
    const { DEFAULT_LYRICS_OPTIONS } = await import('../src/shared/import/lyrics');
    const { setSlideBoxText } = await import('../src/shared/pro/edit');
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const shape = (id: number, y: number, t: string) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="s${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="${y}"/><a:ext cx="6000000" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const files: Record<string, string> = {
      'ppt/presentation.xml': `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
      'ppt/slides/slide1.xml': `<p:sld ${NS}><p:cSld><p:spTree>${shape(2, 0, 'Title')}${shape(3, 3000000, 'Body words')}</p:spTree></p:cSld></p:sld>`
    };
    const pptx = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
    const { presentation } = convertPptx(pptx, 'Talk', { look: 'slides', lyrics: DEFAULT_LYRICS_OPTIONS });
    const slide = presentationToDeck(presentation, 'd').slides[0];
    expect(slide.layout.boxes.map((b) => b.text)).toEqual(['Title', 'Body words']);
    const after = presentationToDeck(setSlideBoxText(presentation, slide.cueId, 1, 'New body'), 'd').slides[0];
    expect(after.layout.boxes.map((b) => b.text)).toEqual(['Title', 'New body']);
  });
});
