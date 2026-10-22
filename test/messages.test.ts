import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findMoved, missingPaths } from '../src/main/relink';
import { fillMessage, hasTokens, normalizeMessages, rememberMessage } from '../src/shared/messages';
import { backgroundForPath, backgroundOfCue } from '../src/shared/pro/background';
import { addSlideImage, setSlideBackground } from '../src/shared/pro/edit';
import { createPresentation, layoutOfCue, parseLyrics, parsePresentation, serializePresentation } from '../src/shared/pro/presentation';
import { mediaPathsOf, relinkMedia, usesAny } from '../src/shared/pro/relink';
import { formatTimer, INITIAL_TIMER, isRunning, parseTimeOfDay, pauseTimer, resetTimer, startTimer, timerToTime, timerValue, timerWithMode } from '../src/shared/timer';

const at = (h: number, m: number) => new Date(2026, 9, 25, h, m, 0, 0).getTime();

describe('counting down to a time of day', () => {
  it('reads the ways people type times', () => {
    expect(parseTimeOfDay('10')).toEqual({ hours: 10, minutes: 0 });
    expect(parseTimeOfDay('10:30')).toEqual({ hours: 10, minutes: 30 });
    expect(parseTimeOfDay('9.15')).toEqual({ hours: 9, minutes: 15 });
    expect(parseTimeOfDay('9:30 am')).toEqual({ hours: 9, minutes: 30 });
    expect(parseTimeOfDay('7pm')).toEqual({ hours: 19, minutes: 0 });
    expect(parseTimeOfDay('12 am')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeOfDay('12:15 p.m.')).toEqual({ hours: 12, minutes: 15 });
    expect(parseTimeOfDay('18:45')).toEqual({ hours: 18, minutes: 45 });
    for (const bad of ['', '25:00', '10:60', '13pm', 'soon', '10:5']) expect(parseTimeOfDay(bad)).toBeNull();
  });

  it('counts down to later today and on past the time', () => {
    const t = timerToTime({ hours: 10, minutes: 0 }, at(9, 45));
    expect(t.target).toBe('10:00');
    expect(formatTimer(t, at(9, 45))).toBe('15:00');
    expect(isRunning(t)).toBe(true);
    // Five minutes after the start time it shows how late it is.
    expect(timerValue(t, at(10, 5))).toBe(-5 * 60_000);
    expect(formatTimer(t, at(10, 5))).toBe('-5:00');
  });

  it('means tomorrow when the time was more than an hour ago', () => {
    const t = timerToTime({ hours: 9, minutes: 0 }, at(20, 0));
    expect(timerValue(t, at(20, 0))).toBe(13 * 60 * 60_000);
    // Shortly after, it's still today's time.
    expect(timerValue(timerToTime({ hours: 19, minutes: 30 }, at(20, 0)), at(20, 0))).toBe(-30 * 60_000);
  });

  it("can't be paused or reset, and switching away gives a stopped timer", () => {
    const t = timerToTime({ hours: 10, minutes: 0 }, at(9, 0));
    expect(pauseTimer(t, at(9, 10))).toBe(t);
    expect(resetTimer(t)).toBe(t);
    expect(startTimer(t, at(9, 10))).toBe(t);
    const back = timerWithMode(t, 'countdown');
    expect(back).toEqual({ ...INITIAL_TIMER, durationMs: t.durationMs });
    expect(isRunning(back)).toBe(false);
  });
});

describe('audience messages', () => {
  it('fills in the timer and clock', () => {
    const timer = timerToTime({ hours: 10, minutes: 0 }, at(9, 58));
    expect(fillMessage('We begin in {timer}', timer, at(9, 58))).toBe('We begin in 2:00');
    expect(fillMessage('We begin in {TIMER}', timer, at(9, 59) + 30_000)).toBe('We begin in 0:30');
    expect(fillMessage('It is {clock}', timer, at(9, 58))).toMatch(/9:58/);
    expect(hasTokens('Child 42 to the nursery')).toBe(false);
    expect(hasTokens('Starts in {timer}')).toBe(true);
  });

  it('remembers messages once, most recent first', () => {
    let list = rememberMessage([], 'First');
    list = rememberMessage(list, 'Second');
    list = rememberMessage(list, ' First ');
    expect(list.map((m) => m.text)).toEqual(['First', 'Second']);
    expect(rememberMessage(list, '   ')).toBe(list);
    expect(normalizeMessages([{ id: 'a', text: 'ok' }, { id: 'b', text: ' ' }, null, 'x'])).toEqual([{ id: 'a', text: 'ok' }]);
    expect(normalizeMessages(undefined)).toEqual([]);
  });
});

describe('finding moved media', () => {
  const song = () => createPresentation('Song', parseLyrics('[Verse]\nOne\n\nTwo'));
  const OLD_BG = '/Volumes/Old Drive/Loops/blue loop.mp4';
  const OLD_LOGO = '/Users/someone/Pictures/logo.png';

  const withMedia = () => {
    const p = song();
    const ids = p.cues.map((c) => c.uuid!.string);
    return addSlideImage(setSlideBackground(p, ids[0], backgroundForPath(OLD_BG)), ids, OLD_LOGO, 'top-right');
  };

  it('lists the media a presentation uses', () => {
    expect(mediaPathsOf(withMedia()).sort()).toEqual([OLD_BG, OLD_LOGO].sort());
    expect(mediaPathsOf(song())).toEqual([]);
  });

  it('points backgrounds and pictures at their new places, and keeps them after saving', () => {
    const p = withMedia();
    const moves = { [OLD_BG]: '/Users/me/Movies/blue loop.mp4', [OLD_LOGO]: 'C:\\Media\\logo.png' };
    expect(usesAny(p, Object.keys(moves))).toBe(true);
    const relinked = parsePresentation(serializePresentation(relinkMedia(p, moves)));
    expect(backgroundOfCue(relinked.cues[0])?.path).toBe('/Users/me/Movies/blue loop.mp4');
    const pictures = relinked.cues.map((c) => layoutOfCue(c).graphics.find((g) => g.kind === 'image'));
    for (const g of pictures) expect(g && g.kind === 'image' && g.path).toBe('C:/Media/logo.png');
    // The original is left alone (undo keeps it).
    expect(mediaPathsOf(p)).toContain(OLD_BG);
    expect(usesAny(song(), Object.keys(moves))).toBe(false);
  });

  const dir = mkdtempSync(join(tmpdir(), 'vessel-relink-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('finds files by name in a folder and the folders inside it', async () => {
    mkdirSync(join(dir, 'Loops', 'Blue'), { recursive: true });
    mkdirSync(join(dir, '.hidden'));
    writeFileSync(join(dir, 'Loops', 'Blue', 'Blue Loop.MP4'), '');
    writeFileSync(join(dir, 'logo.png'), '');
    writeFileSync(join(dir, '.hidden', 'other.jpg'), '');
    const found = await findMoved(dir, [OLD_BG, OLD_LOGO, '/gone/other.jpg', 'C:\\Old\\logo.png']);
    expect(found).toEqual({
      [OLD_BG]: join(dir, 'Loops', 'Blue', 'Blue Loop.MP4'),
      [OLD_LOGO]: join(dir, 'logo.png'),
      'C:\\Old\\logo.png': join(dir, 'logo.png')
    });
    expect(missingPaths([join(dir, 'logo.png'), OLD_BG, OLD_BG, 3])).toEqual([OLD_BG]);
  });
});
