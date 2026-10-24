import { useEffect, useState, type ReactNode } from 'react';
import type { DisplayInfo } from '../../shared/types';
import { BibleIcon, ImportIcon, ScreensIcon } from './Icons';
import logo from './assets/vessel-slides-reverse.svg';

/** Navy banner with the logo, the same in dark and light. */
function WelcomeBanner(): React.JSX.Element {
  return (
    <div className="welcome-banner">
      <svg className="welcome-banner-art" viewBox="290 206 518 588" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="welcomeBannerGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#d9b97a" />
            <stop offset="1" stopColor="#a77d43" />
          </linearGradient>
        </defs>
        <polygon points="322,238.1 322,761.9 562.7,622.9 509.7,531.1 428,578.3 428,299.3" fill="url(#welcomeBannerGold)" stroke="url(#welcomeBannerGold)" strokeWidth="44" strokeLinejoin="round" />
        <polygon points="638.9,578.9 775.6,500 502.1,342.1" fill="#fff" stroke="#fff" strokeWidth="44" strokeLinejoin="round" />
      </svg>
      <img className="welcome-banner-logo" src={logo} alt="Vessel Slides" />
      <span className="welcome-banner-tag">Free presentation software for churches</span>
    </div>
  );
}

function Step({ n, done, icon, title, children }: { n: number; done: boolean; icon: ReactNode; title: string; children: ReactNode }): React.JSX.Element {
  return (
    <li className={`welcome-step ${done ? 'done' : ''}`}>
      <span className="welcome-mark" aria-label={done ? 'Done' : `Step ${n}`}>
        {done ? '✓' : n}
      </span>
      <div>
        <h3>
          {icon} {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

/** The first time Vessel opens (and Help ▸ Welcome): three things to set up, each ticked off once done. */
export function WelcomeDialog({
  songs,
  samples,
  displays,
  outputDisplay,
  onImport,
  onNewSong,
  onAddFolder,
  onOutput,
  onBible,
  onClose
}: {
  songs: number;
  /** The sample songs, service and media were set up. */
  samples: boolean;
  displays: DisplayInfo[];
  outputDisplay: number | null;
  onImport: () => void;
  onNewSong: () => void;
  onAddFolder: () => void;
  onOutput: (displayId: string) => void;
  onBible: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [bibles, setBibles] = useState(0);
  useEffect(() => void window.vessel.listBibles().then((l) => setBibles(l.length)), []);
  const others = displays.filter((d) => !d.primary);

  return (
    <div className="modal-backdrop">
      <div className="modal welcome" role="dialog" aria-labelledby="welcome-title">
        <WelcomeBanner />
        <h2 id="welcome-title">Welcome to Vessel</h2>
        <p className="muted">Three things and you’re ready for Sunday. You can skip any of them and come back later from Help ▸ Welcome to Vessel.</p>
        {samples && (
          <p className="welcome-samples">
            To show you around, Vessel has set up a <strong>Sample Sunday Service</strong>: hymns, a Bible reading, a sermon and an announcement loop, with motion
            backgrounds and audio. Try anything; the songs are in the library’s Samples folder, and you can delete them whenever you like.
          </p>
        )}
        <ol className="welcome-steps">
          <Step n={1} done={songs > 0} icon={<ImportIcon size={18} />} title="Bring in your songs">
            <p className="hint">{songs > 0 ? `${songs} song${songs === 1 ? '' : 's'} in your library.` : 'From PowerPoint, Word or text, from another presentation program’s library, or type one in.'}</p>
            <div className="pref-buttons">
              <button onClick={onImport}>Import files…</button>
              <button onClick={onAddFolder} title="Use a folder of .pro songs where it is, e.g. another presentation program’s library">
                Use a songs folder…
              </button>
              <button onClick={onNewSong}>Type a song</button>
            </div>
          </Step>
          <Step n={2} done={outputDisplay !== null} icon={<ScreensIcon size={18} />} title="Choose the audience screen">
            <p className="hint">
              {displays.length < 2
                ? 'Plug in the projector or TV, and it appears here. (With one screen, you can still try everything in the preview.)'
                : 'The projector or TV the congregation sees. Vessel shows it full screen there.'}
            </p>
            <select value={outputDisplay ?? ''} onChange={(e) => onOutput(e.target.value)} aria-label="Audience screen">
              <option value="">Not yet</option>
              {(others.length ? others : displays).map((d, i) => (
                <option key={d.id} value={d.id}>
                  {d.label || `Display ${i + 1}`} · {d.bounds.width}×{d.bounds.height}
                  {d.primary ? ' (this screen)' : ''}
                </option>
              ))}
            </select>
          </Step>
          <Step n={3} done={bibles > 0} icon={<BibleIcon size={18} />} title="Get a Bible">
            <p className="hint">{bibles > 0 ? `${bibles} Bible${bibles === 1 ? '' : 's'} ready, even without internet.` : '30 free translations in 17 languages, kept on this computer.'}</p>
            <div className="pref-buttons">
              <button onClick={onBible}>Choose a Bible…</button>
            </div>
          </Step>
        </ol>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            {songs > 0 && outputDisplay !== null && bibles > 0 ? 'All set' : 'Get started'}
          </button>
        </div>
      </div>
    </div>
  );
}
