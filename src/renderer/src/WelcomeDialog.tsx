import { useEffect, useState, type ReactNode } from 'react';
import type { DisplayInfo } from '../../shared/types';
import { BibleIcon, ImportIcon, ScreensIcon } from './Icons';

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
        <h2 id="welcome-title">Welcome to Vessel</h2>
        <p className="muted">Three things and you’re ready for Sunday. You can skip any of them and come back later from Help ▸ Welcome to Vessel.</p>
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
