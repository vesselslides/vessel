import { useState, type ReactNode } from 'react';
import { DEFAULT_IMPORT_OPTIONS, type DocumentKind, type ImportOptions } from '../../shared/import';
import type { MediaFolder } from '../../shared/types';
import { BibleIcon, DocumentIcon, MediaIcon, OpenIcon, PlanIcon, PlaylistIcon, SlidesIcon, TextIcon, VesselIcon } from './Icons';

const STORE = 'vessel.importOptions';
const KIND_STORE = 'vessel.importKind';

function remembered(): ImportOptions {
  try {
    return { ...DEFAULT_IMPORT_OPTIONS, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<ImportOptions>) };
  } catch {
    return DEFAULT_IMPORT_OPTIONS;
  }
}

/** What can be imported, in the order the cards show. */
export type ImportKind = 'presentation' | DocumentKind | 'playlist' | 'vessel' | 'media' | 'bible' | 'planning-center';

interface Kind {
  id: ImportKind;
  title: string;
  blurb: string;
  files: string;
  icon: ReactNode;
}

const KINDS: Kind[] = [
  { id: 'presentation', title: 'Presentation', blurb: 'Songs from presentation software, older versions too', files: '.pro · .pro6 · .pro6x · .pro5', icon: <OpenIcon size={26} /> },
  { id: 'powerpoint', title: 'PowerPoint or Slides', blurb: 'From PowerPoint, Google Slides or Keynote', files: '.pptx', icon: <SlidesIcon size={26} /> },
  { id: 'word', title: 'Word document', blurb: 'Lyrics written in a document', files: '.docx · .odt · .rtf', icon: <DocumentIcon size={26} /> },
  { id: 'text', title: 'Text or chord sheet', blurb: 'Plain lyrics, or chord charts', files: '.txt · ChordPro', icon: <TextIcon size={26} /> },
  { id: 'playlist', title: 'Playlist', blurb: 'A service order from presentation software', files: '.proPlaylist', icon: <PlaylistIcon size={26} /> },
  { id: 'vessel', title: 'Vessel file', blurb: 'Songs, services and themes shared by another church', files: '.vessel', icon: <VesselIcon size={26} /> },
  { id: 'media', title: 'Pictures, videos, audio', blurb: 'For the media bin', files: 'jpg · png · mp4 · mov · mp3 …', icon: <MediaIcon size={26} /> },
  { id: 'bible', title: 'Bible', blurb: 'A Bible file you downloaded', files: 'XML · zipped XML', icon: <BibleIcon size={26} /> },
  { id: 'planning-center', title: 'Planning Center', blurb: 'A service plan becomes a playlist', files: 'Needs a connection', icon: <PlanIcon size={26} /> }
];

/** Kinds with nothing to choose go straight to the file picker. */
const DIRECT: ImportKind[] = ['playlist', 'vessel', 'bible', 'planning-center'];

function lastKind(): ImportKind | null {
  try {
    const k = localStorage.getItem(KIND_STORE);
    return KINDS.some((x) => x.id === k) ? (k as ImportKind) : null;
  } catch {
    return null;
  }
}

/**
 * File ▸ Import: first, what's being imported (a card for each kind); then
 * just the options that kind needs; then a file picker showing only those files.
 */
export function ImportDialog({
  folders,
  onDocuments,
  onPresentations,
  onPlaylist,
  onVessel,
  onMedia,
  onBible,
  onPlanningCenter,
  onCancel
}: {
  folders: MediaFolder[];
  onDocuments: (opts: ImportOptions, kind: DocumentKind) => void;
  onPresentations: () => void;
  onPlaylist: () => void;
  onVessel: () => void;
  /** Into this media folder (null: not in a folder). */
  onMedia: (folder: string | null) => void;
  onBible: () => void;
  onPlanningCenter: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [opts, setOpts] = useState<ImportOptions>(remembered);
  const [kind, setKind] = useState<ImportKind | null>(null);
  const [folder, setFolder] = useState<string>('');
  const last = lastKind();
  const change = (patch: Partial<ImportOptions>): void => setOpts((o) => ({ ...o, ...patch }));

  const run = (k: ImportKind): void => {
    try {
      localStorage.setItem(KIND_STORE, k);
      localStorage.setItem(STORE, JSON.stringify(opts));
    } catch {
      // Not remembered this time; the import still runs.
    }
    if (k === 'presentation') onPresentations();
    else if (k === 'powerpoint' || k === 'word' || k === 'text') onDocuments(opts, k);
    else if (k === 'playlist') onPlaylist();
    else if (k === 'vessel') onVessel();
    else if (k === 'media') onMedia(folder || null);
    else if (k === 'bible') onBible();
    else onPlanningCenter();
  };
  const choose = (k: ImportKind): void => (DIRECT.includes(k) ? run(k) : setKind(k));
  const current = KINDS.find((k) => k.id === kind);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal import-modal" role="dialog" aria-labelledby="import-title" onMouseDown={(e) => e.stopPropagation()}>
        {!current ? (
          <>
            <h2 id="import-title">What are you importing?</h2>
            <p className="hint">Your files are read and copied in; the originals are never changed.</p>
            <div className="import-kinds">
              {KINDS.map((k) => (
                <button key={k.id} className={`import-kind ${k.id === last ? 'last' : ''}`} onClick={() => choose(k.id)} autoFocus={k.id === (last ?? 'presentation')}>
                  {k.icon}
                  <strong>{k.title}</strong>
                  <span className="import-blurb">{k.blurb}</span>
                  <span className="import-files">{k.files}</span>
                </button>
              ))}
            </div>
            <p className="hint">Or drop files onto the window: Vessel works out what each one is.</p>
            <div className="modal-actions">
              <button onClick={onCancel}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="import-title" className="import-title">
              {current.icon}
              {current.title}
            </h2>

            {current.id === 'presentation' && (
              <p className="hint">
                Each presentation opens and is listed in your library. Older versions (.pro5, .pro6, .pro6x) are converted to the current format; their pictures
                and videos come into the media bin. The original files aren’t changed.
              </p>
            )}

            {current.id === 'powerpoint' && (
              <>
                <p className="hint">Each file becomes a presentation. Google Slides and Keynote: export as PowerPoint (.pptx) first.</p>
                <section className="import-option">
                  <h3>How should the slides come in?</h3>
                  <label>
                    <input type="radio" name="pptx-look" checked={opts.pptxLook === 'slides'} onChange={() => change({ pptxLook: 'slides' })} />
                    <span>
                      <strong>Keep their look</strong>: backgrounds, pictures and text where they are on each slide
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="pptx-look" checked={opts.pptxLook === 'lyrics'} onChange={() => change({ pptxLook: 'lyrics' })} />
                    <span>
                      <strong>Words only</strong>: make a song from the text, shown with your default theme
                    </span>
                  </label>
                </section>
                {opts.pptxLook === 'lyrics' && <LyricsOptions opts={opts} change={change} />}
              </>
            )}

            {(current.id === 'word' || current.id === 'text') && (
              <>
                <p className="hint">
                  Each file becomes a song. Blank lines separate verses; lines like “Verse 1”, “Chorus” or “[Bridge]” start a group, and repeated sections share one
                  group.{current.id === 'text' && ' ChordPro files work too.'}
                </p>
                <LyricsOptions opts={opts} change={change} />
              </>
            )}

            {current.id === 'media' && (
              <>
                <p className="hint">Pictures and videos can be backgrounds or go on slides; audio plays from the Live panel.</p>
                <section className="import-option">
                  <label className="import-row">
                    <span>Put them in</span>
                    <select value={folder} onChange={(e) => setFolder(e.target.value)}>
                      <option value="">No folder</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              </>
            )}

            <div className="modal-actions">
              <button className="import-back" onClick={() => setKind(null)}>
                ← Back
              </button>
              <span className="grow" />
              <button onClick={onCancel}>Cancel</button>
              <button className="primary" autoFocus onClick={() => run(current.id)}>
                Choose files…
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LyricsOptions({ opts, change }: { opts: ImportOptions; change: (patch: Partial<ImportOptions>) => void }): React.JSX.Element {
  return (
    <section className="import-option">
      <h3>Lyrics</h3>
      <label className="import-row">
        <span>Lines per slide</span>
        <select value={opts.linesPerSlide} onChange={(e) => change({ linesPerSlide: Number(e.target.value) })}>
          <option value={0}>Whole verse</option>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={opts.removeChords} onChange={(e) => change({ removeChords: e.target.checked })} />
        <span>Leave out chord lines (“G  D/F#  Em”) and [G] chords</span>
      </label>
    </section>
  );
}
