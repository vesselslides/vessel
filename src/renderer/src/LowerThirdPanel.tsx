import { useState } from 'react';
import { cleanLowerThird, DEFAULT_LOWER_THIRD_COLOR, sameLowerThird, type LowerThird, type SavedLowerThird } from '../../shared/lowerThirds';

/** Operator controls for the lower third: a name and second line over the slides, and earlier ones to reuse. */
export function LowerThirdPanel({
  shown,
  saved,
  onShow,
  onHide,
  onForget
}: {
  shown: LowerThird | null;
  saved: SavedLowerThird[];
  onShow: (item: LowerThird) => void;
  onHide: () => void;
  onForget: (id: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<LowerThird>(shown ?? { title: '', subtitle: '', color: DEFAULT_LOWER_THIRD_COLOR });
  const item = cleanLowerThird(draft);
  const show = (): void => {
    if (item) onShow(item);
  };
  const enter = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') show();
  };

  return (
    <section className="lower-third-section">
      <h3>Lower third</h3>
      <div className="stage-controls">
        <div className="stage-row">
          <input className="grow" placeholder="Name, e.g. Pastor Sam" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={enter} />
          <input
            type="color"
            className="lower-third-color"
            value={draft.color}
            title="Colour of the bar beside the name"
            aria-label="Bar colour"
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </div>
        <div className="stage-row">
          <input className="grow" placeholder="Second line, e.g. Lead Pastor" value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} onKeyDown={enter} />
        </div>
        <div className="stage-row">
          <button className="grow primary" onClick={show} disabled={!item || sameLowerThird(item, shown)} title="Show in the lower left of the audience screen (Enter)">
            {shown ? 'Update lower third' : 'Show lower third'}
          </button>
          <button onClick={onHide} disabled={!shown}>
            Hide
          </button>
        </div>
        {saved.length > 0 && (
          <ul className="saved-messages" aria-label="Earlier lower thirds">
            {saved.map((s) => (
              <li key={s.id} className={shown && shown.title === s.title && shown.subtitle === s.subtitle ? 'on' : ''}>
                <button
                  className="saved-message"
                  title="Show this lower third (double-click) or click to edit it"
                  onClick={() => setDraft({ title: s.title, subtitle: s.subtitle, color: s.color })}
                  onDoubleClick={() => onShow({ title: s.title, subtitle: s.subtitle, color: s.color })}
                >
                  <span className="lower-third-swatch" style={{ background: s.color }} />
                  {s.title}
                  {s.subtitle && <span className="muted"> · {s.subtitle}</span>}
                </button>
                <button className="icon-button forget" aria-label="Forget this lower third" title="Forget this lower third" onClick={() => onForget(s.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
