import { useRef, useState } from 'react';
import { hasTokens, MESSAGE_TOKENS, type LiveMessage, type SavedMessage } from '../../shared/messages';
import { isRunning, type TimerState } from '../../shared/timer';
import { Fold } from './Fold';

/** Operator controls for the audience message: write one, show it, hide it, reuse an earlier one. */
export function MessagePanel({
  shown,
  saved,
  timer,
  onShow,
  onHide,
  onForget
}: {
  /** The message on screen now, if any. */
  shown: LiveMessage | null;
  saved: SavedMessage[];
  timer: TimerState;
  onShow: (text: string) => void;
  onHide: () => void;
  onForget: (id: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(shown?.text ?? '');
  const box = useRef<HTMLTextAreaElement>(null);
  const text = draft.trim();

  const insert = (token: string): void => {
    const el = box.current;
    const at = el ? el.selectionStart : draft.length;
    const end = el ? el.selectionEnd : draft.length;
    setDraft(draft.slice(0, at) + token + draft.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  return (
    <Fold id="message" title="Message" className="message-section" active={!!shown && 'showing'} defaultOpen={false}>
      <div className="stage-controls">
        <textarea
          ref={box}
          placeholder="For the audience, e.g. We begin in {timer}"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text) onShow(text);
          }}
        />
        <div className="message-tokens">
          <span className="muted">Insert</span>
          {MESSAGE_TOKENS.map((t) => (
            <button key={t.token} className="token" title={`Shows ${t.label}`} onClick={() => insert(t.token)}>
              {t.token}
            </button>
          ))}
        </div>
        {/\{timer\}/i.test(draft) && !isRunning(timer) && <p className="hint">The timer isn’t running. Start it under Stage, or count down to a time.</p>}
        <div className="stage-row">
          <button
            className="grow primary"
            onClick={() => onShow(text)}
            disabled={!text || text === shown?.text}
            title="Show along the bottom of the audience screen (⌘Enter / Ctrl+Enter)"
          >
            {shown ? 'Update message' : 'Show message'}
          </button>
          <button onClick={onHide} disabled={!shown}>
            Hide
          </button>
        </div>
        {saved.length > 0 && (
          <ul className="saved-messages" aria-label="Earlier messages">
            {saved.map((m) => (
              <li key={m.id} className={shown?.text === m.text ? 'on' : ''}>
                <button className="saved-message" title="Use this message" onClick={() => setDraft(m.text)}>
                  {m.text}
                  {hasTokens(m.text) && <span className="token-badge">live</span>}
                </button>
                <button className="icon-button forget" aria-label="Forget this message" title="Forget this message" onClick={() => onForget(m.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Fold>
  );
}
