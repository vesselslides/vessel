// Moving through a slideshow click by click: Next shows the next click on the
// slide, then the next slide; Back takes clicks off, then goes to the previous
// slide as it ends (every click made), like PowerPoint.
import { nextEnabled } from './hotkeys';
import type { Deck, SlideLayout, SlideView } from './types';

/** A place in a presentation: the slide, and clicks made on it (0 for songs). */
export interface SlidePlace {
  index: number;
  build: number;
}

/** Clicks a slide takes before Next moves to the next slide; 0 for anything that isn't a slideshow. */
export const stepsOf = (slide: SlideView | undefined): number => (slide?.layout.slideshow ? (slide.layout.steps ?? 0) : 0);

/** Where Next goes from `at`, or null at the end of the presentation. */
export function nextClick(deck: Deck, at: SlidePlace): SlidePlace | null {
  if (at.index >= 0 && at.build < stepsOf(deck.slides[at.index])) return { index: at.index, build: at.build + 1 };
  const index = nextEnabled(deck, at.index, 1);
  return index >= 0 ? { index, build: 0 } : null;
}

/** Where Back goes from `at`, or null at the very start. */
export function previousClick(deck: Deck, at: SlidePlace): SlidePlace | null {
  if (at.index >= 0 && at.build > 0) return { index: at.index, build: at.build - 1 };
  const index = nextEnabled(deck, at.index, -1);
  return index >= 0 ? { index, build: stepsOf(deck.slides[index]) } : null;
}

/** A slideshow slide's layout drawn as it is after `build` clicks (for pictures and the stage screen). */
export const layoutAt = (layout: SlideLayout, build: number): SlideLayout => (layout.slideshow ? { ...layout, step: build } : layout);

/** Where each slide's pictures start when a slideshow is drawn once per click (slide i after k clicks is frames[i] + k). */
export function slideshowFrames(deck: Deck): number[] {
  let at = 0;
  return deck.slides.map((s) => {
    const first = at;
    at += stepsOf(s) + 1;
    return first;
  });
}

/** The slides once per click, each drawn as it is after that click (for pictures of a slideshow). */
export const slidesPerClick = (deck: Deck): SlideView[] =>
  deck.slides.flatMap((s) => Array.from({ length: stepsOf(s) + 1 }, (_, k) => ({ ...s, layout: layoutAt(s.layout, k) })));

/** "Slide 3 · click 1 of 2", or "Slide 3" when the slide has no clicks. */
export function placeLabel(deck: Deck, at: SlidePlace): string {
  const steps = stepsOf(deck.slides[at.index]);
  return `Slide ${at.index + 1}${steps ? ` · click ${at.build} of ${steps}` : ''}`;
}
