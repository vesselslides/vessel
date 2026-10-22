import { useEffect, useState } from 'react';
import { findLibrarySong, planName, type PcoItem, type PcoPlan, type PcoServiceType } from '../../shared/planningCenter';
import type { LibraryItem, PcoConnection } from '../../shared/types';

export interface PcoImport {
  plan: PcoPlan;
  items: PcoItem[];
  /** Plan items that aren't songs or headers ("Welcome", "Sermon") come in as headings. */
  otherAsHeadings: boolean;
}

const TOKENS_PAGE = 'https://api.planningcenteronline.com/oauth/applications';

/** What one plan item will become in Vessel. */
function fate(item: PcoItem, library: LibraryItem[], otherAsHeadings: boolean): { label: string; tone: 'ok' | 'new' | 'skip' | 'plain' } {
  if (item.kind === 'header') return { label: 'Heading', tone: 'plain' };
  if (item.kind === 'other') return otherAsHeadings ? { label: 'Heading', tone: 'plain' } : { label: 'Left out', tone: 'skip' };
  const match = findLibrarySong(item, library);
  if (match) return { label: `In your library: ${match.name}`, tone: 'ok' };
  if (item.song?.lyrics.trim()) return { label: 'New song, made from Planning Center’s lyrics', tone: 'new' };
  return { label: 'Not in your library, and Planning Center has no lyrics: left out', tone: 'skip' };
}

/** Tools ▸ Planning Center: bring a service plan in as a service playlist. */
export function PlanningCenterDialog({
  library,
  onImport,
  onClose
}: {
  library: LibraryItem[];
  onImport: (plan: PcoImport) => Promise<void>;
  onClose: () => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<PcoConnection | null>(null);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<PcoServiceType[]>([]);
  const [type, setType] = useState('');
  const [plans, setPlans] = useState<PcoPlan[] | null>(null);
  const [plan, setPlan] = useState<PcoPlan | null>(null);
  const [items, setItems] = useState<PcoItem[] | null>(null);
  const [otherAsHeadings, setOtherAsHeadings] = useState(true);

  const run = async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await task();
    } catch (err) {
      // Messages come through IPC as "Error invoking remote method 'x': Error: …".
      setError((err as Error).message.replace(/^.*Error: /, ''));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => void window.vessel.pcoStatus().then(setStatus), []);
  useEffect(() => {
    if (!status?.connected) return;
    void run(window.vessel.pcoServiceTypes).then((t) => {
      if (!t) return;
      setTypes(t);
      setType((current) => current || t[0]?.id || '');
    });
  }, [status?.connected]);
  useEffect(() => {
    setPlan(null);
    setItems(null);
    setPlans(null);
    if (type) void run(() => window.vessel.pcoPlans(type)).then((p) => p && setPlans(p));
  }, [type]);
  useEffect(() => {
    setItems(null);
    if (plan) void run(() => window.vessel.pcoPlanItems(type, plan.id)).then((i) => i && setItems(i));
  }, [plan]);

  const connect = async (): Promise<void> => {
    const next = await run(() => window.vessel.pcoConnect(appId, secret));
    if (next) {
      setStatus(next);
      setSecret('');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal pco-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Planning Center</h2>
        {!status ? (
          <p className="hint">Checking…</p>
        ) : !status.connected ? (
          <>
            <p className="hint">
              Bring service plans from Planning Center Services into Vessel as service playlists. Connect with a Personal Access Token: in Planning Center, open{' '}
              <a
                href={TOKENS_PAGE}
                onClick={(e) => {
                  e.preventDefault();
                  void window.vessel.openPlanningCenterTokens();
                }}
              >
                Developer ▸ Personal Access Tokens
              </a>
              , create one, and copy its application ID and secret here.
            </p>
            <label className="pref-field">
              Application ID
              <input value={appId} onChange={(e) => setAppId(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <label className="pref-field">
              Secret
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <p className="hint">The secret stays on this computer, locked by its own keychain, and isn’t put in backups. Vessel only reads plans and songs.</p>
            {!status.canStore && <p className="hint pco-error">This computer can’t keep the secret safely, so Planning Center can’t be connected here.</p>}
          </>
        ) : (
          <>
            <p className="hint">
              Connected{status.organization ? ` to ${status.organization}` : ''}.{' '}
              <button className="link-button" onClick={() => void run(window.vessel.pcoDisconnect).then((s) => s && (setStatus(s), setTypes([]), setType('')))}>
                Disconnect
              </button>
            </p>
            <div className="pco-columns">
              <div className="pco-plans">
                <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Service type">
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {plans?.length === 0 && <p className="hint">No upcoming plans.</p>}
                <ul>
                  {plans?.map((p) => (
                    <li key={p.id}>
                      <button className={plan?.id === p.id ? 'active-toggle' : ''} onClick={() => setPlan(p)}>
                        <strong>{p.dates || 'No date'}</strong>
                        {p.title && <span className="muted"> · {p.title}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pco-items">
                {!plan && <p className="hint">Choose a plan to see what comes in.</p>}
                {items && (
                  <>
                    <ol>
                      {items.map((it) => {
                        const f = fate(it, library, otherAsHeadings);
                        return (
                          <li key={it.id} className={`pco-item ${it.kind}`}>
                            <span>{it.title || 'Untitled'}</span>
                            <span className={`pco-fate ${f.tone}`}>{f.label}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <label className="pref-check">
                      <input type="checkbox" checked={otherAsHeadings} onChange={(e) => setOtherAsHeadings(e.target.checked)} />
                      Bring in other items (welcome, prayer, sermon…) as headings
                    </label>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {busy && <p className="hint">Talking to Planning Center…</p>}
        {error && <p className="hint pco-error">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>{status?.connected ? 'Close' : 'Cancel'}</button>
          {status && !status.connected ? (
            <button className="primary" disabled={busy || !appId.trim() || !secret.trim() || !status.canStore} onClick={() => void connect()}>
              Connect
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !plan || !items?.length}
              onClick={() => plan && items && void run(() => onImport({ plan, items, otherAsHeadings })).then(onClose)}
              title={plan ? `Make the service playlist “${planName(plan)}”` : undefined}
            >
              Make service playlist
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
