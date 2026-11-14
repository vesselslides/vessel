// Chords: reading chord sheets, keeping chords on the words (in the file, the
// way ProPresenter stores them), transposing, numbers and capo shapes.
import { describe, expect, it } from 'vitest';
import {
  capoShape,
  chordNumber,
  chordSheetLines,
  chordSheetToInline,
  chordsInKey,
  guessKey,
  inlineToChordSheet,
  joinInline,
  prettyChord,
  remapChords,
  splitInline,
  transposeChord,
  transposeKey
} from '../src/shared/chords';
import { DEFAULT_LYRICS_OPTIONS, lyricsToPresentation, tidyLyrics } from '../src/shared/import/lyrics';
import { applyLyrics, applyTheme, presentationToLyrics, setSlideText, setSongKey, splitSlide } from '../src/shared/pro/edit';
import { createPresentation, parsePresentation, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { BUILT_IN_THEMES } from '../src/shared/theme';

const SHEET = `[Verse 1]
G       G7         C         G
Amazing grace, how sweet the sound
G            D
That saved a wretch like me

[Chorus]
Intro: G  C  G
C     G
My chains are gone`;

describe('chord sheets', () => {
  it('puts each chord on the letter under it, and leaves out chord lines with no words', () => {
    const { text, instrumentalLines } = chordSheetToInline('G       G7         C         G\nAmazing grace, how sweet the sound\n\nG  C  D\n\nC     G\nMy chains are gone');
    expect(text).toBe('[G]Amazing [G7]grace, how [C]sweet the [G]sound\n\n\n[C]My cha[G]ins are gone');
    expect(instrumentalLines).toBe(1);
  });

  it('splits words from chords and puts them back', () => {
    const s = splitInline('[G]Amazing [G7]grace [Chorus]');
    expect(s).toEqual({ text: 'Amazing grace [Chorus]', chords: [{ at: 0, chord: 'G' }, { at: 8, chord: 'G7' }] });
    expect(joinInline(s.text, s.chords)).toBe('[G]Amazing [G7]grace [Chorus]');
  });

  it('writes chords above the words again, for the full-song editor', () => {
    expect(inlineToChordSheet('[G]Amazing [G7]grace\n[Chorus]')).toBe('G       G7\nAmazing grace\n[Chorus]');
  });

  it('lines a slide up as a chord sheet for the presenter remote', () => {
    expect(chordSheetLines('Amazing grace\nHow sweet', [{ at: 0, chord: 'Bb' }, { at: 8, chord: 'F#m' }])).toEqual([
      { chords: 'B♭      F♯m', words: 'Amazing grace' },
      { chords: '', words: 'How sweet' }
    ]);
  });

  it('keeps chords on their words when the words change', () => {
    const chords = [{ at: 0, chord: 'G' }, { at: 8, chord: 'D' }, { at: 14, chord: 'C' }];
    // "grace" became "mercy": its chord stays on the new word; what follows moves along.
    expect(remapChords('Amazing grace, sweet', 'Amazing mercy!, sweet', chords)).toEqual([{ at: 0, chord: 'G' }, { at: 8, chord: 'D' }, { at: 15, chord: 'C' }]);
    // A deleted word takes its chord with it.
    expect(remapChords('Amazing grace sweet', 'Amazing sweet', [{ at: 8, chord: 'D' }, { at: 14, chord: 'C' }])).toEqual([{ at: 8, chord: 'C' }]);
  });
});

describe('keys and transposing', () => {
  it('moves chords, spelling sharps and flats for the key', () => {
    expect(transposeChord('G', 2, 'A')).toBe('A');
    expect(transposeChord('D/F#', 3, 'F')).toBe('F/A');
    expect(transposeChord('Em7', 3, 'Bb')).toBe('Gm7');
    expect(transposeChord('C', 1, 'Db')).toBe('Db');
    expect(transposeChord('Bbmaj7', 2, 'D')).toBe('Cmaj7');
    expect(transposeChord('F#m7b5', -1, 'F')).toBe('Fm7b5');
    expect(transposeKey('G', 2)).toBe('A');
    expect(transposeKey('Em', -1)).toBe('Ebm');
  });

  it('shows chords in the key the song is played in', () => {
    expect(chordsInKey([{ at: 0, chord: 'G' }, { at: 3, chord: 'D/F#' }], { written: 'G', play: 'A' })).toEqual([{ at: 0, chord: 'A' }, { at: 3, chord: 'E/G#' }]);
  });

  it('guesses the key', () => {
    expect(guessKey(['G', 'C', 'D', 'G'])).toBe('G');
    expect(guessKey(['Am', 'F', 'C', 'G'])).toBe('Am');
    expect(guessKey(['Bb', 'Eb', 'F', 'Bb'])).toBe('Bb');
  });

  it('writes Nashville numbers and capo shapes', () => {
    expect(['G', 'C', 'D', 'Em7', 'C/E'].map((c) => chordNumber(c, 'G'))).toEqual(['1', '4', '5', '6m7', '4/6']);
    expect(['A', 'D', 'E'].map((c) => capoShape(c, 2, 'A'))).toEqual(['G', 'C', 'D']);
    expect(prettyChord('Bb/F#')).toBe('B♭/F♯');
  });
});

describe('chords in songs', () => {
  it('keeps chords from an imported chord sheet off the words, with the key', () => {
    const { presentation, report } = lyricsToPresentation('Amazing Grace', SHEET, DEFAULT_LYRICS_OPTIONS);
    expect(report).toMatchObject({ chords: 8, key: 'G', removedChordLines: 1 }); // the intro line
    const deck = presentationToDeck(parsePresentation(serializePresentation(presentation)), 'd');
    expect(deck.key).toEqual({ written: 'G', play: 'G' });
    const first = deck.slides[0];
    expect(first.text).toBe('Amazing grace, how sweet the sound\nThat saved a wretch like me');
    expect(joinInline(first.text, first.chords)).toBe('[G]Amazing [G7]grace, how [C]sweet the [G]sound\n[G]That saved a [D]wretch like me');
  });

  it('leaves chords out when asked to', () => {
    const { presentation, report } = lyricsToPresentation('Amazing Grace', SHEET, { ...DEFAULT_LYRICS_OPTIONS, keepChords: false });
    expect(report.chords).toBe(0);
    expect(presentationToDeck(presentation, 'd').slides.every((s) => !s.chords)).toBe(true);
  });

  it('keeps chords through text edits, themes and splitting', () => {
    const song = createPresentation('Song', [{ group: 'Verse', slides: ['[G]Amazing [D]grace'] }]);
    const cueId = presentationToDeck(song, 'd').slides[0].cueId;
    const chords = (p: typeof song) => presentationToDeck(p, 'd').slides.map((s) => joinInline(s.text, s.chords));
    expect(chords(setSlideText(song, cueId, 'Amazing grace!'))).toEqual(['[G]Amazing [D]grace!']);
    expect(chords(setSlideText(song, cueId, '[C]Amazing grace', true))).toEqual(['[C]Amazing grace']);
    expect(chords(applyTheme(song, BUILT_IN_THEMES[1]))).toEqual(['[G]Amazing [D]grace']);
    const groupId = presentationToDeck(song, 'd').groups[0].id;
    expect(chords(splitSlide(song, groupId, cueId, 'Amazing ', 'grace'))).toEqual(['[G]Amazing', '[D]grace']);
  });

  it('edits the whole song with chords, and keeps them when edited without', () => {
    const song = createPresentation('Song', [{ group: 'Verse', slides: ['[G]Amazing [D]grace'] }]);
    expect(presentationToLyrics(song, true)).toBe('[Verse]\n[G]Amazing [D]grace');
    const plain = presentationToLyrics(applyLyrics(song, '[Verse]\nAmazing grace\n\nHow sweet', 0), true);
    expect(plain).toBe('[Verse]\n[G]Amazing [D]grace\n\nHow sweet');
    expect(presentationToLyrics(applyLyrics(song, '[Verse]\n[A]Amazing [E]grace', 0, true), true)).toBe('[Verse]\n[A]Amazing [E]grace');
  });

  it('stores the key where ProPresenter keeps it', () => {
    const p = parsePresentation(serializePresentation(setSongKey(createPresentation('S', []), { written: 'G', play: 'Bb' })));
    expect(p.music).toMatchObject({ originalMusicKey: 'G', userMusicKey: 'Bb', original: { musicKey: 19 }, user: { musicKey: 3 } });
    expect(presentationToDeck(p, 'd').key).toEqual({ written: 'G', play: 'Bb' });
  });

  it('tidies pasted lyrics keeping chords on the words', () => {
    expect(tidyLyrics('Verse 1:\nG       D\nAmazing grace', true).text).toBe('[Verse 1]\n[G]Amazing [D]grace');
  });
});
