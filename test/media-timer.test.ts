import { describe, expect, it } from 'vitest';
import { binKindOf, mediaKindOf } from '../src/shared/media';
import { backgroundForPath } from '../src/shared/pro/background';
import { parseSeconds } from '../src/shared/timer';

describe('custom timer lengths', () => {
  it('reads seconds, minutes and seconds, and minutes', () => {
    expect(parseSeconds('12')).toBe(12);
    expect(parseSeconds('7.5')).toBe(7.5);
    expect(parseSeconds('1:30')).toBe(90);
    expect(parseSeconds('90s')).toBe(90);
    expect(parseSeconds('2m')).toBe(120);
    expect(parseSeconds('45 seconds')).toBe(45);
    expect(parseSeconds('3 minutes')).toBe(180);
  });

  it('turns down what isn’t a time or is out of range', () => {
    for (const bad of ['', 'soon', '0', '0.5', '61:00', '1:75', '-5']) expect(parseSeconds(bad)).toBeNull();
    expect(parseSeconds('60:00')).toBe(3600);
  });
});

describe('audio in the media bin', () => {
  it('knows audio files, which can’t be backgrounds', () => {
    expect(['song.mp3', 'a.WAV', 'b.m4a', 'c.flac', 'd.ogg'].map(binKindOf)).toEqual(['audio', 'audio', 'audio', 'audio', 'audio']);
    expect(binKindOf('x.png')).toBe('image');
    expect(binKindOf('x.mp4')).toBe('video');
    expect(binKindOf('notes.txt')).toBeNull();
    expect(mediaKindOf('song.mp3')).toBeNull();
    expect(backgroundForPath('song.mp3')).toBeNull();
  });
});
