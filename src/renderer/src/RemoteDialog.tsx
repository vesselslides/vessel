import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { RemoteStatus } from '../../shared/remote';
import { ShieldIcon } from './Icons';

/** Turn the phone remote on or off, and show how to connect. */
export function RemoteDialog({
  status,
  onStatus,
  onClose
}: {
  status: RemoteStatus | null;
  onStatus: (status: RemoteStatus) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const links = status?.links ?? status?.urls.map((u) => ({ url: u, network: '' })) ?? [];
  // The QR code shows the likeliest address; click another to show that one instead.
  const [chosen, setChosen] = useState<string | null>(null);
  const url = links.find((l) => l.url === chosen)?.url ?? links[0]?.url;
  const [firewallNote, setFirewallNote] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return setQr(null);
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } }).then(setQr);
  }, [url]);

  const run = async (fn: () => Promise<RemoteStatus>): Promise<void> => {
    setBusy(true);
    try {
      onStatus(await fn());
    } finally {
      setBusy(false);
    }
  };

  // Opening this window means you want to connect: switch the remote on so the QR code shows.
  useEffect(() => {
    void window.vessel.remoteStatus().then((s) => (s.enabled ? onStatus(s) : run(() => window.vessel.setRemoteEnabled(true))));
  }, []); // once, when the window opens

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal remote-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Remote control</h2>
        <p className="hint">
          Run slides, the stage timer and stage messages from a phone or tablet on the same Wi-Fi. With the presenter PIN, the person speaking
          sees their slides and notes and can move through them.
        </p>
        <div className="remote-toggle">
          <span className={`remote-dot ${status?.enabled ? 'on' : ''}`} />
          {status?.enabled ? 'Remote is on' : busy ? 'Starting…' : 'Remote is off'}
          {status?.enabled && (
            <span className="muted">
              {' · '}
              {status.clients === 1 ? '1 device connected' : `${status.clients} devices connected`}
              {status.presenters ? ` (${status.presenters} presenter${status.presenters === 1 ? '' : 's'})` : ''}
            </span>
          )}
          <span className="spacer" />
          {status?.enabled ? (
            <button disabled={busy} onClick={() => void run(() => window.vessel.setRemoteEnabled(false))}>
              Turn off
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void run(() => window.vessel.setRemoteEnabled(true))}>
              Turn on
            </button>
          )}
        </div>
        {status?.error && <p className="error">Couldn't start: {status.error}</p>}
        {status?.enabled && (
          <div className="remote-connect">
            {qr && <img className="remote-qr" src={qr} alt={`QR code for ${url}`} />}
            <div className="remote-details">
              <div className="field-label">Open on the phone</div>
              {links.length ? (
                links.map((l) => (
                  <button
                    key={l.url}
                    className={`remote-url ${l.url === url ? 'chosen' : ''}`}
                    title={links.length > 1 ? 'Show this address in the QR code' : undefined}
                    onClick={() => setChosen(l.url)}
                  >
                    <span className="remote-url-address">{l.url}</span>
                    {l.network && <span className="remote-url-network">{l.network}</span>}
                  </button>
                ))
              ) : (
                <p className="error">This computer isn't on a network.</p>
              )}
              {links.length > 1 && <div className="hint">Not connecting? Try another address: click it to show it in the QR code.</div>}
              {status.firewall && status.firewall !== 'allowed' && (
                <div className="remote-firewall">
                  <ShieldIcon size={18} />
                  <div>
                    <div className="field-label">Windows Firewall</div>
                    <div className="hint">
                      {status.firewall === 'checking'
                        ? 'Checking whether phones can reach Vessel…'
                        : status.firewall === 'blocked'
                          ? 'Windows Firewall is blocking phones from reaching Vessel.'
                          : status.firewall === 'missing'
                            ? "Vessel isn't allowed through Windows Firewall yet, so phones may not reach it."
                            : "Couldn't check Windows Firewall. If phones can't connect, allow Vessel through it."}
                      {firewallNote && <> {firewallNote}</>}
                    </div>
                  </div>
                  {status.firewall !== 'checking' && (
                    <button
                      className="primary"
                      disabled={busy}
                      title="Windows asks for an administrator's OK"
                      onClick={() =>
                        void run(async () => {
                          setFirewallNote(null);
                          const next = await window.vessel.allowRemoteThroughFirewall();
                          if (next.firewall !== 'allowed') setFirewallNote('It wasn’t allowed: choose Yes when Windows asks.');
                          return next;
                        })
                      }
                    >
                      Allow Vessel…
                    </button>
                  )}
                </div>
              )}
              {status.firewall === 'allowed' && (
                <div className="hint remote-firewall-ok">
                  <ShieldIcon size={14} /> Windows Firewall lets phones reach Vessel.
                </div>
              )}
              <div className="remote-access">
                <div>
                  <div className="field-label">Operator PIN</div>
                  <div className="hint">Full control</div>
                </div>
                <div className="remote-pin">{status.pin}</div>
                <button disabled={busy} title="Signs out every device" onClick={() => void run(() => window.vessel.newRemotePin())}>
                  New PIN
                </button>
              </div>
              <div className="remote-access">
                <div>
                  <div className="field-label">Presenter PIN</div>
                  <div className="hint">Their slides and notes, Next, Back, Black</div>
                </div>
                <div className="remote-pin">{status.presenterPin}</div>
                <button disabled={busy} title="Signs out the presenters" onClick={() => void run(() => window.vessel.newRemotePresenterPin())}>
                  New PIN
                </button>
              </div>
            </div>
          </div>
        )}
        <p className="hint">
          The phone must be on the same Wi-Fi as this computer (not a guest network, which keeps devices apart). The first time, your computer may
          ask whether Vessel can accept incoming network connections. Choose Allow.
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
