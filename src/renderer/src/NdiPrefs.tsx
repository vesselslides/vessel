import { useEffect, useState } from 'react';
import { normalizeNdi, type NdiSettings, type NdiStatus } from '../../shared/ndi';
import type { Settings } from '../../shared/types';

/** Preferences ▸ Screens ▸ NDI®: send the stream picture over the network. */
export function NdiPrefs({ settings, onSettings }: { settings: Settings | null; onSettings: (patch: Partial<Settings>) => void }): React.JSX.Element {
  const ndi = normalizeNdi(settings?.ndi);
  const [name, setName] = useState(ndi.name);
  const [status, setStatus] = useState<NdiStatus>({ state: 'off' });
  const save = (patch: Partial<NdiSettings>): void => onSettings({ ndi: { ...ndi, ...patch } });
  useEffect(() => setName(ndi.name), [ndi.name]);
  // Keep the status (and how many receivers are watching) up to date while this is open.
  useEffect(() => {
    let alive = true;
    const poll = (): void => void window.vessel.ndiStatus().then((s) => alive && setStatus(s));
    poll();
    const id = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [settings?.ndi]);

  const link = (
    <a
      href="https://ndi.video/tools/"
      onClick={(e) => {
        e.preventDefault();
        void window.vessel.openNdiSite();
      }}
    >
      ndi.video
    </a>
  );

  return (
    <>
      <h3>NDI® output</h3>
      <p className="hint">
        Send the stream picture over the network to OBS, vMix, a video switcher or another computer, with no capture card or cable. It needs the free NDI
        Tools from {link} on this computer.
      </p>
      <label className="pref-check">
        <input type="checkbox" checked={ndi.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        Send the stream output as an NDI source
      </label>
      {ndi.enabled && (
        <>
          <label className="pref-field">
            Source name
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== ndi.name && save({ name })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
          <label className="pref-field">
            Size
            <select value={ndi.resolution} onChange={(e) => save({ resolution: e.target.value as NdiSettings['resolution'] })}>
              <option value="1080p">1920 × 1080</option>
              <option value="720p">1280 × 720 (lighter on the network)</option>
            </select>
          </label>
          <label className="pref-check">
            <input type="checkbox" checked={ndi.transparent} onChange={(e) => save({ transparent: e.target.checked })} />
            See-through background (no key colour needed)
          </label>
        </>
      )}
      <p className={`ndi-status ${status.state}`}>
        {status.state === 'sending'
          ? `Sending as “${status.name}” · ${status.receivers === 1 ? '1 receiver' : `${status.receivers} receivers`} watching`
          : status.state === 'unavailable' || status.state === 'error'
            ? status.message
            : ndi.enabled
              ? 'Starting…'
              : 'Off'}
      </p>
      {status.state === 'unavailable' && (
        <div className="pref-buttons">
          <button onClick={() => void window.vessel.openNdiSite()}>Get NDI Tools…</button>
        </div>
      )}
      <p className="hint trademark">NDI® is a registered trademark of Vizrt NDI AB.</p>
    </>
  );
}
