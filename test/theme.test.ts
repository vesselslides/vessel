import { describe, expect, it } from 'vitest';
import { cssFont } from '../src/shared/fonts';
import { addGroup, addSlide, applyTheme, setSlideText } from '../src/shared/pro/edit';
import {
  createPresentation,
  layoutOfCue,
  parseLyrics,
  parsePresentation,
  presentationToDeck,
  serializePresentation,
  slideCue,
  slideOfCue,
  textElement
} from '../src/shared/pro/presentation';
import { parseRtfStyle, plainTextToRtf } from '../src/shared/pro/rtf';
import { BUILT_IN_THEMES, duplicateTheme } from '../src/shared/theme';

const theme = (id: string) => BUILT_IN_THEMES.find((t) => t.id === id)!;
const song = () => createPresentation('Song', parseLyrics('[Verse]\nAmazing grace\n\nHow sweet\n\n[Chorus]\nMy chains'));
const roundTrip = <T extends ReturnType<typeof song>>(p: T) => parsePresentation(serializePresentation(p));

describe('RTF style', () => {
  it('follows \\f and \\cf references instead of taking the first table entries', () => {
    const rtf =
      '{\\rtf1\\ansi{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;\\f1\\fnil\\fcharset0 Futura-Bold;}\n' +
      '{\\colortbl;\\red255\\green255\\blue255;\\red250\\green200\\blue10;}\n\\pard\\qr\\f1\\b\\i\\fs120 \\cf2 Hello}';
    expect(parseRtfStyle(rtf)).toEqual({ font: 'Futura-Bold', sizePt: 60, color: [250, 200, 10], align: 'right', bold: true, italic: true });
  });

  it('writes bold and italic', () => {
    const style = parseRtfStyle(plainTextToRtf('x', { font: 'Georgia', sizePt: 50, color: [1, 2, 3], align: 'left', bold: true, italic: true }));
    expect(style).toEqual({ font: 'Georgia', sizePt: 50, color: [1, 2, 3], align: 'left', bold: true, italic: true });
  });
});

describe('font names', () => {
  it('maps PostScript names to CSS families, weights and styles', () => {
    expect(cssFont('Futura-Bold')).toMatchObject({ weight: 700, italic: false });
    expect(cssFont('Futura-Bold').family.startsWith('"Futura-Bold", "Futura"')).toBe(true);
    expect(cssFont('HelveticaNeue-CondensedBlack')).toMatchObject({ weight: 900 });
    expect(cssFont('HelveticaNeue-CondensedBlack').family).toContain('"Helvetica Neue"');
    expect(cssFont('Montserrat-SemiBoldItalic')).toMatchObject({ weight: 600, italic: true });
    expect(cssFont('Georgia').family).toContain('serif');
    expect(cssFont('Avenir Next', true)).toMatchObject({ weight: 700 });
    expect(cssFont('Some-Thing')).toMatchObject({ weight: 400 });
    expect(cssFont('Some-Thing').family.startsWith('"Some-Thing"')).toBe(true);
  });
});

describe('slide layout', () => {
  it('reads boxes, positions and styles from slides', () => {
    const layout = layoutOfCue(song().cues[0]);
    expect(layout).toMatchObject({ width: 1920, height: 1080 });
    expect(layout.boxes).toHaveLength(1);
    expect(layout.boxes[0]).toMatchObject({ x: 96, y: 96, text: 'Amazing grace', align: 'center', valign: 'middle', shrink: true, uppercase: false });
  });

  it('reads every text box on multi-box slides', () => {
    const cue = slideCue([textElement(plainTextToRtf('Top'), { x: 0, y: 0, width: 1920, height: 200 }), textElement(plainTextToRtf('Bottom'), { x: 0, y: 880, width: 1920, height: 200 })]);
    expect(layoutOfCue(cue).boxes.map((b) => [b.text, b.y])).toEqual([
      ['Top', 0],
      ['Bottom', 880]
    ]);
  });
});

describe('themes', () => {
  it('restyles every slide, keeps the text, and survives saving', () => {
    const p = roundTrip(applyTheme(song(), theme('bold-caps')));
    const slides = presentationToDeck(p, 'd').slides;
    expect(slides.map((s) => s.text)).toEqual(['Amazing grace', 'How sweet', 'My chains']);
    const box = slides[0].layout.boxes[0];
    expect(box).toMatchObject({ font: 'Avenir Next', bold: true, sizePt: 96, color: 'rgb(255, 255, 255)', uppercase: true, shadow: true, valign: 'middle', shrink: true });
    expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([115, 108, 1690, 864]);
  });

  it('writes ProPresenter text attributes too', () => {
    const text = slideOfCue(applyTheme(song(), theme('outline')).cues[0])!.elements[0].element!.text!;
    expect(text.attributes?.font).toMatchObject({ name: 'Arial Black', size: 84 });
    expect(text.attributes?.strokeWidth).toBe(4);
    expect(text.shadow?.enable).toBe(false);
    expect(layoutOfCue(applyTheme(song(), theme('outline')).cues[0]).boxes[0].outline).toEqual({ width: 4, color: 'rgba(0, 0, 0, 1)' });
  });

  it('scales size and box to the slide, and leaves multi-box layouts in place', () => {
    const p = song();
    p.cues.push(slideCue([textElement(plainTextToRtf('A'), { x: 10, y: 10, width: 500, height: 100 }), textElement(plainTextToRtf('B'), { x: 10, y: 600, width: 500, height: 100 })], { width: 1024, height: 768 }));
    const themed = applyTheme(p, theme('lower-third'));
    const multi = layoutOfCue(themed.cues[3]);
    expect(multi.boxes.map((b) => [b.text, b.x, b.y, b.width])).toEqual([
      ['A', 10, 10, 500],
      ['B', 10, 600, 500]
    ]);
    // RTF stores sizes in half points, so 42.67pt is saved as 42.5pt.
    expect(Math.abs(multi.boxes[0].sizePt - 60 * (768 / 1080))).toBeLessThanOrEqual(0.25);
    expect(multi.boxes[0].valign).toBe('bottom');
  });

  it('can be limited to some slides', () => {
    const p = song();
    const themed = applyTheme(p, theme('scripture'), [p.cues[1].uuid!.string]);
    expect(presentationToDeck(themed, 'd').slides.map((s) => s.layout.boxes[0].font)).toEqual(['Helvetica', 'Georgia', 'Helvetica']);
  });

  it('carries over to slides added and edited later', () => {
    const themed = applyTheme(song(), theme('bold-caps'));
    const deck = presentationToDeck(themed, 'd');
    const added = addSlide(themed, deck.groups[0].id, 'New line').presentation;
    const grouped = addGroup(added, 'Bridge').presentation;
    const edited = setSlideText(grouped, deck.groups[1].slides[0].cueId, 'Changed');
    const slides = presentationToDeck(edited, 'd').slides;
    for (const s of slides) expect(s.layout.boxes[0]).toMatchObject({ font: 'Avenir Next', uppercase: true, shadow: true, sizePt: 96 });
    expect(slides.map((s) => s.text)).toEqual(['Amazing grace', 'How sweet', 'New line', 'Changed', '']);
  });

  it('duplicates built-ins as editable custom themes', () => {
    const copy = duplicateTheme(theme('classic'));
    expect(copy.builtIn).toBeUndefined();
    expect(copy.id).not.toBe('classic');
    copy.box.x = 0.5;
    expect(theme('classic').box.x).toBe(0.05);
  });
});
