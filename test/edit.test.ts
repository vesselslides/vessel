import { describe, expect, it } from 'vitest';
import {
  addArrangement,
  addGroup,
  addSlide,
  deleteArrangement,
  deleteGroup,
  deleteSlide,
  duplicateSlide,
  moveGroup,
  moveSlide,
  renameGroup,
  selectArrangement,
  setArrangementGroups,
  setGroupColor,
  setSlideText
} from '../src/shared/pro/edit';
import {
  createPresentation,
  parseLyrics,
  parsePresentation,
  presentationToDeck,
  serializePresentation,
  slideOfCue,
  textElements
} from '../src/shared/pro/presentation';
import { parseRtfStyle, plainTextToRtf, rtfToPlainText } from '../src/shared/pro/rtf';

const song = () => createPresentation('Song', parseLyrics('[Verse]\nV1\n\nV2\n\n[Chorus]\nC1'));
const deck = (p: ReturnType<typeof song>) => presentationToDeck(p, 'd');
const texts = (p: ReturnType<typeof song>) => deck(p).groups.map((g) => [g.name, g.slides.map((s) => s.text)]);

describe('slide edits', () => {
  it('changes slide text without touching the original', () => {
    const p = song();
    const cueId = deck(p).groups[0].slides[1].cueId;
    const edited = setSlideText(p, cueId, 'New\nText');
    expect(texts(edited)).toEqual([['Verse', ['V1', 'New\nText']], ['Chorus', ['C1']]]);
    expect(texts(p)).toEqual([['Verse', ['V1', 'V2']], ['Chorus', ['C1']]]);
  });

  it('keeps the existing font, size, colour and alignment', () => {
    const p = song();
    const cue = p.cues[0];
    const el = textElements(slideOfCue(cue))[0];
    el.element!.text!.rtfData = plainTextToRtf('V1', { font: 'Montserrat-Bold', sizePt: 96, color: [250, 200, 10], align: 'left' });
    const edited = setSlideText(p, cue.uuid!.string, 'Changed');
    const rtf = textElements(slideOfCue(edited.cues[0]))[0].element!.text!.rtfData!;
    expect(rtfToPlainText(rtf)).toBe('Changed');
    expect(parseRtfStyle(rtf)).toEqual({ font: 'Montserrat-Bold', sizePt: 96, color: [250, 200, 10], align: 'left' });
  });

  it('adds a slide after another and copies its styling', () => {
    const p = song();
    const verse = deck(p).groups[0];
    const { presentation, cueId } = addSlide(p, verse.id, 'Inserted', verse.slides[0].cueId);
    expect(texts(presentation)[0]).toEqual(['Verse', ['V1', 'Inserted', 'V2']]);
    expect(deck(presentation).groups[0].slides[1].cueId).toBe(cueId);
  });

  it('duplicates and deletes slides, pruning orphaned cues', () => {
    const p = song();
    const verse = deck(p).groups[0];
    const dup = duplicateSlide(p, verse.id, verse.slides[0].cueId);
    expect(texts(dup)[0]).toEqual(['Verse', ['V1', 'V1', 'V2']]);
    expect(new Set(dup.cues.map((c) => c.uuid!.string)).size).toBe(4);
    const del = deleteSlide(dup, verse.id, verse.slides[0].cueId);
    expect(texts(del)[0]).toEqual(['Verse', ['V1', 'V2']]);
    expect(del.cues).toHaveLength(3);
  });

  it('moves slides within and between groups', () => {
    const p = song();
    const [verse, chorus] = deck(p).groups;
    const within = moveSlide(p, verse.id, verse.slides[0].cueId, verse.id, 2);
    expect(texts(within)[0]).toEqual(['Verse', ['V2', 'V1']]);
    const across = moveSlide(p, verse.id, verse.slides[1].cueId, chorus.id, 0);
    expect(texts(across)).toEqual([['Verse', ['V1']], ['Chorus', ['V2', 'C1']]]);
  });
});

describe('group edits', () => {
  it('adds, renames, recolours, moves and deletes groups', () => {
    let p = song();
    const added = addGroup(p, 'Bridge');
    p = renameGroup(added.presentation, added.groupId, 'Bridge 2');
    p = setGroupColor(p, added.groupId, '#ff8000');
    p = moveGroup(p, added.groupId, 0);
    const d = deck(p);
    expect(d.groups.map((g) => g.name)).toEqual(['Bridge 2', 'Verse', 'Chorus']);
    expect(d.groups[0].colorHex).toBe('#ff8000');
    p = deleteGroup(p, added.groupId);
    expect(deck(p).groups.map((g) => g.name)).toEqual(['Verse', 'Chorus']);
    expect(p.cues).toHaveLength(3);
  });
});

describe('arrangements', () => {
  it('plays groups in arrangement order, with repeats, and survives saving', () => {
    const p = song();
    const [verse, chorus] = deck(p).groups;
    const { presentation, arrangementId } = addArrangement(p, 'Sunday');
    let q = setArrangementGroups(presentation, arrangementId, [chorus.id, verse.id, chorus.id]);
    q = parsePresentation(serializePresentation(q));
    const d = deck(q);
    expect(d.arrangementName).toBe('Sunday');
    expect(d.slides.map((s) => s.text)).toEqual(['C1', 'V1', 'V2', 'C1']);
    expect(new Set(d.slides.map((s) => s.id)).size).toBe(4);

    expect(deck(selectArrangement(q, undefined)).slides.map((s) => s.text)).toEqual(['V1', 'V2', 'C1']);
    expect(deck(deleteGroup(q, chorus.id)).slides.map((s) => s.text)).toEqual(['V1', 'V2']);
    const removed = deleteArrangement(q, arrangementId);
    expect(deck(removed).arrangements).toHaveLength(0);
    expect(deck(removed).selectedArrangementId).toBeUndefined();
  });
});
