import { useState, type ReactNode } from 'react';
import { DEFAULT_EXPORT_OPTIONS, type ExportFormat, type ExportOptions } from '../../shared/exports';
import { DocumentIcon, MediaIcon, PlaylistIcon, SlidesIcon, TextIcon, VesselIcon } from './Icons';

const STORE = 'vessel.exportOptions';
const KIND_STORE = 'vessel.exportKind';

function remembered(): ExportOptions {
  try {
    return { ...DEFAULT_EXPORT_OPTIONS, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<ExportOptions>) };
  } catch {
    return DEFAULT_EXPORT_OPTIONS;
  }
}

/** Everything File ▸ Export makes, in the order the cards show. */
export type ExportKind = ExportFormat | 'bundle' | 'vessel';
export type ExportScope = 'presentation' | 'service';

interface Kind {
  id: ExportKind;
  title: string;
  blurb: string;
  files: string;
  icon: ReactNode;
  /** Only for a whole service. */
  serviceOnly?: boolean;
}

const KINDS: Kind[] = [
  { id: 'pdf-slides', title: 'PDF of the slides', blurb: 'Slides as they look on screen, to print or check', files: '.pdf · 1 to 6 a page', icon: <SlidesIcon size={26} /> },
  { id: 'pdf-lyrics', title: 'Lyrics sheet', blurb: 'The words by group, for the band or an order of service', files: '.pdf', icon: <DocumentIcon size={26} /> },
  { id: 'images', title: 'Pictures of the slides', blurb: 'One picture per slide, for social media or another screen', files: '.png · .jpg', icon: <MediaIcon size={26} /> },
  { id: 'text', title: 'Plain text', blurb: 'The words, for an email, bulletin or website', files: '.txt', icon: <TextIcon size={26} /> },
  { id: 'bundle', title: 'Playlist with media', blurb: 'The service, its songs and media in one playlist file for other presentation software', files: '.proPlaylist', icon: <PlaylistIcon size={26} />, serviceOnly: true },
  { id: 'vessel', title: 'Vessel file', blurb: 'For another church using Vessel: songs, services, themes and media', files: '.vessel', icon: <VesselIcon size={26} /> }
];

function lastKind(): ExportKind | null {
  try {
    const k = localStorage.getItem(KIND_STORE);
    return KINDS.some((x) => x.id === k) ? (k as ExportKind) : null;
  } catch {
    return null;
  }
}

/**
 * File ▸ Export: first what to make (a card for each), then just the options
 * it needs and whether it's this presentation or the whole service.
 */
export function ExportDialog({
  presentationName,
  serviceName,
  initialScope,
  onExport,
  onVessel,
  onCancel
}: {
  presentationName: string | null;
  serviceName: string | null;
  initialScope?: ExportScope;
  onExport: (kind: ExportFormat | 'bundle', scope: ExportScope, options: ExportOptions) => void;
  onVessel: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [opts, setOpts] = useState<ExportOptions>(remembered);
  const [kind, setKind] = useState<ExportKind | null>(null);
  const [scope, setScope] = useState<ExportScope>(
    initialScope === 'service' && serviceName ? 'service' : initialScope === 'presentation' && presentationName ? 'presentation' : presentationName ? 'presentation' : 'service'
  );
  const last = lastKind();
  const change = (patch: Partial<ExportOptions>): void => setOpts((o) => ({ ...o, ...patch }));
  const nothing = !presentationName && !serviceName;
  const usable = (k: Kind): boolean => k.id === 'vessel' || (k.serviceOnly ? !!serviceName : !nothing);

  const choose = (k: Kind): void => {
    if (k.id === 'vessel') return onVessel();
    if (k.serviceOnly) setScope('service');
    setKind(k.id);
  };
  const run = (): void => {
    if (!kind || kind === 'vessel') return;
    try {
      localStorage.setItem(KIND_STORE, kind);
      localStorage.setItem(STORE, JSON.stringify(opts));
    } catch {
      // Not remembered this time; the export still runs.
    }
    onExport(kind, scope, opts);
  };
  const current = KINDS.find((k) => k.id === kind);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal import-modal" role="dialog" aria-labelledby="export-title" onMouseDown={(e) => e.stopPropagation()}>
        {!current ? (
          <>
            <h2 id="export-title">What are you exporting?</h2>
            <p className="hint">{nothing ? 'Open a presentation or a service playlist first; a Vessel file can share anything.' : 'Your presentations aren’t changed; this makes new files.'}</p>
            <div className="import-kinds">
              {KINDS.map((k) => (
                <button key={k.id} className={`import-kind ${k.id === last ? 'last' : ''}`} disabled={!usable(k)} onClick={() => choose(k)} autoFocus={k.id === (last ?? 'pdf-slides') && usable(k)}>
                  {k.icon}
                  <strong>{k.title}</strong>
                  <span className="import-blurb">{k.blurb}</span>
                  <span className="import-files">{k.serviceOnly && !serviceName ? 'Open a service playlist first' : k.files}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={onCancel}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="export-title" className="import-title">
              {current.icon}
              {current.title}
            </h2>

            {!current.serviceOnly && (
              <section className="import-option">
                <h3>Export</h3>
                <label>
                  <input type="radio" name="export-scope" checked={scope === 'presentation'} disabled={!presentationName} onChange={() => setScope('presentation')} />
                  <span>{presentationName ? <>This presentation: <strong>{presentationName}</strong></> : 'This presentation (open one first)'}</span>
                </label>
                <label>
                  <input type="radio" name="export-scope" checked={scope === 'service'} disabled={!serviceName} onChange={() => setScope('service')} />
                  <span>{serviceName ? <>The whole service: <strong>{serviceName}</strong>, every song in order</> : 'The whole service (open a playlist first)'}</span>
                </label>
              </section>
            )}

            {current.id === 'pdf-slides' && (
              <section className="import-option">
                <label className="import-row">
                  <span>Slides on each page</span>
                  <select value={opts.perPage} onChange={(e) => change({ perPage: Number(e.target.value) as ExportOptions['perPage'] })}>
                    <option value={1}>1 (landscape)</option>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                  </select>
                </label>
                <Check label="Backgrounds" checked={opts.backgrounds} onChange={(backgrounds) => change({ backgrounds })} />
                <Check label="Group and number under each slide" checked={opts.captions} onChange={(captions) => change({ captions })} />
                <Paper opts={opts} change={change} />
              </section>
            )}

            {current.id === 'pdf-lyrics' && (
              <section className="import-option">
                <label className="import-row">
                  <span>Columns</span>
                  <select value={opts.columns} onChange={(e) => change({ columns: Number(e.target.value) as ExportOptions['columns'] })}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <Check label="The order of the groups (Verse 1, Chorus…)" checked={opts.order} onChange={(order) => change({ order })} />
                <Check label="Copyright and CCLI line" checked={opts.copyright} onChange={(copyright) => change({ copyright })} />
                {scope === 'service' && <Check label="Each song on a new page" checked={opts.songPerPage} onChange={(songPerPage) => change({ songPerPage })} />}
                <Paper opts={opts} change={change} />
              </section>
            )}

            {current.id === 'images' && (
              <section className="import-option">
                <label className="import-row">
                  <span>Size</span>
                  <select value={opts.imageWidth} onChange={(e) => change({ imageWidth: Number(e.target.value) })}>
                    <option value={3840}>3840 wide (4K)</option>
                    <option value={1920}>1920 wide (HD)</option>
                    <option value={1280}>1280 wide</option>
                    <option value={1080}>1080 wide (social media)</option>
                  </select>
                </label>
                <label className="import-row">
                  <span>Format</span>
                  <select value={opts.imageFormat} onChange={(e) => change({ imageFormat: e.target.value as ExportOptions['imageFormat'] })}>
                    <option value="png">PNG (sharpest)</option>
                    <option value="jpeg">JPEG (smaller)</option>
                  </select>
                </label>
                <Check label="Backgrounds" checked={opts.backgrounds} onChange={(backgrounds) => change({ backgrounds })} />
                <p className="hint">You choose a folder; the pictures go in a new folder inside it{scope === 'service' ? ', one folder per song' : ''}. Video backgrounds show one frame.</p>
              </section>
            )}

            {current.id === 'text' && (
              <section className="import-option">
                <Check label="The order of the groups (Verse 1, Chorus…)" checked={opts.order} onChange={(order) => change({ order })} />
                <Check label="Copyright and CCLI line" checked={opts.copyright} onChange={(copyright) => change({ copyright })} />
              </section>
            )}

            {current.id === 'bundle' && (
              <p className="hint">
                One <strong>.proPlaylist</strong> file with the running order, every song and all their pictures, videos and audio, for presentation software
                that opens playlist files with media. Vessel opens these too.
              </p>
            )}

            {(current.id === 'pdf-lyrics' || current.id === 'text' || current.id === 'bundle') && (
              <p className="hint">Song lyrics are usually copyrighted: share copies only as your licence allows.</p>
            )}

            <div className="modal-actions">
              <button className="import-back" onClick={() => setKind(null)}>
                ← Back
              </button>
              <span className="grow" />
              <button onClick={onCancel}>Cancel</button>
              <button className="primary" autoFocus onClick={run}>
                Export…
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Paper({ opts, change }: { opts: ExportOptions; change: (p: Partial<ExportOptions>) => void }): React.JSX.Element {
  return (
    <label className="import-row">
      <span>Paper</span>
      <select value={opts.paper} onChange={(e) => change({ paper: e.target.value as ExportOptions['paper'] })}>
        <option value="a4">A4</option>
        <option value="letter">US Letter</option>
      </select>
    </label>
  );
}
