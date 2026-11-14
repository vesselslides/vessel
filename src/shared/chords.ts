// Chords: read from chord sheets, kept on the letter of the words they're
// played over, transposed, and shown as letters or Nashville numbers.
//
// Inside Vessel a slide's words with chords are written ChordPro style, each
// chord in brackets just before the letter it's played on:
// "[G]Amazing [G7]grace". The audience only ever sees the words.

/** A chord on the character at `at` of a slide's text. */
export interface ChordMark {
  at: number;
  chord: string;
}

/** A song's key as written (the chords stored) and as it's played (what's shown). */
export interface SongKey {
  written: string;
  play: string;
}

const CHORD = /^[A-G](?:#|b|♯|♭)?(?:maj|min|m|M|sus|dim|aug|add|°|ø|\+)?\d*(?:(?:sus|add|maj|b|#|-)\d+)*(?:\/[A-G](?:#|b|♯|♭)?)?$/;

/** A chord name like "G", "F#m7", "Dsus4", "C/E" or "Bbmaj7". */
export const isChord = (token: string): boolean => CHORD.test(token.replace(/^\(|\)$/g, ''));

/** A line made only of chords (and bar lines or repeat marks), as in a chord chart; "Intro: G C D" counts too. */
export function isChordLine(line: string): boolean {
  const played = /^\s*(?:intro|outro|instrumental|interlude|turnaround|tag|ending|riff|vamp)\b[^:]{0,12}:\s*(.*)$/i.exec(line);
  const tokens = (played ? played[1] : line).trim().split(/\s+/).filter(Boolean);
  return tokens.some((t) => isChord(t)) && tokens.every((t) => isChord(t) || /^[|/\-–.]+$/.test(t) || /^[x×]\d$/i.test(t));
}

const INLINE = /\[([^\]\s]{1,16})\]/g;

/** Words with chords in brackets → the words alone and where each chord sits. Brackets that aren't chords ("[Chorus]") stay. */
export function splitInline(line: string): { text: string; chords: ChordMark[] } {
  const chords: ChordMark[] = [];
  let text = '';
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    if (!isChord(m[1])) continue;
    text += line.slice(last, m.index);
    chords.push({ at: text.length, chord: m[1] });
    last = m.index! + m[0].length;
  }
  return { text: text + line.slice(last), chords };
}

/** The words with each chord written in brackets where it's played. */
export function joinInline(text: string, chords: ChordMark[] | undefined): string {
  if (!chords?.length) return text;
  let out = '';
  let from = 0;
  for (const c of [...chords].sort((a, b) => a.at - b.at)) {
    const at = Math.max(from, Math.min(c.at, text.length));
    out += `${text.slice(from, at)}[${c.chord}]`;
    from = at;
  }
  return out + text.slice(from);
}

/** Does this text have chords in it, either above the words or in brackets? */
export function hasChords(text: string): boolean {
  return text.split('\n').some((l) => isChordLine(l) || splitInline(l).chords.length > 0);
}

/**
 * A chord sheet (chords on their own line above the words) as words with
 * chords in brackets. A chord line with no words under it (an intro or
 * instrumental) is left out; brackets already in the text are kept.
 */
export function chordSheetToInline(sheet: string, isLabel: (line: string) => boolean = () => false): { text: string; instrumentalLines: number } {
  const lines = sheet.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out: string[] = [];
  let instrumentalLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isChordLine(line)) {
      out.push(line);
      continue;
    }
    const words = lines[i + 1];
    if (words === undefined || !words.trim() || isChordLine(words) || /^\s*[[{].*[\]}]\s*$/.test(words) || isLabel(words)) {
      instrumentalLines++;
      continue;
    }
    // Each chord goes on the letter under its first character (counting the words alone, if they have [G] chords already).
    const below = splitInline(words);
    const above = [...line.matchAll(/\S+/g)].filter((m) => isChord(m[0])).map((m) => ({ at: Math.min(m.index!, below.text.length), chord: m[0].replace(/^\(|\)$/g, '') }));
    out.push(joinInline(below.text, [...below.chords, ...above]));
    i++;
  }
  return { text: out.join('\n'), instrumentalLines };
}

/** A line of chords to sit above `words`, each over its letter (for a monospaced font); later chords move along so none run together. */
function chordsAbove(chords: ChordMark[]): string {
  let above = '';
  for (const c of chords) above = above.padEnd(Math.max(c.at, above.length ? above.length + 1 : 0)) + c.chord;
  return above;
}

/** Words with chords in brackets, as a chord sheet: each chord on a line above its word (for a monospaced font). */
export function inlineToChordSheet(text: string): string {
  return text
    .split('\n')
    .flatMap((line) => {
      const { text: words, chords } = splitInline(line);
      return chords.length ? [chordsAbove(chords), words] : [line];
    })
    .join('\n');
}

/** A slide's lines, each with the chords above it ('' where it has none), for showing as a chord sheet. */
export function chordSheetLines(text: string, chords: ChordMark[]): Array<{ chords: string; words: string }> {
  let start = 0;
  return text.split('\n').map((words) => {
    const here = chords.filter((c) => c.at >= start && c.at <= start + words.length).map((c) => ({ at: c.at - start, chord: prettyChord(c.chord) }));
    start += words.length + 1;
    return { chords: chordsAbove(here), words };
  });
}

/** Where chords go when a slide's words change: they keep their place in what stayed, and leave with what was deleted. */
export function remapChords(oldText: string, newText: string, chords: ChordMark[]): ChordMark[] {
  if (!chords.length || oldText === newText) return chords;
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;
  let end = 0;
  while (end < oldText.length - start && end < newText.length - start && oldText[oldText.length - 1 - end] === newText[newText.length - 1 - end]) end++;
  const oldChanged = oldText.length - start - end;
  const newChanged = newText.length - start - end;
  return chords.flatMap((c) => {
    if (c.at < start) return [c];
    if (c.at >= start + oldChanged) return [{ ...c, at: c.at + newChanged - oldChanged }];
    // In the part that changed: kept on the replacement, gone with a deletion.
    return newChanged > 0 ? [{ ...c, at: Math.min(c.at, start + newChanged - 1) }] : [];
  });
}

// ---- Notes, keys and transposing -------------------------------------------

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** For C and A minor: how chord charts usually spell the black notes. */
const NEUTRAL = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The keys offered when choosing one, spelled as most charts do. */
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** 0–11 for a note name ("C" 0, "F#" 6, "Bb" 10), or -1. */
export function noteIndex(note: string): number {
  const m = /^([A-G])(#|b|♯|♭)?/.exec(note.trim());
  if (!m) return -1;
  const shift = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return (LETTER[m[1]] + shift + 12) % 12;
}

const isMinorKey = (key: string): boolean => /^[A-G](?:#|b|♯|♭)?m$/.test(key.trim());

/** How notes are spelled in a key: flats for F, Bb, Eb… sharps for G, D, A… */
function spelling(key: string): string[] {
  const i = noteIndex(key);
  if (i < 0) return NEUTRAL;
  // A key written with a sharp or flat spells that way; otherwise a minor key spells like its relative major.
  const accidental = key.trim().slice(1, 2);
  if (accidental === '#' || accidental === '♯') return SHARPS;
  if (accidental === 'b' || accidental === '♭') return FLATS;
  const major = isMinorKey(key) ? (i + 3) % 12 : i;
  if (major === 0) return NEUTRAL;
  return [5, 10, 3, 8, 1].includes(major) ? FLATS : SHARPS;
}

/** Move a chord by `semitones`, spelling its notes for `key` (the key it ends up in). */
export function transposeChord(chord: string, semitones: number, key: string): string {
  const names = spelling(key);
  const move = (note: string): string => {
    const i = noteIndex(note);
    return i < 0 ? note : names[(i + semitones + 1200) % 12];
  };
  const m = /^([A-G](?:#|b|♯|♭)?)(.*?)(?:\/([A-G](?:#|b|♯|♭)?))?$/.exec(chord);
  if (!m) return chord;
  return `${move(m[1])}${m[2]}${m[3] ? `/${move(m[3])}` : ''}`;
}

/** Semitones up from one key to another (0–11). */
export function semitonesBetween(from: string, to: string): number {
  const a = noteIndex(from);
  const b = noteIndex(to);
  return a < 0 || b < 0 ? 0 : (b - a + 12) % 12;
}

/** A key moved up or down, keeping major or minor ("G" +2 → "A", "Em" -1 → "Ebm"). */
export function transposeKey(key: string, semitones: number): string {
  const i = noteIndex(key);
  if (i < 0) return key;
  const minor = isMinorKey(key);
  const root = KEYS[(i + semitones + 1200) % 12];
  return minor ? `${root}m` : root;
}

/** Chords as played: from the written key to the play key. */
export function chordsInKey(chords: ChordMark[], key: SongKey | undefined): ChordMark[] {
  if (!key) return chords;
  const shift = semitonesBetween(key.written, key.play);
  return shift ? chords.map((c) => ({ ...c, chord: transposeChord(c.chord, shift, key.play) })) : chords;
}

/** The key a set of chords is most likely in: the one most of them belong to, favouring how the song starts and ends. */
export function guessKey(chords: string[]): string | null {
  const roots = chords.map((c) => ({ root: noteIndex(c), minor: /^[A-G](?:#|b|♯|♭)?m(?!aj)/.test(c) })).filter((c) => c.root >= 0);
  if (!roots.length) return null;
  let best = { key: 0, score: -1 };
  for (let key = 0; key < 12; key++) {
    const scale = [0, 2, 4, 5, 7, 9, 11].map((s) => (key + s) % 12);
    let score = roots.filter((c) => scale.includes(c.root)).length;
    if (roots[0].root === key || roots[0].root === (key + 9) % 12) score += 2;
    if (roots[roots.length - 1].root === key) score += 1;
    if (score > best.score) best = { key, score };
  }
  // A song that starts on the relative minor chord is in the minor key.
  const relative = (best.key + 9) % 12;
  if (roots[0].root === relative && roots[0].minor) return `${KEYS[relative]}m`;
  return KEYS[best.key];
}

const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];

/** A chord as a Nashville number in a key ("D" in G → "5", "Em7" → "6m7", "C/E" → "4/6"). */
export function chordNumber(chord: string, key: string): string {
  const tonic = noteIndex(key);
  const m = /^([A-G](?:#|b|♯|♭)?)(.*?)(?:\/([A-G](?:#|b|♯|♭)?))?$/.exec(chord);
  if (tonic < 0 || !m) return chord;
  const degree = (note: string): string => DEGREES[(noteIndex(note) - tonic + 12) % 12];
  return `${degree(m[1])}${m[2]}${m[3] ? `/${degree(m[3])}` : ''}`;
}

/** A guitarist's capo: the chord shapes they play (a capo of 2 turns A into G shapes). */
export function capoShape(chord: string, capo: number, key: string): string {
  return capo ? transposeChord(chord, -capo, transposeKey(key, -capo)) : chord;
}

/** Chord or key names with real sharp and flat signs, for showing ("Bb/F#" → "B♭/F♯"). */
export function prettyChord(chord: string): string {
  return chord.replace(/(^|\/)([A-G])b/g, '$1$2♭').replace(/(^|\/)([A-G])#/g, '$1$2♯');
}

/** ProPresenter's key list (MusicKeyScale.MusicKey) in its order. */
const PRO_KEYS = ['Ab', 'A', 'A#', 'Bb', 'B', 'B#', 'Cb', 'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'E#', 'Fb', 'F', 'F#', 'Gb', 'G', 'G#'];

/** A key name as ProPresenter's key number and major/minor. */
export function proKey(key: string): { musicKey: number; minor: boolean } | null {
  const m = /^([A-G](?:#|b)?)(m?)$/.exec(key.trim().replace('♯', '#').replace('♭', 'b'));
  const i = m ? PRO_KEYS.indexOf(m[1]) : -1;
  return i < 0 ? null : { musicKey: i, minor: m![2] === 'm' };
}

/** ProPresenter's key number and major/minor as a key name. */
export function keyFromPro(musicKey: number, minor: boolean): string {
  const name = PRO_KEYS[musicKey];
  return name ? `${name}${minor ? 'm' : ''}` : '';
}
