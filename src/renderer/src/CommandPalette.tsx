import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem, PlaylistFileInfo } from '../../shared/types';
import { shortcut } from './Toolbar';

export interface PaletteAction {
  id: string;
  label: string;
  /** Other words people might type for it ("projector" for Screens). */
  words?: string;
  keys?: string;
  run: () => void;
}

interface Row {
  key: string;
  section: 'Actions' | 'Songs' | 'Playlists' | 'Bible';
  label: string;
  detail?: string;
  keys?: string;
  run: () => void;
}

/** Looks like a Bible reference: "John 3:16", "1 cor 13", "Ps 23", "Juan 3". */
const REFERENCE = /^\s*([1-3]\s*)?\p{L}[\p{L}.]{1,}\s+\d+([:.]\d+)?/u;

const matches = (text: string, words: string[]): boolean => words.every((w) => text.includes(w));

/**
 * ⌘K / Ctrl+K: type to find anything (a song, a playlist, a Bible passage or an
 * action) and press Enter. Arrow keys move, Esc closes.
 */
export function CommandPalette({
  actions,
  library,
  playlists,
  onOpenSong,
  onOpenPlaylist,
  onBible,
  onClose
}: {
  actions: PaletteAction[];
  library: LibraryItem[];
  playlists: PlaylistFileInfo[];
  onOpenSong: (path: string) => void;
  onOpenPlaylist: (path: string) => void;
  onBible: (query: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const close = (run: () => void) => () => {
      onClose();
      run();
    };
    const acts = actions
      .filter((a) => !words.length || matches(`${a.label} ${a.words ?? ''}`.toLowerCase(), words))
      .slice(0, words.length ? 6 : 12)
      .map((a): Row => ({ key: `a:${a.id}`, section: 'Actions', label: a.label, keys: a.keys, run: close(a.run) }));
    if (!words.length) return acts;
    // Songs: titles first (starting with what's typed, then containing it), then lyrics.
    const titled = library.filter((s) => matches(s.name.toLowerCase(), words));
    titled.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
    const sung = library.filter((s) => !titled.includes(s) && matches(s.search, words));
    const songs = [...titled, ...sung].slice(0, 8).map(
      (s): Row => ({ key: `s:${s.path}`, section: 'Songs', label: s.name, detail: titled.includes(s) ? undefined : 'in the words', run: close(() => onOpenSong(s.path)) })
    );
    const lists = playlists
      .filter((p) => matches(p.name.toLowerCase(), words))
      .slice(0, 4)
      .map((p): Row => ({ key: `p:${p.path}`, section: 'Playlists', label: p.name, run: close(() => onOpenPlaylist(p.path)) }));
    const bible: Row[] =
      REFERENCE.test(query) || q.length >= 3
        ? [{ key: 'b', section: 'Bible', label: REFERENCE.test(query) ? `Look up ${query.trim()}` : `Search the Bible for “${query.trim()}”`, run: close(() => onBible(query.trim())) }]
        : [];
    // A reference goes to the top; otherwise songs lead.
    return REFERENCE.test(query) ? [...bible, ...songs, ...lists, ...acts] : [...songs, ...lists, ...acts, ...bible];
  }, [query, actions, library, playlists, onOpenSong, onOpenPlaylist, onBible, onClose]);

  useEffect(() => setAt(0), [query]);
  // Keep the chosen row in view.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[at]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  let last = '';
  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Find anything" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="Find a song, a playlist, a verse like John 3:16, or an action…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={rows[at] ? `palette-${at}` : undefined}
        />
        <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
          {rows.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
          {rows.map((r, i) => {
            const heading = r.section !== last ? r.section : null;
            last = r.section;
            return (
              <li key={r.key} role="presentation">
                {heading && <div className="palette-section">{heading}</div>}
                <button
                  id={`palette-${i}`}
                  data-row={i}
                  role="option"
                  aria-selected={i === at}
                  className={`palette-row ${i === at ? 'on' : ''}`}
                  onMouseMove={() => i !== at && setAt(i)}
                  onClick={r.run}
                >
                  <span className="palette-label">{r.label}</span>
                  {r.detail && <span className="palette-detail">{r.detail}</span>}
                  {r.keys && <kbd>{shortcut(r.keys)}</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to choose
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
