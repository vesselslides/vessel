import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface TourStep {
  /** What to light up: one element, or several taken together. None: a card in the middle. */
  target?: string | string[];
  title: string;
  body: ReactNode;
  /** Get the window ready first (open the practice song, close a panel). */
  before?: () => void | Promise<unknown>;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 340;
const GAP = 16;

/** The box around everything a step lights up, or null if none of it is on screen. */
function boxOf(target: TourStep['target']): Box | null {
  const selectors = target ? (Array.isArray(target) ? target : [target]) : [];
  const rects = selectors.flatMap((s) => [...document.querySelectorAll(s)].slice(0, 1).map((el) => el.getBoundingClientRect())).filter((r) => r.width && r.height);
  if (!rects.length) return null;
  const top = Math.min(...rects.map((r) => r.top)) - PAD;
  const left = Math.min(...rects.map((r) => r.left)) - PAD;
  const bottom = Math.max(...rects.map((r) => r.bottom)) + PAD;
  const right = Math.max(...rects.map((r) => r.right)) + PAD;
  return { top, left, width: right - left, height: bottom - top };
}

/** Where the card goes: beside the lit area if there's room, else below or above it; always inside the window. */
function cardPlace(box: Box | null, cardH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (t: number): number => Math.max(GAP, Math.min(vh - cardH - GAP, t));
  const clampLeft = (l: number): number => Math.max(GAP, Math.min(vw - CARD_W - GAP, l));
  if (!box) return { top: clampTop(vh / 2 - cardH / 2), left: clampLeft(vw / 2 - CARD_W / 2) };
  if (box.left + box.width + GAP + CARD_W < vw - GAP) return { top: clampTop(box.top), left: box.left + box.width + GAP };
  if (box.left - GAP - CARD_W > GAP) return { top: clampTop(box.top), left: box.left - GAP - CARD_W };
  if (box.top + box.height + GAP + cardH < vh - GAP) return { top: box.top + box.height + GAP, left: clampLeft(box.left + box.width - CARD_W) };
  return { top: clampTop(box.top - GAP - cardH), left: clampLeft(box.left + box.width - CARD_W) };
}

/**
 * A short spotlight tour: the window dims, one area at a time is lit with a
 * note beside it. Next / Back / Skip, or → ← and Esc (the keys move the tour,
 * not the slides, while it's open).
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (finished: boolean) => void }): React.JSX.Element {
  const [at, setAt] = useState(0);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(180);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[at];
  const last = at === steps.length - 1;

  // Get each step ready, then light it up.
  useEffect(() => {
    let current = true;
    setReady(false);
    void Promise.resolve(step.before?.()).then(() => {
      // Give the window a moment to draw what the step opened.
      setTimeout(() => current && setReady(true), 250);
    });
    return () => {
      current = false;
    };
  }, [step]);

  // Follow the lit area if the window changes size or the panel moves.
  useEffect(() => {
    if (!ready) return;
    const measure = (): void => setBox(boxOf(step.target));
    measure();
    const id = setInterval(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [ready, step]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  });

  const next = useCallback(() => (last ? onClose(true) : setAt((i) => i + 1)), [last, onClose]);
  const back = useCallback(() => setAt((i) => Math.max(0, i - 1)), []);

  // The keys belong to the tour while it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Enter or Space on one of the tour's own buttons presses that button.
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement && e.target.closest('.tour-card')) return;
      if (['ArrowRight', 'ArrowDown', 'Enter', ' '].includes(e.key)) next();
      else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) back();
      else if (e.key === 'Escape') onClose(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [next, back, onClose]);

  const place = cardPlace(box, cardH);
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? (
        <div className="tour-hole" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div ref={card} className={`tour-card ${ready ? 'in' : ''}`} style={{ top: place.top, left: place.left, width: CARD_W }} key={at}>
        <div className="tour-count">
          {at + 1} of {steps.length}
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="link-button" onClick={() => onClose(false)}>
            Skip tour
          </button>
          <span className="grow" />
          {at > 0 && <button onClick={back}>Back</button>}
          <button className="primary" autoFocus onClick={next}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
