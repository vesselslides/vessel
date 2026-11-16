import { Fold } from './Fold';
import { LockIcon } from './Icons';

/**
 * The presenter remote at a glance, in the Live panel: whose slides it shows
 * (the service items marked For the presenter, or whatever is on screen) and
 * a lock so a stray tap on the iPad can't move anything.
 */
export function PresenterPanel({
  items,
  presenters,
  locked,
  onLock
}: {
  /** Names of the service items marked For the presenter. */
  items: string[];
  /** Presenter remotes connected now. */
  presenters: number;
  locked: boolean;
  onLock: (locked: boolean) => void;
}): React.JSX.Element {
  return (
    <Fold id="presenter" title="Presenter remote" className="presenter-section" active={locked ? 'locked' : presenters > 0 && `${presenters} connected`} defaultOpen={false}>
      <div className="stage-controls">
        <span className="segmented small" role="group" aria-label="Presenter remote">
          <button className={locked ? '' : 'active'} onClick={() => onLock(false)} title="The presenter's Next, Back and Black work">
            Can control
          </button>
          <button className={locked ? 'active' : ''} onClick={() => onLock(true)} title="The presenter can read their slides and notes, but their buttons do nothing">
            <LockIcon size={13} /> Locked
          </button>
        </span>
        {items.length ? (
          <p className="hint">
            Only {items.length === 1 ? 'this item' : 'these items'}: <b>{items.join(', ')}</b>. Next and Back wait while anything else is on screen.
          </p>
        ) : (
          <p className="hint">
            Follows whatever presentation is on screen. To give the presenter only their own slides, right-click an item in the service ▸ <i>For the presenter</i>.
          </p>
        )}
        <p className="hint">It never puts words back after you clear them or black out the screen.</p>
      </div>
    </Fold>
  );
}
