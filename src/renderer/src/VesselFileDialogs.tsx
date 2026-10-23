import { useMemo, useState } from 'react';
import type { Theme } from '../../shared/theme';
import type { LibraryItem, MediaItem, PlaylistFileInfo } from '../../shared/types';
import type { VesselChoice, VesselKind, VesselPreview } from '../../shared/vesselFile';

const AUTHOR_STORE = 'vessel.vesselAuthor';

function rememberedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_STORE) ?? '';
  } catch {
    return '';
  }
}

export interface ExportChoice {
  kind: VesselKind;
  title: string;
  description: string;
  author: string;
  /** For a collection: what was ticked. */
  songs: string[];
  playlists: string[];
  themes: string[];
  media: string[];
}

/** Ticked items in a long list, with a filter box. */
function Picker<T>({ items, label, keyOf, chosen, onChosen }: { items: T[]; label: (t: T) => string; keyOf: (t: T) => string; chosen: string[]; onChosen: (keys: string[]) => void }): React.JSX.Element {
  const [q, setQ] = useState('');
  const shown = items.filter((t) => label(t).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="vessel-picker">
      {items.length > 8 && <input placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />}
      <ul>
        {shown.map((t) => {
          const k = keyOf(t);
          return (
            <li key={k}>
              <label>
                <input type="checkbox" checked={chosen.includes(k)} onChange={(e) => onChosen(e.target.checked ? [...chosen, k] : chosen.filter((x) => x !== k))} /> {label(t)}
              </label>
            </li>
          );
        })}
        {!shown.length && <li className="muted">Nothing to choose here.</li>}
      </ul>
    </div>
  );
}

/** File ▸ Export as Vessel File: choose what to share, name it, and save. */
export function ExportVesselDialog({
  presentationName,
  serviceName,
  themes,
  library,
  playlists,
  media,
  initialKind,
  onExport,
  onCancel
}: {
  /** The presentation open now, if any. */
  presentationName: string | null;
  /** The service playlist open now, if any. */
  serviceName: string | null;
  /** Your own themes (the built-in ones every Vessel already has). */
  themes: Theme[];
  library: LibraryItem[];
  playlists: PlaylistFileInfo[];
  media: MediaItem[];
  initialKind?: VesselKind;
  onExport: (choice: ExportChoice) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const kinds: Array<{ id: VesselKind; label: string; detail: string; enabled: boolean }> = [
    { id: 'presentation', label: 'This presentation', detail: presentationName ? `“${presentationName}” with its backgrounds and pictures` : 'Open a presentation first', enabled: !!presentationName },
    { id: 'service', label: 'This service, with everything', detail: serviceName ? `“${serviceName}”: the running order, every song and all their media` : 'Open a service playlist first', enabled: !!serviceName },
    { id: 'themes', label: 'Themes', detail: themes.length ? 'Your own themes, to share with other churches' : 'Make a theme first (Themes in the toolbar)', enabled: themes.length > 0 },
    { id: 'collection', label: 'A collection', detail: 'Pick any songs, services, themes and media', enabled: true }
  ];
  const first = kinds.find((k) => k.id === initialKind && k.enabled) ?? kinds.find((k) => k.enabled)!;
  const [kind, setKind] = useState<VesselKind>(first.id);
  const defaultTitle = (k: VesselKind): string =>
    k === 'presentation' ? (presentationName ?? '') : k === 'service' ? (serviceName ?? '') : k === 'themes' ? 'Our themes' : 'Shared from Vessel';
  const [title, setTitle] = useState(defaultTitle(first.id));
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState(rememberedAuthor);
  const [songs, setSongs] = useState<string[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [chosenThemes, setChosenThemes] = useState<string[]>(themes.map((t) => t.id));
  const [chosenMedia, setChosenMedia] = useState<string[]>([]);
  const [rights, setRights] = useState(false);

  const hasSongs = kind === 'presentation' || kind === 'service' || (kind === 'collection' && (songs.length > 0 || lists.length > 0));
  const empty =
    (kind === 'themes' && !chosenThemes.length) || (kind === 'collection' && !songs.length && !lists.length && !chosenThemes.length && !chosenMedia.length);
  const pick = (k: VesselKind): void => {
    setKind(k);
    if (!titleTouched) setTitle(defaultTitle(k));
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal vessel-modal" role="dialog" aria-labelledby="vessel-export-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="vessel-export-title">Share as a Vessel file</h2>
        <p className="hint">One file another church can open in Vessel: double-click it, or drop it on the window. They see what’s inside and choose what to add.</p>
        <div className="vessel-kinds" role="radiogroup" aria-label="What to share">
          {kinds.map((k) => (
            <label key={k.id} className={`vessel-kind ${kind === k.id ? 'on' : ''} ${k.enabled ? '' : 'off'}`}>
              <input type="radio" name="vessel-kind" checked={kind === k.id} disabled={!k.enabled} onChange={() => pick(k.id)} />
              <span>
                <strong>{k.label}</strong>
                <span className="muted">{k.detail}</span>
              </span>
            </label>
          ))}
        </div>

        {kind === 'themes' && <Picker items={themes} label={(t) => t.name} keyOf={(t) => t.id} chosen={chosenThemes} onChosen={setChosenThemes} />}
        {kind === 'collection' && (
          <div className="vessel-collection">
            <div>
              <h3>Songs and presentations</h3>
              <Picker items={library} label={(l) => l.name} keyOf={(l) => l.path} chosen={songs} onChosen={setSongs} />
            </div>
            <div>
              <h3>Services (with their songs)</h3>
              <Picker items={playlists} label={(p) => p.name} keyOf={(p) => p.path} chosen={lists} onChosen={setLists} />
            </div>
            <div>
              <h3>Themes</h3>
              <Picker items={themes} label={(t) => t.name} keyOf={(t) => t.id} chosen={chosenThemes} onChosen={setChosenThemes} />
            </div>
            <div>
              <h3>Backgrounds and media</h3>
              <Picker items={media} label={(m) => m.name} keyOf={(m) => m.path} chosen={chosenMedia} onChosen={setChosenMedia} />
            </div>
          </div>
        )}

        <label className="pref-field">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
          />
        </label>
        <label className="pref-field">
          Made by
          <input value={author} placeholder="Your church’s name (optional)" onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="pref-field vessel-note">
          A note for whoever opens it
          <textarea value={description} placeholder="Optional: what it’s for, how to use it" onChange={(e) => setDescription(e.target.value)} />
        </label>

        {hasSongs && (
          <label className="vessel-rights">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            <span>
              The songs in this are ours to share: public domain, written by us, or shared with permission. (Most worship songs are copyrighted; a CCLI
              licence covers your own church’s use, not giving lyrics to others.)
            </span>
          </label>
        )}

        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={empty || !title.trim() || (hasSongs && !rights)}
            onClick={() => {
              try {
                localStorage.setItem(AUTHOR_STORE, author);
              } catch {
                // Not remembered; fine.
              }
              onExport({ kind, title: title.trim(), description, author, songs, playlists: lists, themes: chosenThemes, media: chosenMedia });
            }}
          >
            Save Vessel file…
          </button>
        </div>
      </div>
    </div>
  );
}

const megabytes = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`);

/** An opened Vessel file: what's inside, from whom, and what to add. */
export function VesselPreviewDialog({ preview, onAdd, onCancel }: { preview: VesselPreview; onAdd: (choice: VesselChoice) => void; onCancel: () => void }): React.JSX.Element {
  const m = preview.manifest;
  // Everything new is ticked; things already here aren't.
  const [presentations, setPresentations] = useState(() => m.presentations.map((_, i) => i).filter((i) => !preview.have.presentations[i]));
  const [playlists, setPlaylists] = useState(() => m.playlists.map((_, i) => i));
  const [themes, setThemes] = useState(() => m.themes.map((_, i) => i).filter((i) => !preview.have.themes[i]));
  const [withMedia, setWithMedia] = useState(true);
  const toggle = (list: number[], set: (l: number[]) => void, i: number, on: boolean): void => set(on ? [...list, i] : list.filter((x) => x !== i));
  const nothing = !presentations.length && !playlists.length && !themes.length && !(withMedia && m.media.length);
  const made = useMemo(() => (m.created ? new Date(m.created).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : ''), [m.created]);

  return (
    <div className="modal-backdrop">
      <div className="modal vessel-modal" role="dialog" aria-labelledby="vessel-open-title">
        <h2 id="vessel-open-title">{m.title}</h2>
        <p className="hint">
          A Vessel file{m.author ? ` from ${m.author}` : ''}
          {made ? `, made ${made}` : ''}. Choose what to add; nothing you already have is changed.
        </p>
        {m.description && <blockquote className="vessel-description">{m.description}</blockquote>}

        <div className="vessel-contents">
          {m.playlists.length > 0 && (
            <section>
              <h3>Services</h3>
              {m.playlists.map((p, i) => (
                <label key={p.file}>
                  <input type="checkbox" checked={playlists.includes(i)} onChange={(e) => toggle(playlists, setPlaylists, i, e.target.checked)} /> {p.name}
                  <span className="muted"> · {p.items} item{p.items === 1 ? '' : 's'}, with their songs</span>
                </label>
              ))}
            </section>
          )}
          {m.presentations.length > 0 && (
            <section>
              <h3>Songs and presentations</h3>
              {m.presentations.map((p, i) => (
                <label key={p.file}>
                  <input type="checkbox" checked={presentations.includes(i)} onChange={(e) => toggle(presentations, setPresentations, i, e.target.checked)} /> {p.name}
                  <span className="muted"> · {p.slides} slide{p.slides === 1 ? '' : 's'}</span>
                  {preview.have.presentations[i] && <span className="token-badge">in your library</span>}
                </label>
              ))}
            </section>
          )}
          {m.themes.length > 0 && (
            <section>
              <h3>Themes</h3>
              {m.themes.map((t, i) => (
                <label key={`${t.id}-${i}`}>
                  <input type="checkbox" checked={themes.includes(i)} onChange={(e) => toggle(themes, setThemes, i, e.target.checked)} /> {t.name}
                  <span className="muted"> · {t.font}</span>
                  {preview.have.themes[i] && <span className="token-badge">you have it</span>}
                </label>
              ))}
            </section>
          )}
          {m.media.length > 0 && (
            <section>
              <h3>Media</h3>
              <label>
                <input type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} /> {m.media.length} background
                {m.media.length === 1 ? '' : 's'} and media file{m.media.length === 1 ? '' : 's'}
                <span className="muted"> · {megabytes(preview.mediaBytes)}, into the media bin</span>
              </label>
            </section>
          )}
        </div>
        {m.themes.length > 0 && <p className="hint">Themes use fonts by name; if a font isn’t on this computer, a similar one is used.</p>}

        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={nothing} onClick={() => onAdd({ token: preview.token, presentations, playlists, themes, media: withMedia })}>
            Add to Vessel
          </button>
        </div>
      </div>
    </div>
  );
}
