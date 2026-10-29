import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { RemoteStatus } from '../../shared/remote';

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
  const url = status?.urls[0];

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
              {status.urls.length ? (
                status.urls.map((u) => (
                  <div key={u} className="remote-url">
                    {u}
                  </div>
                ))
              ) : (
                <p className="error">This computer isn't on a network.</p>
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
          The phone must be on the same network as this computer. The first time, your computer may ask whether Vessel can accept incoming network
          connections. Choose Allow.
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
