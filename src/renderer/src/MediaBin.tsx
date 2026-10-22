import { useState } from 'react';
import { backgroundForPath } from '../../shared/pro/background';
import type { Background, BinKind, MediaFolder, MediaItem } from '../../shared/types';
import { MediaView } from './AudienceView';
import { MusicIcon, MutedIcon, PauseIcon, PlayIcon } from './Icons';

/** Drag type for media bin items; the payload is the file path. */
export const MEDIA_MIME = 'application/x-vessel-media';
/** Drag type for moving a media item between folders; the payload is its id. */
const MEDIA_ID_MIME = 'application/x-vessel-media-id';

const FOLDER_STORE = 'vessel.mediaFolder';
/** The folder list's own entries: everything, and what isn't in a folder. */
const ALL = 'all';
const UNFILED = 'unfiled';

const KIND_FILTERS: Array<{ id: 'all' | BinKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Pictures' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' }
];

const reveal = navigator.platform.startsWith('Mac') ? 'Show in Finder' : 'Show in Explorer';

function rememberedFolder(): string {
  try {
    return localStorage.getItem(FOLDER_STORE) ?? ALL;
  } catch {
    return ALL;
  }
}

export function MediaBin({
  items,
  folders,
  liveBackground,
  playingAudio,
  onTrigger,
  onPlayAudio,
  onImport,
  onRemove,
  onItems,
  onFolders,
  onMute,
  onDropFiles,
  songName,
  onSongBackground,
  onSongPicture,
  onReveal
}: {
  items: MediaItem[];
  folders: MediaFolder[];
  liveBackground: Background | null;
  /** The audio file playing now, if any. */
  playingAudio: string | null;
  onTrigger: (bg: Background) => void;
  onPlayAudio: (item: MediaItem) => void;
  /** Import into a folder (null: not in a folder). */
  onImport: (folder: string | null) => void;
  onRemove: (id: string) => void;
  onItems: (items: MediaItem[]) => void;
  onFolders: (folders: MediaFolder[]) => void;
  /** Always play a video silently (or with sound again). */
  onMute: (item: MediaItem, muted: boolean) => void;
  /** Files dragged in from Finder or Explorer, for this folder. */
  onDropFiles: (paths: string[], folder: string | null) => void;
  /** The presentation being worked on, if any (for "whole song" actions). */
  songName: string | null;
  onSongBackground: (bg: Background) => void;
  onSongPicture: (path: string) => void;
  onReveal: (path: string) => void;
}): React.JSX.Element {
  const [folderId, setFolderIdState] = useState(rememberedFolder);
  const [kind, setKind] = useState<'all' | BinKind>('all');
  const [query, setQuery] = useState('');
  const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);

  // A folder deleted elsewhere falls back to everything.
  const current = folderId === ALL || folderId === UNFILED || folders.some((f) => f.id === folderId) ? folderId : ALL;
  const targetFolder = current === ALL || current === UNFILED ? null : current;
  const setFolderId = (id: string): void => {
    setFolderIdState(id);
    try {
      localStorage.setItem(FOLDER_STORE, id);
    } catch {
      // Remembered for this session only.
    }
  };

  const inFolder = (i: MediaItem): boolean => (current === ALL ? true : current === UNFILED ? !i.folder || !folders.some((f) => f.id === i.folder) : i.folder === current);
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => inFolder(i) && (kind === 'all' || i.kind === kind) && (!q || i.name.toLowerCase().includes(q)));
  const count = (id: string): number => items.filter((i) => (id === ALL ? true : id === UNFILED ? !i.folder || !folders.some((f) => f.id === i.folder) : i.folder === id)).length;
  const title = current === ALL ? 'All media' : current === UNFILED ? 'Not in a folder' : (folders.find((f) => f.id === current)?.name ?? 'All media');

  const move = async (ids: string[], folder: string | null): Promise<void> => onItems(await window.vessel.moveMedia(ids, folder));

  const saveName = async (): Promise<void> => {
    if (!naming) return;
    const name = naming.name.trim();
    setNaming(null);
    if (!name) return;
    if (naming.id) onFolders(await window.vessel.renameMediaFolder(naming.id, name));
    else {
      const list = await window.vessel.createMediaFolder(name);
      onFolders(list);
      const made = list[list.length - 1];
      if (made) setFolderId(made.id);
    }
  };

  const deleteFolder = async (f: MediaFolder): Promise<void> => {
    const n = count(f.id);
    if (n && !confirm(`Delete the folder “${f.name}”? Its ${n} item${n === 1 ? '' : 's'} stay in the media bin, just not in a folder. No files are deleted.`)) return;
    const result = await window.vessel.deleteMediaFolder(f.id);
    onFolders(result.folders);
    onItems(result.items);
    if (current === f.id) setFolderId(ALL);
  };

  const folderMenu = async (f: MediaFolder): Promise<void> => {
    const choice = await window.vessel.showMenu([
      { id: 'rename', label: 'Rename…' },
      { id: 'import', label: 'Import media into it…' },
      { type: 'separator' },
      { id: 'delete', label: 'Delete folder (keeps the media)' }
    ]);
    if (choice === 'rename') setNaming({ id: f.id, name: f.name });
    else if (choice === 'import') onImport(f.id);
    else if (choice === 'delete') void deleteFolder(f);
  };

  const moveMenu = (item: MediaItem): Array<{ id: string; label: string; checked?: boolean }> => [
    ...folders.map((f) => ({ id: `move:${f.id}`, label: f.name, checked: item.folder === f.id })),
    { id: 'move:', label: 'Not in a folder', checked: !item.folder }
  ];

  const itemMenu = async (item: MediaItem, bg: Background | null): Promise<void> => {
    const song = songName ? `“${songName}”` : 'the song';
    const choice = await window.vessel.showMenu([
      ...(item.kind === 'audio'
        ? [{ id: 'play', label: playingAudio === item.path ? 'Play again from the start' : 'Play' }]
        : [
            { id: 'show', label: 'Show as background now' },
            { type: 'separator' as const },
            { id: 'song-bg', label: `Background for every slide of ${song}`, enabled: !!songName },
            { id: 'song-pic', label: `Picture on every slide of ${song}`, enabled: !!songName && item.kind === 'image' },
            ...(item.kind === 'video' ? [{ type: 'separator' as const }, { id: 'mute', label: 'Always mute this video', checked: !!item.muted }] : [])
          ]),
      { type: 'separator' },
      { label: 'Move to folder', enabled: folders.length > 0, submenu: moveMenu(item) },
      { id: 'reveal', label: reveal },
      { id: 'remove', label: 'Remove from media bin (keeps the file)' }
    ]);
    if (choice === 'show' && bg) onTrigger(bg);
    else if (choice === 'play') onPlayAudio(item);
    else if (choice === 'song-bg' && bg) onSongBackground(bg);
    else if (choice === 'song-pic') onSongPicture(item.path);
    else if (choice?.startsWith('move:')) void move([item.id], choice.slice(5) || null);
    else if (choice === 'mute') onMute(item, !item.muted);
    else if (choice === 'reveal') onReveal(item.path);
    else if (choice === 'remove') onRemove(item.id);
  };

  const binMenu = async (): Promise<void> => {
    const choice = await window.vessel.showMenu([
      { id: 'import', label: targetFolder ? `Import media into “${title}”…` : 'Import media…' },
      { id: 'folder', label: 'New folder…' }
    ]);
    if (choice === 'import') onImport(targetFolder);
    else if (choice === 'folder') setNaming({ id: null, name: '' });
  };

  /** Folder rows take media dragged from the grid (to move it) and files from the computer. */
  const folderDrop = (id: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(MEDIA_ID_MIME) && !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setDropFolder(id ?? UNFILED);
    },
    onDragLeave: () => setDropFolder(null),
    onDrop: (e: React.DragEvent) => {
      setDropFolder(null);
      const mediaId = e.dataTransfer.getData(MEDIA_ID_MIME);
      if (mediaId) {
        e.preventDefault();
        void move([mediaId], id);
      } else if (e.dataTransfer.files.length) {
        e.preventDefault();
        e.stopPropagation();
        onDropFiles(window.vessel.pathsOfFiles([...e.dataTransfer.files]), id);
      }
    }
  });

  const folderButton = (id: string, label: string, f?: MediaFolder): React.JSX.Element =>
    naming && naming.id === id ? (
      <input
        key={id}
        className="media-folder-name"
        autoFocus
        value={naming.name}
        onChange={(e) => setNaming({ ...naming, name: e.target.value })}
        onBlur={() => void saveName()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void saveName();
          if (e.key === 'Escape') setNaming(null);
        }}
      />
    ) : (
      <button
        key={id}
        className={`media-folder ${current === id ? 'active' : ''} ${dropFolder === id ? 'drop' : ''}`}
        onClick={() => setFolderId(id)}
        onDoubleClick={() => f && setNaming({ id: f.id, name: f.name })}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (f) void folderMenu(f);
        }}
        title={f ? 'Drag media here to file it. Double-click to rename; right-click for more.' : undefined}
        {...(id === ALL ? {} : folderDrop(id === UNFILED ? null : id))}
      >
        <span>{label}</span>
        <span className="count">{count(id)}</span>
      </button>
    );

  return (
    <section
      className="media-bin"
      onContextMenu={(e) => {
        e.preventDefault();
        void binMenu();
      }}
    >
      <nav className="media-folders">
        {folderButton(ALL, 'All media')}
        {folders.map((f) => folderButton(f.id, f.name, f))}
        {folderButton(UNFILED, 'Not in a folder')}
        {naming && naming.id === null ? (
          <input
            className="media-folder-name"
            autoFocus
            placeholder="Folder name"
            value={naming.name}
            onChange={(e) => setNaming({ ...naming, name: e.target.value })}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName();
              if (e.key === 'Escape') setNaming(null);
            }}
          />
        ) : (
          <button className="media-folder add" onClick={() => setNaming({ id: null, name: '' })}>
            + New folder
          </button>
        )}
      </nav>

      <div
        className="media-main"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          e.stopPropagation();
          onDropFiles(window.vessel.pathsOfFiles([...e.dataTransfer.files]), targetFolder);
        }}
      >
        <div className="media-bin-header">
          <h3>{title}</h3>
          <div className="segmented small">
            {KIND_FILTERS.map((k) => (
              <button key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          <input className="media-search" type="search" placeholder="Search media" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button onClick={() => onImport(targetFolder)} title={targetFolder ? `Import into “${title}”` : 'Import pictures, videos or audio'}>
            Import…
          </button>
        </div>
        {shown.length === 0 && (
          <p className="hint media-empty">
            {items.length === 0
              ? 'Import pictures, videos or audio (or drop them here). Click a picture or video to show it behind the lyrics; click audio to play it.'
              : q || kind !== 'all'
                ? 'Nothing here matches.'
                : targetFolder
                  ? 'This folder is empty. Drag media onto its name, drop files here, or use Import….'
                  : 'Nothing here.'}
          </p>
        )}
        <div className="media-grid">
          {shown.map((item) => {
            const bg = item.kind === 'audio' ? null : backgroundForPath(item.path);
            const live = item.kind === 'audio' ? playingAudio === item.path : liveBackground?.path === item.path;
            const trigger = (): void => {
              if (item.kind === 'audio') onPlayAudio(item);
              else if (bg) onTrigger(bg);
            };
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`media-tile ${live ? 'live' : ''} ${item.kind}`}
                title={item.path}
                draggable
                onDragStart={(e) => {
                  if (item.kind !== 'audio') e.dataTransfer.setData(MEDIA_MIME, item.path);
                  e.dataTransfer.setData(MEDIA_ID_MIME, item.id);
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                onClick={trigger}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void itemMenu(item, bg);
                }}
                onKeyDown={(e) => e.key === 'Enter' && trigger()}
              >
                <div className="media-thumb">
                  {bg ? <MediaView bg={bg} muted thumbnail /> : <div className="audio-thumb">{live ? <PauseIcon size={26} /> : <MusicIcon size={26} />}</div>}
                  {item.kind === 'video' && item.muted && (
                    <span className="mute-badge" title="Always muted: plays without sound (right-click to change)">
                      <MutedIcon size={12} />
                    </span>
                  )}
                </div>
                <span className="media-name">
                  {item.kind === 'video' && <PlayIcon size={10} />}
                  {item.name}
                </span>
                <button
                  className="media-remove"
                  title="Remove from media bin (the file is kept)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
