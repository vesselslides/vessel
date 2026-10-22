import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backgroundOfCue } from '../src/shared/pro/background';
import { convertLegacyPresentation } from '../src/shared/pro/legacy';
import { parsePresentation, presentationToDeck, serializePresentation, slideOfCue, textElements } from '../src/shared/pro/presentation';
import { parseRtfStyle } from '../src/shared/pro/rtf';

const b64 = (s: string): string => Buffer.from(s, 'latin1').toString('base64');
const rtf = (text: string): string =>
  `{\\rtf1\\ansi\\ansicpg1252\\cocoartf1038\n{\\fonttbl\\f0\\fswiss\\fcharset0 Futura-Bold;}\n{\\colortbl;\\red255\\green255\\blue0;}\n\\pard\\qc\\f0\\fs96 \\cf1 ${text}}`;

// Minimal documents shaped like the real ones (see tools/SCHEMAS.md for formats).
const PRO6 = `<?xml version="1.0" encoding="utf-8"?>
<RVPresentationDocument height="768" width="1024" versionNumber="600" CCLISongTitle="Test Song" CCLIAuthor="A. Writer" CCLICopyrightYear="1999" CCLISongNumber="12345" CCLIDisplay="true" selectedArrangementID="ARR-1">
  <array rvXMLIvarName="groups">
    <RVSlideGrouping name="Verse 1" uuid="g-verse" color="0 0 1 1">
      <array rvXMLIvarName="slides">
        <RVDisplaySlide UUID="s-1" label="Intro" enabled="true">
          <RVMediaCue rvXMLIvarName="backgroundMediaCue" UUID="m-1" behavior="1">
            <RVVideoElement rvXMLIvarName="element" source="file:///Users/old/Movies/Loop%20One.mov" scaleBehavior="2" playbackBehavior="1"/>
          </RVMediaCue>
          <array rvXMLIvarName="displayElements">
            <RVTextElement UUID="t-1"><RVRect3D rvXMLIvarName="position">{10 20 0 900 600}</RVRect3D><NSString rvXMLIvarName="RTFData">${b64(rtf('Line one\\\nLine two'))}</NSString></RVTextElement>
            <RVImageElement UUID="i-1" source="file:///Users/old/logo.png" opacity="0.5" rotation="10" scaleBehavior="0"><RVRect3D rvXMLIvarName="position">{800 40 0 200 100}</RVRect3D></RVImageElement>
            <RVShapeElement UUID="sh-1" fillColor="0 0 0 0.5" drawingFill="true"><RVRect3D rvXMLIvarName="position">{0 600 0 1024 168}</RVRect3D></RVShapeElement>
            <RVHTMLElement UUID="w-1"/>
          </array>
        </RVDisplaySlide>
        <RVDisplaySlide UUID="s-2" enabled="false">
          <array rvXMLIvarName="displayElements">
            <RVTextElement><NSString rvXMLIvarName="PlainText">${b64('Plain only')}</NSString></RVTextElement>
          </array>
        </RVDisplaySlide>
      </array>
    </RVSlideGrouping>
    <RVSlideGrouping name="Chorus" uuid="g-chorus" color="1 0 0 1">
      <array rvXMLIvarName="slides">
        <RVDisplaySlide UUID="s-1"><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="RTFData">${b64(rtf('Chorus'))}</NSString></RVTextElement></array></RVDisplaySlide>
      </array>
    </RVSlideGrouping>
  </array>
  <array rvXMLIvarName="arrangements">
    <RVSongArrangement name="Short" uuid="arr-1"><array rvXMLIvarName="groupIDs"><NSString>g-chorus</NSString><NSString>g-verse</NSString><NSString>g-chorus</NSString><NSString>missing</NSString></array></RVSongArrangement>
  </array>
</RVPresentationDocument>`;

const PRO5 = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="500" CCLISongTitle="Old Song" CCLICopyrightInfo="1985">
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping name="Verse" uuid="aa-1" color="0.5 0.5 0.5 1" serialization-array-index="0">
      <slides containerClass="NSMutableArray">
        <RVDisplaySlide UUID="bb-1" enabled="1" label="" serialization-array-index="0">
          <cues containerClass="NSMutableArray">
            <RVMediaCue elementClassName="RVImageElement" serialization-array-index="0"><element source="file:///Users/old/Pictures/bg.jpg" scaleBehavior="3"/></RVMediaCue>
          </cues>
          <displayElements containerClass="NSMutableArray">
            <RVTextElement RTFData="${b64(rtf('Pro five text'))}" serialization-array-index="0"><_-RVRect3D-_position x="100" y="50" z="0" width="1700" height="900"/></RVTextElement>
          </displayElements>
        </RVDisplaySlide>
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray">
    <RVSongArrangement name="Main" uuid="cc-1"><groupIDs containerClass="NSMutableArray"><NSMutableString serialization-native-value="aa-1" serialization-array-index="0"/></groupIDs></RVSongArrangement>
  </arrangements>
</RVPresentationDocument>`;

describe('ProPresenter 6 import', () => {
  const resolve = (p: string): string | null => (p.endsWith('.mov') || p.endsWith('.png') ? `/Users/me/Imported/${basename(p)}` : null);
  const { presentation, report } = convertLegacyPresentation(PRO6, { name: 'Test Song', resolveMedia: resolve });
  // Round-trip through the .pro format to be sure what we build is valid.
  const saved = parsePresentation(serializePresentation(presentation));
  const deck = presentationToDeck(saved, 'd');

  it('keeps groups, colours, slides, labels and enabled state', () => {
    expect(deck.groups.map((g) => [g.name, g.colorHex, g.slides.map((s) => s.text)])).toEqual([
      ['Verse 1', '#0000ff', ['Line one\nLine two', 'Plain only']],
      ['Chorus', '#ff0000', ['Chorus']]
    ]);
    expect(saved.cues.map((c) => [c.name, c.isEnabled])).toEqual([
      ['Intro', true],
      ['', false],
      ['', true]
    ]);
  });

  it('keeps RTF styling, text box positions and slide size', () => {
    const slide = slideOfCue(saved.cues[0])!;
    expect(slide.size).toMatchObject({ width: 1024, height: 768 });
    const el = textElements(slide)[0].element!;
    expect(el.bounds).toMatchObject({ origin: { x: 10, y: 20 }, size: { width: 900, height: 600 } });
    expect(parseRtfStyle(el.text!.rtfData!)).toEqual({ font: 'Futura-Bold', sizePt: 48, color: [255, 255, 0], align: 'center' });
  });

  it('maps backgrounds through the resolver and reports what it could not import', () => {
    expect(backgroundOfCue(saved.cues[0])).toEqual({ path: '/Users/me/Imported/Loop One.mov', kind: 'video', loop: true, scale: 'stretch' });
    expect(report).toEqual({ version: 6, groups: 2, slides: 3, arrangements: 1, backgrounds: 1, images: 1, missingMedia: [], skipped: { HTMLElement: 1 } });
  });

  it('keeps pictures and shapes on the slide, front-to-back order reversed for drawing, with opacity and rotation', () => {
    const layout = presentationToDeck(saved, 'd').groups[0].slides[0].layout; // Verse 1, slide 1 (play order starts with the Chorus)
    // The file lists text, picture, shape (front first), so the text draws last, on top.
    expect(layout.boxes.map((b) => b.z)).toEqual([2]);
    expect(layout.graphics).toMatchObject([
      { z: 0, kind: 'shape', shape: 'rectangle', fill: 'rgba(0, 0, 0, 0.5)', x: 0, y: 600, width: 1024, height: 168 },
      { z: 1, kind: 'image', path: '/Users/me/Imported/logo.png', x: 800, y: 40, width: 200, height: 100, opacity: 0.5, rotation: 10, scale: 'fit' }
    ]);
  });

  it('keeps arrangements, the selected one, and makes duplicate ids unique', () => {
    expect(deck.arrangementName).toBe('Short');
    expect(deck.slides.map((s) => s.groupName)).toEqual(['Chorus', 'Verse 1', 'Verse 1', 'Chorus']);
    expect(new Set(saved.cues.map((c) => c.uuid!.string)).size).toBe(3);
  });

  it('keeps CCLI details', () => {
    expect(saved.ccli).toMatchObject({ songTitle: 'Test Song', author: 'A. Writer', copyrightYear: 1999, songNumber: 12345, display: true });
  });
});

describe('ProPresenter 5 import', () => {
  const { presentation, report } = convertLegacyPresentation(PRO5, { name: 'Old', resolveMedia: () => null });
  const deck = presentationToDeck(parsePresentation(serializePresentation(presentation)), 'd');

  it('reads attribute-style RTF, positions, groups and arrangements', () => {
    expect(deck.groups.map((g) => [g.name, g.slides.map((s) => s.text)])).toEqual([['Verse', ['Pro five text']]]);
    expect(textElements(slideOfCue(presentation.cues[0]))[0].element!.bounds).toMatchObject({ origin: { x: 100, y: 50 } });
    expect(deck.arrangements.map((a) => a.name)).toEqual(['Main']);
    expect(presentation.ccli?.copyrightYear).toBe(1985);
  });

  it('reports backgrounds whose files are missing instead of linking dead paths', () => {
    expect(deck.slides[0].background).toBeUndefined();
    expect(report.missingMedia).toEqual(['bg.jpg']);
  });
});

// Real files: VESSEL_LEGACY_FIXTURES=/path/a.pro5,/path/b.pro6 npm test
const fixtures = (process.env.VESSEL_LEGACY_FIXTURES ?? '').split(',').filter(Boolean);
describe.skipIf(fixtures.length === 0)('real ProPresenter 5/6 files', () => {
  for (const file of fixtures) {
    it(`imports ${basename(file)}`, () => {
      const { presentation, report } = convertLegacyPresentation(readFileSync(file, 'utf8'), { name: basename(file) });
      const deck = presentationToDeck(parsePresentation(serializePresentation(presentation)), 'd');
      console.log(basename(file), JSON.stringify(report), 'slides with text:', deck.slides.filter((s) => s.text.trim()).length);
      expect(report.slides).toBeGreaterThan(0);
      expect(deck.slides.length).toBeGreaterThan(0);
    });
  }
});
