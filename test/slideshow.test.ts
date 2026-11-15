import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importOptionsFrom } from '../src/shared/import';
import { DEFAULT_LYRICS_OPTIONS } from '../src/shared/import/lyrics';
import { convertPptx } from '../src/shared/import/pptx';
import { slideTiming } from '../src/shared/import/pptxTiming';
import { parseXml } from '../src/shared/pro/legacy';
import { setTextStyle } from '../src/shared/pro/edit';
import { parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { nextClick, placeLabel, previousClick, slideshowFrames, slidesPerClick, stepsOf } from '../src/shared/slideshow';

// ---- A made-up slideshow, written the way PowerPoint writes animations -------------

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rel = (id: string, type: string, target: string): string =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const rels = (...r: string[]): string => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;
const xfrm = (x: number, y: number, cx: number, cy: number): string => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
const para = (text: string): string => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p>`;
const textShape = (id: number, name: string, paras: string[], y: number): string =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(600000, y, 10000000, 2000000)}<a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr/>${paras.map(para).join('')}</p:txBody></p:sp>`;
const picture = (id: number): string =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Photo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill><p:spPr>${xfrm(6096000, 3429000, 6096000, 3429000)}</p:spPr></p:pic>`;

/** One effect on a shape (or one of its paragraphs). */
const effect = (o: { spid: number; cls: 'entr' | 'exit' | 'emph'; preset: number; subtype?: number; node?: string; delay?: number; dur?: number; para?: number }): string => {
  const target = `<p:spTgt spid="${o.spid}">${o.para !== undefined ? `<p:txEl><p:pRg st="${o.para}" end="${o.para}"/></p:txEl>` : ''}</p:spTgt>`;
  return `<p:par><p:cTn id="9" presetID="${o.preset}" presetClass="${o.cls}" presetSubtype="${o.subtype ?? 0}" fill="hold" nodeType="${o.node ?? 'clickEffect'}"><p:stCondLst><p:cond delay="${o.delay ?? 0}"/></p:stCondLst><p:childTnLst>
    <p:set><p:cBhvr><p:cTn id="10" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl>${target}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>
    <p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="11" dur="${o.dur ?? 500}"/><p:tgtEl>${target}</p:tgtEl></p:cBhvr></p:animEffect>
  </p:childTnLst></p:cTn></p:par>`;
};
/** A click: groups of effects that start together, each group `delay` ms after the click ("after previous"). */
const click = (groups: Array<{ delay: number; effects: string[] }>, auto = false): string =>
  `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>${auto ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : ''}</p:stCondLst><p:childTnLst>${groups
    .map((g) => `<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="${g.delay}"/></p:stCondLst><p:childTnLst>${g.effects.join('')}</p:childTnLst></p:cTn></p:par>`)
    .join('')}</p:childTnLst></p:cTn></p:par>`;
const timing = (clicks: string[]): string =>
  `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks.join(
    ''
  )}</p:childTnLst></p:cTn><p:prevCondLst/><p:nextCondLst/></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;

// Slide 1: three points come in a click at a time (fade); with the third, the photo flies in from the left
// half a second later, and a fourth click takes it away again. An emphasis effect stays still.
const slide1Timing = timing([
  click([{ delay: 0, effects: [effect({ spid: 3, cls: 'entr', preset: 10, para: 0 })] }]),
  click([{ delay: 0, effects: [effect({ spid: 3, cls: 'entr', preset: 10, para: 1 })] }]),
  click([
    { delay: 0, effects: [effect({ spid: 3, cls: 'entr', preset: 10, para: 2 })] },
    { delay: 500, effects: [effect({ spid: 5, cls: 'entr', preset: 2, subtype: 8, node: 'afterEffect', dur: 750 })] }
  ]),
  click([{ delay: 0, effects: [effect({ spid: 5, cls: 'exit', preset: 10 }), effect({ spid: 2, cls: 'emph', preset: 6, node: 'withEffect' })] }])
]);
// Slide 3: the title fades in by itself as the slide appears.
const slide3Timing = timing([click([{ delay: 0, effects: [effect({ spid: 2, cls: 'entr', preset: 10, node: 'afterEffect', delay: 250 })] }], true)]);

function slideshowPptx(): Uint8Array {
  const slide = (shapes: string, extra = ''): string => `<p:sld ${NS}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld>${extra}</p:sld>`;
  const files: Record<string, string> = {
    'ppt/presentation.xml': `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(rel('rId2', 'slide', 'slides/slide1.xml'), rel('rId3', 'slide', 'slides/slide2.xml'), rel('rId4', 'slide', 'slides/slide3.xml')),
    'ppt/slides/slide1.xml': slide(
      textShape(2, 'Title', ['Three things this week'], 300000) + textShape(3, 'Points', ['Rest is a gift', 'Rest is a rhythm', 'Rest is trust'], 2400000) + picture(5),
      slide1Timing
    ),
    'ppt/slides/_rels/slide1.xml.rels': rels(rel('rIdImg', 'image', '../media/image1.png')),
    // Moves on by itself after 5 seconds.
    'ppt/slides/slide2.xml': slide(textShape(2, 'Title', ['Psalm 23'], 300000), '<p:transition advTm="5000"><p:fade/></p:transition>'),
    'ppt/slides/_rels/slide2.xml.rels': rels(),
    'ppt/slides/slide3.xml': slide(textShape(2, 'Title', ['Questions to take home'], 300000), slide3Timing),
    'ppt/slides/_rels/slide3.xml.rels': rels()
  };
  const zip: Record<string, Uint8Array> = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]));
  zip['ppt/media/image1.png'] = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  return zipSync(zip);
}

// Like a Google Slides or Canva export: a click that only reveals an empty line, and
// artwork kept as an SVG (no picture beside it), drawn at 45%.
function exportedPptx(): Uint8Array {
  const art = `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Freeform 4"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 12192000, 6858000)}<a:custGeom/><a:blipFill><a:blip><a:alphaModFix amt="45000"/><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdSvg"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:spPr></p:sp>`;
  // A big title set tight, as Canva does: 119 pt lines for 166 pt letters, 15 pt closer together;
  // and a verse at one and a half lines.
  const title = `<p:sp><p:nvSpPr><p:cNvPr id="6" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 3000000, 12192000, 3000000)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPts val="11900"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="16600" b="1" spc="-1500"/><a:t>SUBMIT &amp; ENDURE</a:t></a:r></a:p></p:txBody></p:sp>`;
  const verse = `<p:sp><p:nvSpPr><p:cNvPr id="7" name="Verse"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 12192000, 1000000)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="2400"/><a:t>Be subject for the Lord’s sake</a:t></a:r></a:p></p:txBody></p:sp>`;
  const clicks = timing([
    click([{ delay: 0, effects: [effect({ spid: 3, cls: 'entr', preset: 1, para: 1 })] }]),
    click([{ delay: 0, effects: [effect({ spid: 3, cls: 'entr', preset: 1, para: 0 })] }])
  ]);
  const files: Record<string, string> = {
    'ppt/presentation.xml': `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(rel('rId2', 'slide', 'slides/slide1.xml')),
    'ppt/slides/slide1.xml': `<p:sld ${NS}><p:cSld><p:spTree>${art}${textShape(3, 'Answer', ['Jesus.', ''], 300000)}${title}${verse}</p:spTree></p:cSld>${clicks}</p:sld>`,
    'ppt/slides/_rels/slide1.xml.rels': rels(rel('rIdSvg', 'image', '../media/image1.svg')),
    'ppt/media/image1.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>'
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

const slideXml = (body: string) => parseXml(`<p:sld ${NS}><p:cSld/>${body}</p:sld>`).find((n) => n.tag === 'p:sld')!;

describe('PowerPoint click animations', () => {
  it('reads which shapes and paragraphs come and go on each click', () => {
    const t = slideTiming(slideXml(slide1Timing));
    expect(t.steps).toBe(4);
    // The emphasis effect can't be played: it's counted, and nothing hides.
    expect(t.still).toBe(1);
    const points = t.shapes.get('3')!;
    expect(points.in).toBeUndefined();
    expect([...points.paragraphs.entries()].map(([p, b]) => [p, b.in?.step, b.in?.effect])).toEqual([
      [0, 1, 'fade'],
      [1, 2, 'fade'],
      [2, 3, 'fade']
    ]);
    // "After previous", half a second after the click; flies in from the left; leaves on the fourth click.
    expect(t.shapes.get('5')).toMatchObject({ in: { step: 3, effect: 'fly', side: 'left', delay: 0.5, duration: 0.75 }, out: { step: 4, effect: 'fade' } });
    expect(t.shapes.has('2')).toBe(false);
  });

  it('plays effects that start with the slide on the slide itself (no click)', () => {
    const t = slideTiming(slideXml(slide3Timing));
    expect(t.steps).toBe(0);
    expect(t.shapes.get('2')?.in).toMatchObject({ step: 0, effect: 'fade', delay: 0.25 });
  });

  it('a slide without animations has no clicks', () => {
    expect(slideTiming(slideXml(''))).toEqual({ shapes: new Map(), steps: 0, still: 0 });
  });
});

describe('Importing a slideshow', () => {
  const imported = () =>
    convertPptx(slideshowPptx(), 'Sunday message', { look: 'slideshow', lyrics: DEFAULT_LYRICS_OPTIONS, saveMedia: (p) => `/media/${p.split('/').pop()}` });

  it('keeps every slide as made, with its clicks, and says so', () => {
    const { presentation, report } = imported();
    expect(report).toMatchObject({ slides: 3, clicks: 4, stillEffects: 1 });
    // Saved and opened again, it's still a slideshow with its builds.
    const deck = presentationToDeck(parsePresentation(serializePresentation(presentation)), 'd');
    expect(deck.slideshow).toEqual({ source: 'PowerPoint', stillEffects: 1 });
    expect(deck.slides.map(stepsOf)).toEqual([4, 0, 0]);
    expect(deck.slides.every((s) => s.layout.slideshow)).toBe(true);

    const first = deck.slides[0].layout;
    const points = first.boxes.find((b) => b.text.startsWith('Rest is a gift'))!;
    expect(points.build).toBeUndefined();
    expect(points.lineBuilds?.map((l) => [l.first, l.count, l.in?.step])).toEqual([
      [0, 1, 1],
      [1, 1, 2],
      [2, 1, 3]
    ]);
    const photo = first.graphics.find((g) => g.kind === 'image')!;
    expect(photo.build).toMatchObject({ in: { step: 3, effect: 'fly', side: 'left', delay: 0.5 }, out: { step: 4 } });
    // The title has no animation: it's simply there.
    expect(first.boxes.find((b) => b.text === 'Three things this week')?.build).toBeUndefined();
  });

  it('keeps "move on after 5 seconds" and effects that start with the slide', () => {
    const deck = presentationToDeck(imported().presentation, 'd');
    expect(deck.slides[1].advance).toEqual({ seconds: 5, to: 'next' });
    expect(deck.slides[2].layout.boxes[0].build?.in).toMatchObject({ step: 0, effect: 'fade' });
  });

  it('as Vessel slides there are no clicks; it is not a slideshow', () => {
    const { presentation, report } = convertPptx(slideshowPptx(), 'X', { look: 'slides', lyrics: DEFAULT_LYRICS_OPTIONS, saveMedia: () => '/x.png' });
    const deck = presentationToDeck(presentation, 'd');
    expect(deck.slideshow).toBeUndefined();
    expect(report.clicks).toBeUndefined();
    expect(deck.slides.map(stepsOf)).toEqual([0, 0, 0]);
  });
});

describe('Moving through a slideshow', () => {
  const deck = presentationToDeck(imported(), 'd');
  function imported() {
    return convertPptx(slideshowPptx(), 'S', { look: 'slideshow', lyrics: DEFAULT_LYRICS_OPTIONS, saveMedia: () => '/x.png' }).presentation;
  }

  it('Next goes click by click, then to the next slide', () => {
    const places = [{ index: 0, build: 0 }];
    for (let at = nextClick(deck, places[0]); at; at = nextClick(deck, at)) places.push(at);
    expect(places.map((p) => `${p.index}:${p.build}`)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4', '1:0', '2:0']);
    expect(placeLabel(deck, { index: 0, build: 2 })).toBe('Slide 1 · click 2 of 4');
    expect(placeLabel(deck, { index: 1, build: 0 })).toBe('Slide 2');
  });

  it('Back takes clicks off, and lands on the slide before with every click made', () => {
    expect(previousClick(deck, { index: 0, build: 2 })).toEqual({ index: 0, build: 1 });
    expect(previousClick(deck, { index: 1, build: 0 })).toEqual({ index: 0, build: 4 });
    expect(previousClick(deck, { index: 0, build: 0 })).toBeNull();
  });

  it('pictures for the presenter: one per click, in order', () => {
    expect(slideshowFrames(deck)).toEqual([0, 5, 6]);
    const frames = slidesPerClick(deck);
    expect(frames.map((s) => s.layout.step)).toEqual([0, 1, 2, 3, 4, 0, 0]);
  });
});

describe('Import choices', () => {
  it('PowerPoint comes in as a slideshow unless words only was chosen before', () => {
    expect(importOptionsFrom({}).pptxAs).toBe('slideshow');
    expect(importOptionsFrom({ pptxLook: 'slides' }).pptxAs).toBe('slideshow');
    expect(importOptionsFrom({ pptxLook: 'lyrics' }).pptxAs).toBe('lyrics');
    expect(importOptionsFrom({ pptxAs: 'slides', linesPerSlide: 2 })).toMatchObject({ pptxAs: 'slides', linesPerSlide: 2 });
    expect(importOptionsFrom(null).pptxAs).toBe('slideshow');
  });
});

describe('Importing exported slideshows', () => {
  const { presentation, report } = convertPptx(exportedPptx(), 'Exported', { look: 'slideshow', lyrics: DEFAULT_LYRICS_OPTIONS, saveMedia: (p) => `/media/${p.split('/').pop()}` });
  const slide = presentationToDeck(presentation, 'd').slides[0];

  it('drops clicks that show nothing, so Next always does something', () => {
    expect(report.clicks).toBe(1);
    expect(stepsOf(slide)).toBe(1);
    expect(slide.layout.boxes[0].lineBuilds?.map((l) => [l.first, l.in?.step])).toEqual([[0, 1]]);
  });

  it('keeps line and letter spacing, and keeps it when the text is restyled', () => {
    // 1920 slide pixels across 960 points: 2 pixels a point.
    const title = slide.layout.boxes.find((b) => b.text === 'SUBMIT & ENDURE')!;
    expect(title).toMatchObject({ sizePt: 332, lineExact: 238, letterSpacing: -30 });
    expect(title.lineMultiple).toBeUndefined();
    const verse = slide.layout.boxes.find((b) => b.text.startsWith('Be subject'))!;
    expect(verse).toMatchObject({ lineMultiple: 1.5 });
    expect(verse.lineExact).toBeUndefined();
    expect(verse.letterSpacing).toBeUndefined();
    // Twice the size: exact spacing and letter spacing double with it.
    const bigger = presentationToDeck(setTextStyle(presentation, { scale: 2 }), 'd').slides[0].layout.boxes;
    expect(bigger.find((b) => b.text === 'SUBMIT & ENDURE')).toMatchObject({ sizePt: 664, lineExact: 476, letterSpacing: -60 });
    expect(bigger.find((b) => b.text.startsWith('Be subject'))).toMatchObject({ lineMultiple: 1.5 });
  });

  it('keeps SVG artwork and how see-through it is', () => {
    expect(report.pictures).toBe(1);
    expect(slide.layout.graphics.find((g) => g.kind === 'image')).toMatchObject({ path: '/media/image1.svg', opacity: 0.45 });
  });
});
