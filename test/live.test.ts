import { describe, expect, it } from 'vitest';
import { backgroundForSlide, rememberCleared } from '../src/shared/live';
import type { Background } from '../src/shared/types';

const bg = (path: string): Background => ({ path, kind: 'image', loop: false, scale: 'fill' });
const A = bg('/a.jpg');
const B = bg('/b.jpg');

describe('slide backgrounds after Clear media', () => {
  it('shows a slide’s own background normally', () => {
    expect(backgroundForSlide(A, null, null)).toEqual({ background: A, cleared: null });
    expect(backgroundForSlide(undefined, A, null)).toEqual({ background: A, cleared: null });
  });

  it('keeps cleared media cleared on slides with that same background', () => {
    const cleared = rememberCleared(A, null);
    expect(cleared).toBe('/a.jpg');
    expect(backgroundForSlide(A, null, cleared)).toEqual({ background: null, cleared: '/a.jpg' });
    // …including slides with no background of their own.
    expect(backgroundForSlide(undefined, null, cleared)).toEqual({ background: null, cleared: '/a.jpg' });
  });

  it('brings media back for a slide with a different background, and forgets the clear', () => {
    expect(backgroundForSlide(B, null, '/a.jpg')).toEqual({ background: B, cleared: null });
  });

  it('remembers what was cleared even if cleared twice', () => {
    expect(rememberCleared(null, '/a.jpg')).toBe('/a.jpg');
    expect(rememberCleared(null, null)).toBeNull();
  });
});
