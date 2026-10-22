import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatTimer,
  INITIAL_TIMER,
  isRunning,
  parseDuration,
  pauseTimer,
  resetTimer,
  startTimer,
  timerValue,
  type TimerState
} from '../src/shared/timer';

const countdown = (minutes: number): TimerState => ({ ...INITIAL_TIMER, durationMs: minutes * 60_000 });

describe('stage timer', () => {
  it('counts down while running and holds while paused', () => {
    let t = startTimer(countdown(5), 1_000);
    expect(isRunning(t)).toBe(true);
    expect(formatTimer(t, 1_000)).toBe('5:00');
    expect(formatTimer(t, 1_000 + 61_500)).toBe('3:59');
    t = pauseTimer(t, 1_000 + 61_500);
    expect(formatTimer(t, 999_999)).toBe('3:59');
    t = startTimer(t, 2_000_000);
    expect(formatTimer(t, 2_000_000 + 1_000)).toBe('3:58');
  });

  it('rounds countdowns up and goes negative after zero', () => {
    const t = startTimer(countdown(1), 0);
    expect(formatTimer(t, 59_001)).toBe('0:01');
    expect(formatTimer(t, 60_000)).toBe('0:00');
    expect(formatTimer(t, 60_999)).toBe('0:00');
    expect(formatTimer(t, 61_000)).toBe('-0:01');
    expect(timerValue(t, 125_000)).toBe(-65_000);
    expect(formatTimer(t, 125_000)).toBe('-1:05');
  });

  it('counts up, formats hours, and resets', () => {
    let t: TimerState = startTimer({ ...INITIAL_TIMER, mode: 'countup' }, 0);
    expect(formatTimer(t, 3_723_400)).toBe('1:02:03');
    t = resetTimer(t);
    expect(isRunning(t)).toBe(false);
    expect(formatTimer(t, 9_999_999)).toBe('0:00');
  });

  it('does not double-start or double-pause', () => {
    const t = startTimer(countdown(5), 100);
    expect(startTimer(t, 500)).toBe(t);
    const p = pauseTimer(t, 200);
    expect(pauseTimer(p, 900)).toBe(p);
  });

  it('parses typed durations', () => {
    expect(parseDuration('5')).toBe(300_000);
    expect(parseDuration('2.5m')).toBe(150_000);
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('4:30')).toBe(270_000);
    expect(parseDuration('75:00')).toBe(4_500_000);
    expect(parseDuration('1:15:00')).toBe(4_500_000);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('soon')).toBeNull();
  });

  it('formats plain durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(-400)).toBe('0:00');
    expect(formatDuration(599_999)).toBe('9:59');
  });
});
