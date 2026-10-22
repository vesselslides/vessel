import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxToText, decodeText, odtToText } from '../src/shared/import/documents';
import { DEFAULT_LYRICS_OPTIONS, extractStanzas, isChordLine, lyricsToPresentation, parseLabel } from '../src/shared/import/lyrics';
import { convertPptx } from '../src/shared/import/pptx';
import { presentationToDeck } from '../src/shared/pro/presentation';

const deckOf = (p: Parameters<typeof presentationToDeck>[0]) => presentationToDeck(p, 'd');
const lyrics = (text: string, opts = DEFAULT_LYRICS_OPTIONS, name = 'Song') => lyricsToPresentation(name, text, opts);
const order = (p: Parameters<typeof presentationToDeck>[0]) => deckOf(p).slides.map((s) => `${s.groupName}: ${s.text}`);

describe('section labels', () => {
  it('reads the usual ways of writing them', () => {
    expect(parseLabel('Verse 1:')).toEqual({ name: 'Verse 1', times: 1, repeat: false });
    expect(parseLabel('CHORUS')).toMatchObject({ name: 'Chorus' });
    expect(parseLabel('[Pre Chorus]')).toMatchObject({ name: 'Pre-Chorus' });
    expect(parseLabel('verse2')).toMatchObject({ name: 'Verse 2' });
    expect(parseLabel('Chorus x2')).toEqual({ name: 'Chorus', times: 2, repeat: true });
    expect(parseLabel('(Repeat Chorus)')).toMatchObject({ name: 'Chorus', repeat: true });
    expect(parseLabel('[Anything here]')).toMatchObject({ name: 'Anything here' });
    expect(parseLabel('The verse goes on')).toBeNull();
    expect(parseLabel('Choruses of birds')).toBeNull();
  });

  it('spots chord lines but not words', () => {
    expect(isChordLine('G   D/F#   Em7   Cadd9')).toBe(true);
    expect(isChordLine('| Am  F | C  G |')).toBe(true);
    expect(isChordLine('A bright new day')).toBe(false);
    expect(isChordLine('Bee and dee')).toBe(false);
  });
});

describe('lyrics from text', () => {
  it('makes groups from labels and keeps verses on their own slides', () => {
    const { presentation, report } = lyrics('Verse 1\nLine one\nLine two\n\nLine three\n\nChorus:\nRefrain one\nRefrain two');
    expect(order(presentation)).toEqual(['Verse 1: Line one\nLine two', 'Verse 1: Line three', 'Chorus: Refrain one\nRefrain two']);
    expect(report).toMatchObject({ slides: 3, groups: 2, repeats: 0 });
  });

  it('lets a label stand above its verse with a blank line between', () => {
    expect(order(lyrics('[Verse]\n\nLine one\n\n[Bridge]\n\nLine two').presentation)).toEqual(['Verse: Line one', 'Bridge: Line two']);
  });

  it('turns repeated sections into one group and a Song order arrangement', () => {
    const text = 'Verse 1\nV one\n\nChorus\nC one\n\nVerse 2\nV two\n\nChorus\nC one\n\nRepeat Chorus';
    const { presentation, report } = lyrics(text);
    const d = deckOf(presentation);
    expect(d.groups.map((g) => g.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(d.arrangements.map((a) => a.name)).toEqual(['Song order']);
    expect(d.slides.map((s) => s.groupName)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Chorus']);
    expect(report.repeats).toBe(2);
  });

  it('handles "Chorus x2" before the first chorus', () => {
    expect(deckOf(lyrics('Chorus x2\nC one\n\nVerse\nV one').presentation).slides.map((s) => s.groupName)).toEqual(['Chorus', 'Chorus', 'Verse']);
  });

  it('leaves out chords and keeps CCLI and copyright as song details', () => {
    const { presentation, report } = lyrics('G     D\nLine [Em]one\n\nCCLI Song # 1234567\n© 2020 Example Music\nWords and Music by Someone');
    expect(order(presentation)).toEqual([': Line one']);
    expect(report).toMatchObject({ removedChordLines: 1, ccli: true });
    expect(presentation.ccli).toMatchObject({ songNumber: 1234567, copyrightYear: 2020, publisher: 'Example Music', author: 'Someone' });
  });

  it('keeps chords when asked', () => {
    expect(order(lyrics('G  D\nLine one', { ...DEFAULT_LYRICS_OPTIONS, removeChords: false }).presentation)).toEqual([': G  D\nLine one']);
  });

  it('splits long verses by lines per slide', () => {
    const { presentation } = lyrics('Verse\n1\n2\n3\n4\n5', { ...DEFAULT_LYRICS_OPTIONS, linesPerSlide: 2 });
    expect(order(presentation)).toEqual(['Verse: 1\n2', 'Verse: 3\n4', 'Verse: 5']);
  });

  it('takes a first line that matches the file name as the title', () => {
    const { presentation } = lyrics('My Song!\n\nLine one', DEFAULT_LYRICS_OPTIONS, 'my song');
    expect(presentation.name).toBe('My Song!');
    expect(order(presentation)).toEqual([': Line one']);
  });

  it('reads ChordPro', () => {
    const { presentation } = lyrics('{title: Made Up}\n{start_of_chorus}\n[G]Line [D]one\n{end_of_chorus}\n{c: Verse 2}\nLine two');
    expect(presentation.name).toBe('Made Up');
    expect(order(presentation)).toEqual(['Chorus: Line one', 'Verse 2: Line two']);
  });

  it('decodes text in UTF-8, UTF-16 and Windows-1252', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x63, 0x61, 0x66, 0xc3, 0xa9]))).toBe('café');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0, 0x69, 0]))).toBe('hi');
    expect(decodeText(new Uint8Array([0x93, 0x68, 0x69, 0x94]))).toBe('“hi”');
  });

  it('extracts stanzas with a label waiting across blank lines', () => {
    expect(extractStanzas('Bridge\n\n\nLine').stanzas).toEqual([{ label: { name: 'Bridge', times: 1, repeat: false }, lines: ['Line'] }]);
  });
});

// ---- Word and OpenDocument ----------------------------------------------------

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const wp = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${text
    .split('\n')
    .map((l, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${l}</w:t></w:r>`)
    .join('')}</w:p>`;
const docx = (body: string) => zipSync({ 'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`) });

describe('Word documents', () => {
  it('reads one line per paragraph with empty paragraphs between verses, and the title style', () => {
    const doc = docxToText(docx(wp('Made Up Song', 'Title') + wp('Verse 1') + wp('Line ') + '<w:p><w:r><w:t>one </w:t></w:r><w:r><w:t>two</w:t></w:r></w:p>' + wp('') + wp('Chorus') + wp('Sung line')));
    expect(doc.title).toBe('Made Up Song');
    const { presentation } = lyricsToPresentation('file', doc.text, DEFAULT_LYRICS_OPTIONS, doc.title);
    expect(presentation.name).toBe('Made Up Song');
    expect(order(presentation)).toEqual(['Verse 1: Line\none two', 'Chorus: Sung line']);
  });

  it('treats paragraphs as verses when lines are made with Shift+Enter', () => {
    const doc = docxToText(docx(wp('Line one\nLine two') + wp('Line three\nLine four')));
    expect(order(lyricsToPresentation('f', doc.text, DEFAULT_LYRICS_OPTIONS).presentation)).toEqual([': Line one\nLine two', ': Line three\nLine four']);
  });

  it('skips deleted (tracked) text and reads tables', () => {
    const doc = docxToText(docx('<w:tbl><w:tr><w:tc>' + wp('In a table') + '</w:tc></w:tr></w:tbl><w:p><w:del><w:r><w:t>gone</w:t></w:r></w:del><w:r><w:t>kept</w:t></w:r></w:p>'));
    expect(doc.text).toBe('In a table\nkept');
  });

  it('reads OpenDocument text with its spacing and line breaks', () => {
    const odt = zipSync({
      'content.xml': strToU8(
        '<office:document-content xmlns:office="o" xmlns:text="t"><office:body><office:text>' +
          '<text:h>Made Up</text:h><text:p>Line<text:s/>one<text:line-break/>Line <text:span>two</text:span></text:p><text:p/><text:p>Line three</text:p>' +
          '</office:text></office:body></office:document-content>'
      )
    });
    const doc = odtToText(odt);
    expect(doc.title).toBe('Made Up');
    expect(doc.text).toBe('Line one\nLine two\n\nLine three');
  });
});

// ---- PowerPoint -----------------------------------------------------------------

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const rels = (...r: string[]) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;
const xfrm = (x: number, y: number, cx: number, cy: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
const ph = (type: string, idx?: string) => `<p:nvSpPr><p:cNvPr id="2" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"${idx ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr>`;
const para = (text: string, rPr = '') => `<a:p><a:r><a:rPr lang="en-US"${rPr}/><a:t>${text}</a:t></a:r></a:p>`;

/** A small made-up deck: 16:9, a dark theme master, a title+body layout and three slides. */
function samplePptx(): Uint8Array {
  const theme = `<a:theme ${NS}><a:themeElements><a:clrScheme name="t"><a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="FF0000"/></a:accent1></a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Heading Font"/></a:majorFont><a:minorFont><a:latin typeface="Body Font"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
  const master = `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></p:bgPr></p:bg><p:spTree>
      <p:sp>${ph('title')}<p:spPr>${xfrm(838200, 365125, 10515600, 1325563)}</p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p/></p:txBody></p:sp>
      <p:sp>${ph('body', '1')}<p:spPr>${xfrm(838200, 1825625, 10515600, 4351338)}</p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:cNvPr id="9" name="Logo bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 6400800, 12192000, 457200)}<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>
    </p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/>
    <p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`;
  const layout = `<p:sldLayout ${NS}><p:cSld><p:spTree>
      <p:sp>${ph('title')}<p:spPr/><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>
      <p:sp>${ph('body', '1')}<p:spPr/><p:txBody><a:bodyPr anchor="b"/><a:p/></p:txBody></p:sp>
    </p:spTree></p:cSld></p:sldLayout>`;
  const slide = (title: string, body: string, extra = '', attrs = '') =>
    `<p:sld ${NS}${attrs}><p:cSld><p:spTree>
      <p:sp>${ph('title')}<p:spPr/><p:txBody><a:bodyPr/>${para(title)}</p:txBody></p:sp>
      <p:sp>${ph('body', '1')}<p:spPr/><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>${extra}
    </p:spTree></p:cSld></p:sld>`;
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Photo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill><p:spPr>${xfrm(6096000, 0, 6096000, 3429000)}</p:spPr></p:pic>`;
  const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="T"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"/></a:graphic></p:graphicFrame>`;
  const slideRels = (img = false) => rels(rel('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'), ...(img ? [rel('rIdImg', 'image', '../media/image1.png')] : []));
  const files: Record<string, string> = {
    'ppt/presentation.xml': `<p:presentation ${NS} xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/>
      <p:extLst><p:ext uri="{521415D9}"><p14:sectionLst><p14:section name="Verse"><p14:sldIdLst><p14:sldId id="256"/><p14:sldId id="257"/></p14:sldIdLst></p14:section><p14:section name="Chorus"><p14:sldIdLst><p14:sldId id="258"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(rel('rId2', 'slide', 'slides/slide1.xml'), rel('rId3', 'slide', 'slides/slide2.xml'), rel('rId4', 'slide', 'slides/slide3.xml')),
    'ppt/slides/slide1.xml': slide('Made Up Song', para('Line one') + para('Line two', ' b="1" sz="3600"'), picture),
    'ppt/slides/_rels/slide1.xml.rels': slideRels(true),
    'ppt/slides/slide2.xml': slide('Made Up Song', para('Line three'), table, ' show="0"'),
    'ppt/slides/_rels/slide2.xml.rels': slideRels(),
    'ppt/slides/slide3.xml': slide('Made Up Song', para('Chorus') + para('Refrain one')),
    'ppt/slides/_rels/slide3.xml.rels': slideRels(),
    'ppt/slideLayouts/slideLayout1.xml': layout,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels(rel('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')),
    'ppt/slideMasters/slideMaster1.xml': master,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels(rel('rId1', 'theme', '../theme/theme1.xml')),
    'ppt/theme/theme1.xml': theme
  };
  const zip: Record<string, Uint8Array> = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]));
  zip['ppt/media/image1.png'] = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  return zipSync(zip);
}

describe('PowerPoint', () => {
  it('notes what it could not bring across', () => {
    const files = unzipSync(samplePptx());
    files['ppt/slides/slide2.xml'] = strToU8(new TextDecoder().decode(files['ppt/slides/slide2.xml']).replace(' show="0"', ''));
    const { report } = convertPptx(zipSync(files), 'Deck', { look: 'slides', lyrics: DEFAULT_LYRICS_OPTIONS, saveMedia: () => '/x.png' });
    expect(report).toMatchObject({ slides: 3, hiddenSlides: 0, skipped: { tables: 1 } });
  });

  it('keeps the slides’ look: background, master artwork, placeholders, styles and pictures', () => {
    const saved: string[] = [];
    const { presentation, report } = convertPptx(samplePptx(), 'Deck', {
      look: 'slides',
      lyrics: DEFAULT_LYRICS_OPTIONS,
      saveMedia: (zipPath) => {
        saved.push(zipPath);
        return `/media/${zipPath.split('/').pop()}`;
      }
    });
    // The hidden slide (with the table) is left out.
    expect(report).toMatchObject({ slides: 2, groups: 2, pictures: 1, hiddenSlides: 1, skipped: {} });
    expect(saved).toEqual(['ppt/media/image1.png']);

    const d = deckOf(presentation);
    expect(d.groups.map((g) => [g.name, g.slides.length])).toEqual([['Verse', 1], ['Chorus', 1]]);
    const first = d.groups[0].slides[0].layout;
    expect([first.width, first.height]).toEqual([1920, 1080]);

    // Back to front: the master's dark background, its accent bar, then the slide's text and photo.
    const shapes = first.graphics.filter((g) => g.kind === 'shape');
    expect(shapes.map((g) => g.kind === 'shape' && g.fill)).toEqual(['rgba(17, 17, 17, 1)', 'rgba(255, 0, 0, 1)']);
    expect(first.graphics.find((g) => g.kind === 'image')).toMatchObject({ path: '/media/image1.png', x: 960, y: 0, width: 960, height: 540 });

    const [title, body] = first.boxes;
    expect(title).toMatchObject({ text: 'Made Up Song', font: 'Heading Font', align: 'center', valign: 'middle', color: 'rgb(255, 255, 255)' });
    expect(title.sizePt).toBeCloseTo(88, 0);
    // The body's position comes from the master; its anchor from the layout; size and bold from the run.
    expect(body).toMatchObject({ text: 'Line one\nLine two', font: 'Body Font', align: 'left', valign: 'bottom' });
    expect(body.x).toBeCloseTo((838200 + 91440) * (1920 / 12192000), 0);
    expect(body.sizePt).toBeCloseTo(56, 0);
  });

  it('takes only the words, dropping the repeated title and hidden slides', () => {
    let saved = 0;
    const { presentation, report } = convertPptx(samplePptx(), 'Deck', {
      look: 'lyrics',
      lyrics: DEFAULT_LYRICS_OPTIONS,
      saveMedia: () => {
        saved++;
        return '/x.png';
      }
    });
    expect(saved).toBe(0);
    expect(presentation.name).toBe('Made Up Song');
    expect(order(presentation)).toEqual([': Line one\nLine two', 'Chorus: Refrain one']);
    expect(report).toMatchObject({ slides: 2, groups: 2, pictures: 0 });
  });

  it('says clearly when a file is not a PowerPoint presentation', () => {
    expect(() => convertPptx(zipSync({ 'x.txt': strToU8('x') }), 'X', { look: 'slides', lyrics: DEFAULT_LYRICS_OPTIONS })).toThrow(/no PowerPoint presentation/);
  });
});
