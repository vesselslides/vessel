import { useMemo, useRef, useState, type DragEvent } from 'react';
import { moveItem, newServiceId, type Service, type ServiceItem } from '../../shared/pro/service';
import type { LibraryItem, PlaylistFileInfo, Settings } from '../../shared/types';

/** Drag payloads: a library song (JSON {path, name}) or a service row (its index). */
const LIBRARY_MIME = 'application/x-vessel-library';
const SERVICE_MIME = 'application/x-vessel-service-row';
/** Dropdown value for a new playlist that has no file yet. */
const NEW_PLAYLIST = '__new__';

export interface OpenDeckInfo {
  path?: string;
  name: string;
  dirty: boolean;
  selected: boolean;
}

export interface SidebarProps {
  settings: Settings | null;
  library: LibraryItem[];
  openDecks: OpenDeckInfo[];
  onOpen: (path: string) => void;
  onSelectOpen: (index: number) => void;
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;

  playlists: PlaylistFileInfo[];
  /** The open playlist; path is null for a new one that isn't saved yet. */
  service: { path: string | null; service: Service } | null;
  /** Service row the operator is working in, and the one on screen. */
  currentRow: number | null;
  liveRow: number | null;
  onSelectPlaylist: (path: string | null) => void;
  onNewPlaylist: (name: string) => void;
  onRenameService: (name: string) => void;
  onDeleteService: () => void;
  /** Save a copy of the open playlist under this name, and open it. */
  onDuplicateService: (name: string) => void;
  /** Share the open playlist, its songs and media as a Vessel file. */
  onShareService: () => void;
  /** File ▸ Export, for the open playlist. */
  onExportService: () => void;
  /** Change the service's items; gets the latest list, so quick successive drops don't clash. */
  onServiceItems: (change: (items: ServiceItem[]) => ServiceItem[]) => void;
  onOpenRow: (index: number) => void;

  // Right-click actions.
  onGoLiveRow: (index: number) => void;
  onGoLivePath: (path: string) => void;
  onNewSong: () => void;
  onOpenFiles: () => void;
  onImportDocuments: () => void;
  /** Files dragged in from Finder or Explorer onto the service, before row `at`. */
  onDropFiles: (paths: string[], at: number) => void;
  onDuplicateSong: (path: string) => void;
  onTrashSong: (path: string) => void;
  onReveal: (path: string) => void;
}

const HEADER_COLOURS: Array<[string, string]> = [
  ['Grey', '#5b6476'],
  ['Blue', '#2170d9'],
  ['Red', '#d12e52'],
  ['Purple', '#8c45c7'],
  ['Orange', '#f28c1f'],
  ['Green', '#2ea66b'],
  ['Yellow', '#d9b31a']
];

const revealLabel = navigator.platform.startsWith('Mac') ? 'Show in Finder' : 'Show in Explorer';

/** Default name for a new service: the coming Sunday, e.g. "Sunday 26 Oct". */
function nextSundayName(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `Sunday ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** A one-line name field that commits on Enter or blur and cancels on Escape. */
function NameField({ initial, placeholder, onCommit, onCancel }: { initial: string; placeholder: string; onCommit: (name: string) => void; onCancel: () => void }): React.JSX.Element {
  const [value, setValue] = useState(initial);
  // Enter/Escape finish straight away; the blur that follows must not finish again.
  const finished = useRef(false);
  const done = (commit: boolean): void => {
    if (finished.current) return;
    finished.current = true;
    if (commit && value.trim()) onCommit(value.trim());
    else onCancel();
  };
  return (
    <input
      className="playlist-name-field"
      autoFocus
      value={value}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') {
          e.preventDefault();
          done(false);
        }
      }}
    />
  );
}

function FolderManager({ settings, onAdd, onRemove, onClose }: { settings: Settings; onAdd: () => void; onRemove: (f: string) => void; onClose: () => void }): React.JSX.Element {
  return (
    <div className="folder-manager">
      <div className="folder-row">
        <span className="folder-path" title={settings.libraryFolder}>
          {settings.libraryFolder}
        </span>
        <span className="muted">Vessel</span>
      </div>
      {settings.extraFolders.map((f) => (
        <div key={f} className="folder-row">
          <span className="folder-path" title={f}>
            {f}
          </span>
          <button title="Stop showing this folder (files are kept)" onClick={() => onRemove(f)}>
            ×
          </button>
        </div>
      ))}
      <div className="folder-actions">
        <button onClick={onAdd}>Add folder…</button>
        <button onClick={onClose}>Done</button>
      </div>
      <p className="hint">New songs are saved in the Vessel folder. Added folders (like an existing song library) are shown and saved in place.</p>
    </div>
  );
}

export function Sidebar(props: SidebarProps): React.JSX.Element {
  const { service } = props;
  const [query, setQuery] = useState('');
  const [showFolders, setShowFolders] = useState(false);
  const [dropRow, setDropRow] = useState<number | null>(null);
  /** The playlist row shows the dropdown, or a name field while creating or renaming. */
  const [naming, setNaming] = useState<'new' | 'rename' | 'duplicate' | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.library;
    const words = q.split(/\s+/);
    return props.library.filter((item) => words.every((w) => item.search.includes(w)));
  }, [props.library, query]);

  const libraryPaths = useMemo(() => new Set(props.library.map((i) => i.path)), [props.library]);
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const i of props.library) seen.set(i.name, (seen.get(i.name) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  }, [props.library]);
  const fileOf = (path: string): string => path.split(/[\\/]/).pop()?.replace(/\.pro$/i, '') ?? path;
  const openByPath = useMemo(() => new Map(props.openDecks.filter((d) => d.path).map((d) => [d.path!, d])), [props.openDecks]);
  const outside = props.openDecks.map((d, i) => ({ ...d, index: i })).filter((d) => !d.path || !libraryPaths.has(d.path));

  // ---- Right-click menus -----------------------------------------------------

  const songItem = (path: string, name: string): ServiceItem => ({ id: newServiceId(), kind: 'presentation', name, path });

  /** Menu for the service area itself (title, empty space). */
  const serviceMenu = async (): Promise<void> => {
    const songs = props.library.slice(0, 60);
    const choice = await window.vessel.showMenu([
      { id: 'new', label: 'New playlist…' },
      ...(service
        ? [
            { label: 'Add song', enabled: songs.length > 0, submenu: songs.map((it, i) => ({ id: `song:${i}`, label: it.name })) },
            { id: 'header', label: 'Add header…' },
            { type: 'separator' as const },
            { id: 'rename', label: 'Rename playlist…' },
            { id: 'duplicate', label: 'Duplicate playlist…', enabled: service.service.items.length > 0 },
            { id: 'export', label: 'Export…', enabled: service.service.items.length > 0 },
            { id: 'share', label: 'Share as Vessel file…', enabled: service.service.items.length > 0 },
            { id: 'delete', label: service.path ? 'Delete playlist…' : 'Discard playlist' }
          ]
        : [])
    ]);
    if (choice === 'new') setNaming('new');
    else if (choice === 'header') setHeaderDraft('');
    else if (choice === 'rename') setNaming('rename');
    else if (choice === 'duplicate') setNaming('duplicate');
    else if (choice === 'share') props.onShareService();
    else if (choice === 'export') props.onExportService();
    else if (choice === 'delete') props.onDeleteService();
    else if (choice?.startsWith('song:')) {
      const it = songs[Number(choice.slice(5))];
      if (it) props.onServiceItems((items) => [...items, songItem(it.path, it.name)]);
    }
  };

  /** Menu for one row of the service. */
  const rowMenu = async (index: number): Promise<void> => {
    if (!service) return;
    const items = service.service.items;
    const item = items[index];
    const choice = await window.vessel.showMenu([
      ...(item.kind === 'presentation'
        ? [{ id: 'open', label: 'Open' }, { id: 'live', label: 'Go live' }, { type: 'separator' as const }]
        : [{ label: 'Colour', submenu: HEADER_COLOURS.map(([name, hex]) => ({ id: `colour:${hex}`, label: name, checked: item.color === hex })) }, { type: 'separator' as const }]),
      { id: 'up', label: 'Move up', enabled: index > 0 },
      { id: 'down', label: 'Move down', enabled: index < items.length - 1 },
      { id: 'header', label: 'Insert header above…' },
      ...(item.kind === 'presentation' ? [{ id: 'reveal', label: revealLabel }] : []),
      { type: 'separator' },
      { id: 'remove', label: 'Remove from service' }
    ]);
    if (!choice) return;
    if (choice === 'open') props.onOpenRow(index);
    else if (choice === 'live') props.onGoLiveRow(index);
    else if (choice === 'up') props.onServiceItems((list) => moveItem(list, index, index - 1));
    else if (choice === 'down') props.onServiceItems((list) => moveItem(list, index, index + 2));
    else if (choice === 'header') {
      setHeaderAt(index);
      setHeaderDraft('');
    } else if (choice === 'reveal' && item.kind === 'presentation') props.onReveal(item.path);
    else if (choice === 'remove') props.onServiceItems((list) => list.filter((it) => it.id !== item.id));
    else if (choice.startsWith('colour:')) {
      const color = choice.slice(7);
      props.onServiceItems((list) => list.map((it) => (it.id === item.id && it.kind === 'header' ? { ...it, color } : it)));
    }
  };

  /** Menu for a song in the library. */
  const songMenu = async (item: LibraryItem): Promise<void> => {
    const choice = await window.vessel.showMenu([
      { id: 'open', label: 'Open' },
      { id: 'live', label: 'Go live' },
      { id: 'add', label: 'Add to service', enabled: !!service },
      { type: 'separator' },
      { id: 'duplicate', label: 'Duplicate' },
      { id: 'reveal', label: revealLabel },
      { type: 'separator' },
      { id: 'trash', label: 'Move to Trash…' }
    ]);
    if (choice === 'open') props.onOpen(item.path);
    else if (choice === 'live') props.onGoLivePath(item.path);
    else if (choice === 'add') props.onServiceItems((list) => [...list, songItem(item.path, item.name)]);
    else if (choice === 'duplicate') props.onDuplicateSong(item.path);
    else if (choice === 'reveal') props.onReveal(item.path);
    else if (choice === 'trash') props.onTrashSong(item.path);
  };

  /** Menu for the library area itself. */
  const libraryMenu = async (): Promise<void> => {
    const choice = await window.vessel.showMenu([
      { id: 'new', label: 'New song…' },
      { id: 'open', label: 'Open…' },
      { id: 'import', label: 'Import PowerPoint, Word or text…' },
      { type: 'separator' },
      { id: 'folder', label: 'Add a library folder…' }
    ]);
    if (choice === 'new') props.onNewSong();
    else if (choice === 'open') props.onOpenFiles();
    else if (choice === 'import') props.onImportDocuments();
    else if (choice === 'folder') props.onAddFolder();
  };

  const onMenu = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const accepts = (e: DragEvent): boolean =>
    e.dataTransfer.types.includes(LIBRARY_MIME) || e.dataTransfer.types.includes(SERVICE_MIME) || (!!service && e.dataTransfer.types.includes('Files'));

  /** Drop before row `at`; Infinity appends to whatever the list is by then. */
  const drop = (e: DragEvent, at: number): void => {
    setDropRow(null);
    if (!service) return;
    e.preventDefault();
    // Files from Finder or Explorer: imported, then added here (the window handles everything else about them).
    if (e.dataTransfer.files.length) {
      e.stopPropagation();
      props.onDropFiles(window.vessel.pathsOfFiles([...e.dataTransfer.files]), at);
      return;
    }
    const row = e.dataTransfer.getData(SERVICE_MIME);
    if (row !== '') {
      props.onServiceItems((items) => moveItem(items, Number(row), at));
      return;
    }
    const raw = e.dataTransfer.getData(LIBRARY_MIME);
    if (!raw) return;
    const { path, name } = JSON.parse(raw) as { path: string; name: string };
    const item: ServiceItem = { id: newServiceId(), kind: 'presentation', name, path };
    props.onServiceItems((items) => [...items.slice(0, Math.min(at, items.length)), item, ...items.slice(Math.min(at, items.length))]);
  };

  // Electron has no window.prompt, so headers are named in an inline field.
  const [headerDraft, setHeaderDraft] = useState<string | null>(null);
  /** Where a new header goes: before this row, or at the end. */
  const [headerAt, setHeaderAt] = useState<number | null>(null);
  const addHeader = (): void => {
    const name = headerDraft?.trim();
    const at = headerAt;
    if (service && name) {
      const header: ServiceItem = { id: newServiceId(), kind: 'header', name, color: '#5b6476' };
      props.onServiceItems((items) => (at === null ? [...items, header] : [...items.slice(0, at), header, ...items.slice(at)]));
    }
    setHeaderDraft(null);
    setHeaderAt(null);
  };

  return (
    <aside className="sidebar">
      <section className="service" onContextMenu={onMenu(serviceMenu)}>
        <h3>Service</h3>
        <div className="service-picker">
          {naming ? (
            <NameField
              key={naming}
              initial={naming === 'rename' && service ? service.service.name : naming === 'duplicate' && service ? `${service.service.name} copy` : nextSundayName()}
              placeholder="Playlist name"
              onCommit={(name) => {
                setNaming(null);
                if (naming === 'new') props.onNewPlaylist(name);
                else if (naming === 'duplicate') props.onDuplicateService(name);
                else if (service && name !== service.service.name) props.onRenameService(name);
              }}
              onCancel={() => setNaming(null)}
            />
          ) : (
            <select value={service ? (service.path ?? NEW_PLAYLIST) : ''} onChange={(e) => props.onSelectPlaylist(e.target.value && e.target.value !== NEW_PLAYLIST ? e.target.value : null)}>
              <option value="">No playlist</option>
              {props.playlists.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name}
                </option>
              ))}
              {service && service.path === null && <option value={NEW_PLAYLIST}>{service.service.name} (new)</option>}
            </select>
          )}
          {!naming && (
            <>
              <button title="Rename this playlist" disabled={!service} onClick={() => setNaming('rename')}>
                ✎
              </button>
              <button title="New service playlist" onClick={() => setNaming('new')}>
                +
              </button>
              <button title={service?.path ? 'Delete this playlist (moves it to the Trash)' : 'Discard this playlist'} disabled={!service} onClick={props.onDeleteService}>
                🗑
              </button>
            </>
          )}
        </div>
        {service && (
          <>
            {service.path === null && <p className="hint">New playlist: it's saved once you add a song or header.</p>}
            <div className="service-list" onDragOver={(e) => accepts(e) && e.preventDefault()} onDrop={(e) => drop(e, Infinity)}>
              {service.service.items.length === 0 && <p className="empty">Drag songs here from the library below, or drop files from your computer.</p>}
              {service.service.items.map((item, i) => (
                <div
                  key={item.id}
                  className={`service-row ${item.kind} ${props.currentRow === i ? 'current' : ''} ${dropRow === i ? 'drop-before' : ''}`}
                  style={item.kind === 'header' ? { borderLeftColor: item.color } : undefined}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(SERVICE_MIME, String(i))}
                  onDragOver={(e) => {
                    if (!accepts(e)) return;
                    e.preventDefault();
                    setDropRow(i);
                  }}
                  onDragLeave={() => setDropRow((r) => (r === i ? null : r))}
                  onDrop={(e) => {
                    e.stopPropagation();
                    drop(e, i);
                  }}
                  onClick={() => item.kind === 'presentation' && props.onOpenRow(i)}
                  onContextMenu={onMenu(() => void rowMenu(i))}
                >
                  {props.liveRow === i && <span className="live-dot" title="On screen" />}
                  <span className="service-name">
                    {item.name}
                    {item.kind === 'presentation' && openByPath.get(item.path)?.dirty ? ' *' : ''}
                  </span>
                  {item.kind === 'presentation' && item.arrangementName && <span className="muted"> · {item.arrangementName}</span>}
                  <button
                    className="row-remove"
                    title="Remove from the service"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onServiceItems((items) => items.filter((it) => it.id !== item.id));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {headerDraft === null ? (
              <button className="add-header" onClick={() => setHeaderDraft('')}>
                + Header
              </button>
            ) : (
              <input
                className="header-draft"
                autoFocus
                placeholder="Header name, e.g. Welcome"
                value={headerDraft}
                onChange={(e) => setHeaderDraft(e.target.value)}
                onBlur={addHeader}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addHeader();
                  if (e.key === 'Escape') setHeaderDraft(null);
                }}
              />
            )}
          </>
        )}
      </section>

      <section className="library" onContextMenu={onMenu(libraryMenu)}>
        <div className="library-head">
          <h3>Library</h3>
          <button title="Choose library folders" onClick={() => setShowFolders((v) => !v)}>
            Folders
          </button>
        </div>
        {showFolders && props.settings && (
          <FolderManager settings={props.settings} onAdd={props.onAddFolder} onRemove={props.onRemoveFolder} onClose={() => setShowFolders(false)} />
        )}
        <input className="library-search" type="search" placeholder="Search titles and lyrics" value={query} onChange={(e) => setQuery(e.target.value)} />
        {props.library.length === 0 && <p className="empty">No songs yet. New songs and imports are saved here.</p>}
        {props.library.length > 0 && results.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
        {results.map((item) => {
          const open = openByPath.get(item.path);
          return (
            <button
              key={item.path}
              className={`list-item ${open?.selected ? 'selected' : ''}`}
              title={item.path}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(LIBRARY_MIME, JSON.stringify({ path: item.path, name: item.name }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => props.onOpen(item.path)}
              onContextMenu={onMenu(() => void songMenu(item))}
            >
              {item.name}
              {duplicateNames.has(item.name) && fileOf(item.path) !== item.name && <span className="muted"> · {fileOf(item.path)}</span>}
              {open?.dirty ? ' *' : ''}
            </button>
          );
        })}
      </section>

      {outside.length > 0 && (
        <section>
          <h3>Open files</h3>
          {outside.map((d) => (
            <button key={d.index} className={`list-item ${d.selected ? 'selected' : ''}`} title={d.path} onClick={() => props.onSelectOpen(d.index)}>
              {d.name || 'Untitled'}
              {d.dirty ? ' *' : ''}
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
