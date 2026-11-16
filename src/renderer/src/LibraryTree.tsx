// The song library as folders inside folders: real folders inside the library
// folders, so Finder, Explorer and backups see the same thing. Drag a song or
// a folder onto a folder to move it; right-click for New folder, Rename and
// Move to Trash.
import { useEffect, useState, type DragEvent } from 'react';
import type { LibraryFolders, LibraryItem } from '../../shared/types';

/** Drag type for a library folder; the payload is its path. */
export const FOLDER_MIME = 'application/x-vessel-library-folder';
const LIBRARY_MIME = 'application/x-vessel-library';
/** Folders start open; the ones closed are remembered. */
const CLOSED_STORE = 'vessel.libraryClosed';

export interface FolderNode {
  /** Full path on disk. */
  path: string;
  name: string;
  /** A library folder itself (from Preferences): it can't be renamed, moved or trashed here. */
  isRoot: boolean;
  folders: FolderNode[];
  songs: LibraryItem[];
}

const sepOf = (root: string): string => (root.includes('\\') && !root.includes('/') ? '\\' : '/');
const lastPart = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  });

/** The library as a tree per library folder: its folders (empty ones too) and the songs in each. */
export function buildLibraryTree(library: LibraryItem[], roots: LibraryFolders[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  const trees = roots.map((r) => {
    const top: FolderNode = {
      path: r.root,
      name: lastPart(r.root),
      isRoot: true,
      folders: [],
      songs: []
    };
    nodes.set(r.root, top);
    const sep = sepOf(r.root);
    for (const rel of r.folders) {
      const parts = rel.split('/');
      let parent = top;
      parts.forEach((part, i) => {
        const path = r.root + sep + parts.slice(0, i + 1).join(sep);
        let node = nodes.get(path);
        if (!node) {
          node = { path, name: part, isRoot: false, folders: [], songs: [] };
          nodes.set(path, node);
          parent.folders.push(node);
        }
        parent = node;
      });
    }
    return top;
  });
  // Each song goes in the deepest folder it's in.
  const rootsByLength = [...roots].sort((a, b) => b.root.length - a.root.length);
  for (const item of library) {
    const root = rootsByLength.find((r) => item.path.startsWith(r.root + '/') || item.path.startsWith(r.root + '\\'));
    if (!root) continue;
    const dir = item.path.slice(0, Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\')));
    (nodes.get(dir) ?? nodes.get(root.root)!).songs.push(item);
  }
  const sort = (n: FolderNode): void => {
    n.folders.sort(byName);
    n.songs.sort(byName);
    n.folders.forEach(sort);
  };
  trees.forEach(sort);
  return trees;
}

/** Every folder, for a "Move to folder" menu: its path and a label like "Worship ▸ Hymns". */
export function folderChoices(trees: FolderNode[]): Array<{ path: string; label: string }> {
  const out: Array<{ path: string; label: string }> = [];
  const walk = (n: FolderNode, trail: string[]): void => {
    for (const f of n.folders) {
      out.push({ path: f.path, label: [...trail, f.name].join(' ▸ ') });
      walk(f, [...trail, f.name]);
    }
  };
  trees.forEach((t, i) => {
    if (i > 0) out.push({ path: t.path, label: t.name });
    walk(t, i > 0 ? [t.name] : []);
  });
  return out;
}

const countSongs = (n: FolderNode): number => n.songs.length + n.folders.reduce((s, f) => s + countSongs(f), 0);

function rememberedClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_STORE) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

type Naming = { kind: 'new'; parent: string } | { kind: 'rename'; path: string; name: string };

export function LibraryTree({
  trees,
  renderSong,
  onMoved,
  onChanged,
  onStatus,
  newTopFolder
}: {
  trees: FolderNode[];
  /** Counts up each time the library's menu asks for a new folder at the top. */
  newTopFolder: number;
  /** A song's row, as the flat list draws it, indented `depth` levels. */
  renderSong: (item: LibraryItem, depth: number) => React.JSX.Element;
  /** A song or folder moved or renamed: from → to. */
  onMoved: (from: string, to: string) => void;
  /** Folders made or trashed: list the library again. */
  onChanged: () => void;
  onStatus: (message: string) => void;
}): React.JSX.Element {
  const [closed, setClosed] = useState<Set<string>>(rememberedClosed);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const top = trees[0]?.path;
  useEffect(() => {
    if (newTopFolder && top) setNaming({ kind: 'new', parent: top });
  }, [newTopFolder, top]);
  const toggle = (path: string, to?: boolean): void =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (to ?? next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem(CLOSED_STORE, JSON.stringify([...next]));
      } catch {
        // Not kept: it opens again next time.
      }
      return next;
    });

  const fail = (err: unknown): void =>
    onStatus(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err));

  const move = (path: string, toFolder: string): void => {
    void window.vessel
      .moveInLibrary(path, toFolder)
      .then((to) => {
        onMoved(path, to);
        toggle(toFolder, true);
      })
      .catch(fail);
  };

  const accepts = (e: DragEvent): boolean => e.dataTransfer.types.includes(LIBRARY_MIME) || e.dataTransfer.types.includes(FOLDER_MIME);
  const dropInto = (e: DragEvent, folder: string): void => {
    setDropOn(null);
    const folderPath = e.dataTransfer.getData(FOLDER_MIME);
    const song = e.dataTransfer.getData(LIBRARY_MIME);
    const path = folderPath || (song ? (JSON.parse(song) as { path: string }).path : '');
    if (!path) return;
    e.preventDefault();
    e.stopPropagation();
    move(path, folder);
  };
  const dropProps = (folder: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropOn(folder);
    },
    onDragLeave: () => setDropOn((d) => (d === folder ? null : d)),
    onDrop: (e: DragEvent) => dropInto(e, folder)
  });

  const finishNaming = (value: string): void => {
    const name = value.trim();
    const n = naming;
    setNaming(null);
    if (!n || !name) return;
    if (n.kind === 'new')
      void window.vessel
        .newLibraryFolder(n.parent, name)
        .then(() => {
          toggle(n.parent, true);
          onChanged();
        })
        .catch(fail);
    else if (name !== n.name)
      void window.vessel
        .renameLibraryFolder(n.path, name)
        .then((to) => onMoved(n.path, to))
        .catch(fail);
  };

  const nameField = (initial: string, depth: number): React.JSX.Element => (
    <input
      className="library-folder-name"
      style={{ marginLeft: 8 + depth * 14 }}
      autoFocus
      defaultValue={initial}
      placeholder="Folder name, e.g. Hymns"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finishNaming(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setNaming(null);
      }}
    />
  );

  const folderMenu = async (node: FolderNode): Promise<void> => {
    const songs = countSongs(node);
    const choice = await window.vessel.showMenu([
      { id: 'new', label: 'New folder inside…' },
      ...(node.isRoot
        ? []
        : [
            { id: 'rename', label: 'Rename…' },
            { type: 'separator' as const },
            {
              id: 'trash',
              label: songs ? `Move to Trash (with its ${songs} song${songs === 1 ? '' : 's'})…` : 'Move to Trash'
            }
          ])
    ]);
    if (choice === 'new') {
      toggle(node.path, true);
      setNaming({ kind: 'new', parent: node.path });
    } else if (choice === 'rename') setNaming({ kind: 'rename', path: node.path, name: node.name });
    else if (choice === 'trash') {
      if (songs && !confirm(`Move “${node.name}” and the ${songs} song${songs === 1 ? '' : 's'} in it to the Trash?`)) return;
      void window.vessel
        .trashLibraryFolder(node.path)
        .then((ok) => (ok ? onChanged() : onStatus('Only folders inside your library can be moved to the Trash from here.')));
    }
  };

  const renderFolder = (node: FolderNode, depth: number): React.JSX.Element => {
    if (naming?.kind === 'rename' && naming.path === node.path) return <div key={node.path}>{nameField(node.name, depth)}</div>;
    const isOpen = !closed.has(node.path);
    return (
      <div key={node.path} className="library-folder-group">
        <button
          className={`library-folder ${dropOn === node.path ? 'drop-into' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          title={node.path}
          aria-expanded={isOpen}
          draggable={!node.isRoot}
          onDragStart={(e) => {
            e.dataTransfer.setData(FOLDER_MIME, node.path);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => toggle(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void folderMenu(node);
          }}
          {...dropProps(node.path)}
        >
          <span className="library-chevron" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
          <span className="library-folder-icon" aria-hidden="true">
            ▤
          </span>
          <span className="library-folder-label">{node.name}</span>
          <span className="muted library-folder-count">{countSongs(node)}</span>
        </button>
        {isOpen && renderChildren(node, depth + 1)}
      </div>
    );
  };

  const renderChildren = (node: FolderNode, depth: number): React.JSX.Element => (
    <>
      {naming?.kind === 'new' && naming.parent === node.path && nameField('', depth)}
      {node.folders.map((f) => renderFolder(f, depth))}
      {node.songs.map((s) => renderSong(s, depth))}
    </>
  );

  const [main, ...extra] = trees;
  return (
    <div className={`library-tree ${main && dropOn === main.path ? 'drop-into' : ''}`} {...(main ? dropProps(main.path) : {})}>
      {main && renderChildren(main, 0)}
      {extra.map((t) => renderFolder(t, 0))}
    </div>
  );
}
