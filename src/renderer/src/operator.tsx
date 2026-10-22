import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Presentation } from '../../shared/gen/presentation_pb';
import { applyLyrics, applyTheme } from '../../shared/pro/edit';
import { parsePlaylistFile, playlistViews } from '../../shared/pro/playlist';
import { decodeService, encodeService, newServiceId, type Service, type ServiceItem } from '../../shared/pro/service';
import {
  createPresentation,
  parseLyrics,
  parsePresentation,
  presentationToDeck,
  serializePresentation,
  uuidOf
} from '../../shared/pro/presentation';
import { addSlideImage, appendPresentation, resizePresentation, selectArrangement, setPresentationTimer, setSlideAdvance, setSlideBackground } from '../../shared/pro/edit';
import { EMPTY_THEME_LIBRARY, findTheme, type Theme, type ThemeLibrary } from '../../shared/theme';
import type { RemoteCommand, RemoteState, RemoteStatus } from '../../shared/remote';
import type { AppCommand } from '../../shared/shortcuts';
import { isRunning, pauseTimer, resetTimer, startTimer } from '../../shared/timer';
import {
  INITIAL_LIVE,
  INITIAL_STAGE,
  type Background,
  type Deck,
  type DisplayInfo,
  type LiveState,
  type LibraryItem,
  type MediaFolder,
  type MediaItem,
  type OpenedFile,
  type PlaylistFileInfo,
  type Settings,
  type SlideAdvance,
  type SlideView,
  type StageSlide,
  type StageState
} from '../../shared/types';
import { Editor, type Apply } from './Editor';
import { jumpForKey, nextEnabled, slideForNumber } from '../../shared/hotkeys';
import { backgroundForSlide, rememberCleared } from '../../shared/live';
import { Sidebar } from './Sidebar';
import { dropSlideOn, openGroupMenu, openSlideMenu, SLIDE_DRAG } from './slideMenus';
import { RemoteDialog } from './RemoteDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ImportDialog } from './ImportDialog';
import { copyrightLine, hasCopyrightDetails, isScripture, localDate, showsCopyright, songInfoOf, usageKey, withSongInfo } from '../../shared/ccli';
import { BiblePanel } from './BiblePanel';
import { AudioPlayer, type AudioTrack } from './AudioPlayer';
import { mediaName } from '../../shared/media';
import { MutedIcon, PlayIcon, SettingsIcon, SoundIcon, WarningIcon } from './Icons';
import { PreferencesDialog, type Section as PrefsSection } from './PreferencesDialog';
import { TimerDialog } from './TimerDialog';
import { CcliDialog } from './CcliDialog';
import { normalizeStageLayout, type StageLayout } from '../../shared/stage';
import { setGroupDefinitions } from '../../shared/groups';
import { setBackgroundDefaults } from '../../shared/pro/background';
import type { DocumentImportReport, ImportOptions } from '../../shared/import';
import { StagePanel } from './StagePanel';
import { MessagePanel } from './MessagePanel';
import { VideoTransport } from './VideoTransport';
import { PlanningCenterDialog, type PcoImport } from './PlanningCenterDialog';
import { findLibrarySong, lyricsToSongText, parseCopyright, planName } from '../../shared/planningCenter';
import { LowerThirdPanel } from './LowerThirdPanel';
import { normalizeLowerThirds, rememberLowerThird } from '../../shared/lowerThirds';
import { normalizeMessages, rememberMessage } from '../../shared/messages';
import { mediaPathsOf, relinkMedia, usesAny } from '../../shared/pro/relink';
import { pauseClock, playClock, startClock } from '../../shared/videoClock';
import { actionForTrigger, normalizeMidi, type ControlAction } from '../../shared/control';
import { listenMidi } from './midi';
import { ThemeDialog } from './ThemeDialog';
import { MediaBin } from './MediaBin';
import { AudienceView, MediaView } from './AudienceView';
import { SlideCanvas } from './SlideCanvas';
import './styles.css';

interface LoadedDeck {
  deck: Deck;
  presentation: Presentation;
  path?: string;
  dirty: boolean;
  /** Earlier versions for undo, oldest first, and undone versions for redo. */
  past: Presentation[];
  future: Presentation[];
}

const HISTORY_LIMIT = 200;

/**
 * The playlist being worked on. A new playlist has no file (path null) until
 * its first song or header is added, so naming one and leaving it empty
 * leaves nothing behind. `key` tells apart separate opens of the same name.
 */
interface OpenService {
  key: string;
  path: string | null;
  service: Service;
}

const stageSlide = (s: SlideView | undefined): StageSlide | null =>
  s ? { text: s.text, label: s.label, groupName: s.groupName, groupColor: s.groupColor } : null;

const fileName = (path: string): string => path.split(/[\\/]/).pop()?.replace(/\.pro$/i, '') ?? path;

function NewSongDialog({ onCreate, onCancel }: { onCreate: (name: string, lyrics: string) => void; onCancel: () => void }): React.JSX.Element {
  const [name, setName] = useState('');
  const [lyrics, setLyrics] = useState('');
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>New song</h2>
        <input autoFocus placeholder="Title" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          placeholder={'[Verse 1]\nFirst slide line one\nFirst slide line two\n\nSecond slide\n\n[Chorus]\nChorus slide'}
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
        />
        <p className="hint">Blank lines separate slides. A line like [Chorus] starts a group.</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!name.trim() || !lyrics.trim()} onClick={() => onCreate(name.trim(), lyrics)}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/** Timer lengths offered in the menus. */
const TIMER_SECONDS = [3, 5, 8, 10, 15, 20, 30, 45, 60, 120];

/** "8s", "1m 30s"; in words ("8 seconds", "1 minute") when `long`. */
function formatSeconds(seconds: number, long = false): string {
  if (!long) return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}` : `${seconds}s`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function SlideTile({
  slide,
  index,
  live,
  onClick,
  onMenu,
  onDropSlide
}: {
  slide: SlideView;
  index: number;
  live: boolean;
  onClick: () => void;
  onMenu: () => void;
  onDropSlide: (drag: { groupId: string; cueId: string }) => void;
}): React.JSX.Element {
  const [dropHint, setDropHint] = useState(false);
  return (
    <button
      className={`slide-tile ${live ? 'live' : ''} ${dropHint ? 'drop-before' : ''} ${slide.enabled ? '' : 'disabled'}`}
      title={slide.enabled ? undefined : 'Turned off: Next and Previous skip it. Click to show it anyway; right-click to turn it back on.'}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu();
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SLIDE_DRAG, JSON.stringify({ groupId: slide.groupId, cueId: slide.cueId }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(SLIDE_DRAG)) return;
        e.preventDefault();
        setDropHint(true);
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={(e) => {
        setDropHint(false);
        const raw = e.dataTransfer.getData(SLIDE_DRAG);
        if (raw) onDropSlide(JSON.parse(raw) as { groupId: string; cueId: string });
      }}
    >
      <div className="slide-canvas">
        {slide.background && <MediaView bg={slide.background} muted thumbnail />}
        <SlideCanvas layout={slide.layout} />
        {slide.background && <span className="bg-badge">{slide.background.kind === 'video' ? '▶' : '▣'}</span>}
        {!slide.enabled && <span className="off-badge">Off</span>}
      </div>
      <div className="slide-caption" style={{ background: slide.groupColor }}>
        <span>{index + 1}</span>
        <span className="slide-group">{slide.groupName || slide.label}</span>
        {slide.advance && (
          <span className="timer-badge" title={`Moves on by itself after ${formatSeconds(slide.advance.seconds, true)}${slide.advance.to === 'first' ? ', back to the first slide' : ''}`}>
            {slide.advance.to === 'first' ? '↺' : '⟳'} {formatSeconds(slide.advance.seconds)}
          </span>
        )}
      </div>
    </button>
  );
}

function Operator(): React.JSX.Element {
  const [decks, setDecks] = useState<LoadedDeck[]>([]);
  // Async flows (opening the next song mid-service) need decks added this tick.
  const decksRef = useRef<LoadedDeck[]>([]);
  decksRef.current = decks;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [playlistFiles, setPlaylistFiles] = useState<PlaylistFileInfo[]>([]);
  const [service, setService] = useState<OpenService | null>(null);
  const serviceRef = useRef<OpenService | null>(null);
  serviceRef.current = service;
  // Playlist writes run one after another, so a new playlist's file is created exactly once.
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  /** Service row the selected presentation came from, and the row on screen. */
  const [currentRow, setCurrentRow] = useState<number | null>(null);
  const [liveRow, setLiveRow] = useState<number | null>(null);
  const [liveSlide, setLiveSlide] = useState<{ deckId: string; index: number } | null>(null);
  const [live, setLive] = useState<LiveState>(INITIAL_LIVE);
  // The newest live state we sent. React state only catches up when main echoes
  // it back, so quick successive actions must build on this, not on `live`.
  const liveRef = useRef<LiveState>(INITIAL_LIVE);
  /** Media the operator cleared; slides with that same background don't bring it back. */
  const clearedMedia = useRef<string | null>(null);
  const pushLive = useCallback((patch: Partial<LiveState> | ((prev: LiveState) => Partial<LiveState>)) => {
    const prev = liveRef.current;
    const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
    // A new background video starts from the beginning; anything else has no clock.
    const video = next.background?.kind === 'video' ? next.background.path : null;
    if (!video) next.videoClock = null;
    else if (next.videoClock?.path !== video) next.videoClock = startClock(video, Date.now());
    liveRef.current = next;
    window.vessel.setLive(next);
  }, []);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [outputDisplay, setOutputDisplay] = useState<number | null>(null);
  const [stageDisplay, setStageDisplay] = useState<number | null>(null);
  const [stage, setStage] = useState<StageState>(INITIAL_STAGE);
  // Same pattern as liveRef: build on the newest state we sent, not on React's copy.
  const stageRef = useRef<StageState>(INITIAL_STAGE);
  const pushStage = useCallback(
    (patch: Partial<StageState>) => {
      const next = { ...stageRef.current, ...patch };
      stageRef.current = next;
      window.vessel.setStage(next);
      // A message showing {timer} follows the stage timer.
      const message = liveRef.current.message;
      if (patch.timer && message) pushLive({ message: { ...message, timer: patch.timer } });
    },
    [pushLive]
  );
  const [showNewSong, setShowNewSong] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBible, setShowBible] = useState(false);
  const [mediaFolders, setMediaFolders] = useState<MediaFolder[]>([]);
  /** Audio from the media bin, playing in the Live panel. */
  const [audio, setAudio] = useState<AudioTrack | null>(null);
  const [showCcli, setShowCcli] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showPco, setShowPco] = useState(false);
  /** Where Preferences opens (Screens ▸ Stream Output ▸ How It Looks opens Screens). */
  const [prefsSection, setPrefsSection] = useState<PrefsSection | undefined>(undefined);
  /** Bumped when Bibles are added outside the Bible panel (by dropping a file), so it reloads its list. */
  const [bibleVersion, setBibleVersion] = useState(0);
  /** The open passage (an unsaved presentation reused for each passage shown from the Bible). */
  const scriptureDeck = useRef<string | null>(null);
  /** The presentation that was selected when the Bible opened: "Add to …" puts passages there. */
  const [bibleTarget, setBibleTarget] = useState<string | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [themes, setThemes] = useState<ThemeLibrary>(EMPTY_THEME_LIBRARY);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'show' | 'edit'>('show');
  /** Slide to scroll to and focus when the editor opens ("Edit text…" in Show). */
  const [focusCue, setFocusCue] = useState<string | null>(null);
  /** Digits typed so far for "number + Enter" slide jumps. */
  const [typedNumber, setTypedNumber] = useState('');

  const selected = decks.find((d) => d.deck.id === selectedId);

  /** Media files that can't be found, among the open presentation's and the media bin's. Checked again when Vessel comes back to the front. */
  const [missing, setMissing] = useState<string[]>([]);
  const [focusCount, setFocusCount] = useState(0);
  useEffect(() => {
    const bump = (): void => setFocusCount((n) => n + 1);
    window.addEventListener('focus', bump);
    return () => window.removeEventListener('focus', bump);
  }, []);
  const selectedPresentation = selected?.presentation;
  const selectedMedia = useMemo(() => (selectedPresentation ? mediaPathsOf(selectedPresentation) : []), [selectedPresentation]);
  const mediaToCheck = [...selectedMedia, ...media.map((m) => m.path)].join('\n');
  useEffect(() => {
    let current = true;
    void window.vessel.missingMedia(mediaToCheck ? mediaToCheck.split('\n') : []).then((paths) => current && setMissing(paths));
    return () => {
      current = false;
    };
  }, [mediaToCheck, focusCount]);
  const deckMissing = selectedMedia.filter((p) => missing.includes(p));

  const updateDeck = useCallback((id: string, fn: (d: LoadedDeck) => LoadedDeck) => {
    setDecks((prev) => prev.map((d) => (d.deck.id === id ? fn(d) : d)));
  }, []);

  const withPresentation = (d: LoadedDeck, presentation: Presentation): LoadedDeck => ({
    ...d,
    presentation,
    deck: presentationToDeck(presentation, d.deck.id, d.path),
    dirty: true
  });

  const apply: Apply = (change) => {
    if (!selected) return;
    updateDeck(selected.deck.id, (d) => {
      let next: Presentation;
      try {
        next = change(d.presentation);
      } catch (err) {
        setStatus(`Edit failed: ${(err as Error).message}`);
        return d;
      }
      return { ...withPresentation(d, next), past: [...d.past, d.presentation].slice(-HISTORY_LIMIT), future: [] };
    });
  };

  const undo = useCallback(() => {
    if (!selectedId) return;
    updateDeck(selectedId, (d) =>
      d.past.length ? { ...withPresentation(d, d.past[d.past.length - 1]), past: d.past.slice(0, -1), future: [d.presentation, ...d.future] } : d
    );
  }, [selectedId, updateDeck]);

  const redo = useCallback(() => {
    if (!selectedId) return;
    updateDeck(selectedId, (d) =>
      d.future.length ? { ...withPresentation(d, d.future[0]), past: [...d.past, d.presentation], future: d.future.slice(1) } : d
    );
  }, [selectedId, updateDeck]);

  const refreshLibrary = useCallback(() => {
    void window.vessel.listLibrary().then(setLibrary);
    void window.vessel.listPlaylists().then(setPlaylistFiles);
  }, []);

  useEffect(() => {
    void window.vessel.listDisplays().then(setDisplays);
    void window.vessel.listMedia().then(setMedia);
    void window.vessel.listMediaFolders().then(setMediaFolders);
    void window.vessel.loadThemes().then(setThemes);
    void window.vessel.getSettings().then((s) => {
      setSettings(s);
      // The stage display opens with the layout chosen last time.
      pushStage({ layout: normalizeStageLayout(s.stageLayout) });
    });
    void window.vessel.getMigration().then((m) => {
      if (m?.movedDocuments) setStatus('Lumen is now Vessel: your songs and playlists moved from Documents/Lumen to Documents/Vessel, and your settings came across.');
      else if (m?.copiedSettings.length) setStatus('Lumen is now Vessel: your settings, themes and media bin came across.');
    });
    refreshLibrary();
    const offStage = window.vessel.onStage(setStage);
    const offLive = window.vessel.onLive(setLive);
    const offLibrary = window.vessel.onLibraryChanged(refreshLibrary);
    return () => {
      offStage();
      offLive();
      offLibrary();
    };
  }, [refreshLibrary]);

  // Quitting with unsaved edits asks first (the check runs in the main process).
  const unsaved = decks.filter((d) => d.dirty).length;
  useEffect(() => window.vessel.setUnsavedCount(unsaved), [unsaved]);

  const addDeck = useCallback((presentation: Presentation, path?: string, dirty = false, select = true): LoadedDeck => {
    const id = crypto.randomUUID();
    const deck = presentationToDeck(presentation, id, path);
    if (!deck.name && path) deck.name = fileName(path);
    const loaded: LoadedDeck = { deck, presentation, path, dirty, past: [], future: [] };
    decksRef.current = [...decksRef.current, loaded];
    setDecks((prev) => [...prev, loaded]);
    if (select) setSelectedId(id);
    return loaded;
  }, []);

  /** Open a presentation file once; later calls reuse (and optionally select) it. */
  const openPath = useCallback(
    async (path: string, opts: { select?: boolean; arrangementName?: string } = {}): Promise<LoadedDeck | null> => {
      const select = opts.select ?? true;
      const existing = decksRef.current.find((d) => d.path === path);
      if (existing) {
        if (select) setSelectedId(existing.deck.id);
        return existing;
      }
      const file = await window.vessel.readFile(path);
      if (!file) {
        setStatus(`Not found on this computer: ${path}`);
        return null;
      }
      // Another call may have opened it while we were reading.
      const raced = decksRef.current.find((d) => d.path === file.path);
      if (raced) {
        if (select) setSelectedId(raced.deck.id);
        return raced;
      }
      let presentation = parsePresentation(file.bytes);
      const arrangement = opts.arrangementName && presentation.arrangements.find((a) => a.name === opts.arrangementName);
      if (arrangement) presentation = selectArrangement(presentation, uuidOf(arrangement.uuid));
      return addDeck(presentation, file.path, false, select);
    },
    [addDeck]
  );

  const rowForPath = (path: string | undefined): number | null => {
    if (!service || !path) return null;
    const i = service.service.items.findIndex((it) => it.kind === 'presentation' && it.path === path);
    return i >= 0 ? i : null;
  };

  const openFromLibrary = (path: string): void => {
    void openPath(path).then((d) => d && setCurrentRow(rowForPath(d.path)));
  };

  const changeStageLayout = (layout: StageLayout): void => {
    pushStage({ layout });
    void window.vessel.updateSettings({ stageLayout: layout }).then(setSettings);
  };

  const changeTransition = (ms: number): void => {
    pushLive({ transitionMs: ms });
    void window.vessel.updateSettings({ transitionMs: ms });
  };

  // Preferences ▸ Appearance: dark (the default), light, or the computer's setting.
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.appearance ?? 'dark';
  }, [settings?.appearance]);

  /** New presentations get the slide size chosen in Preferences ▸ Screens. */
  const sized = (p: Presentation): Presentation => {
    const size = settings?.slideSize;
    return size ? resizePresentation(p, size.width, size.height) : p;
  };

  const openPresentations = async (): Promise<void> => {
    await addOpened(await window.vessel.openFiles('presentation'));
  };

  const importDocuments = async (opts: ImportOptions): Promise<void> => {
    setShowImport(false);
    await addOpened(await window.vessel.importDocuments(opts));
  };

  /** Saves a song made from a PowerPoint, Word or text file into the library and says what came across. */
  const addImportedDocument = async (presentation: Presentation, name: string, report: DocumentImportReport): Promise<{ message: string; path: string | null; name: string }> => {
    // Plain words get the default theme, like a new song.
    const song = report.look === 'lyrics' ? applyTheme(sized(presentation), findTheme(themes, themes.defaultId)) : presentation;
    const saved = await window.vessel.saveFile(serializePresentation(song), song.name || name);
    addDeck(song, saved ?? undefined, !saved);
    const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
    const notes = [plural(report.slides, 'slide'), plural(report.groups, 'group')];
    if (report.repeats) notes.push(`a “Song order” arrangement for ${plural(report.repeats, 'repeat')}`);
    if (report.pictures) notes.push(plural(report.pictures, 'picture'));
    if (report.hiddenSlides) notes.push(`${plural(report.hiddenSlides, 'hidden slide')} left out`);
    if (report.removedChordLines) notes.push(`${plural(report.removedChordLines, 'chord line')} left out`);
    if (report.ccli) notes.push('CCLI/copyright details moved into the song info');
    const skipped = Object.entries(report.skipped).map(([what, n]) => `${n} ${what}`);
    if (skipped.length) notes.push(`not brought across: ${skipped.join(', ')}`);
    return { message: `Imported “${song.name || name}” from ${report.source}: ${notes.join(', ')}.`, path: saved, name: song.name || name };
  };

  const openBible = (): void => {
    if (selectedId && selectedId !== scriptureDeck.current) setBibleTarget(selectedId);
    setShowBible(true);
  };

  /** Back to the presentation you were on, unless a passage is on screen (so → keeps moving through it). */
  const closeBible = (): void => {
    setShowBible(false);
    const passageLive = liveSlide !== null && liveSlide.deckId === scriptureDeck.current;
    if (!passageLive && bibleTarget && decksRef.current.some((d) => d.deck.id === bibleTarget)) setSelectedId(bibleTarget);
  };

  /** Put one slide of a passage on screen, reusing the one passage presentation. */
  const showScripture = (presentation: Presentation, index: number): void => {
    const existing = decksRef.current.find((d) => d.deck.id === scriptureDeck.current);
    let deck: Deck;
    // Listed under Open files as what it is: a copy on screen, not saved anywhere.
    const label = `${presentation.name} · on screen, not saved`;
    if (existing) {
      deck = { ...presentationToDeck(presentation, existing.deck.id), name: label };
      const replaced: LoadedDeck = { ...existing, presentation, deck, dirty: false, past: [], future: [] };
      decksRef.current = decksRef.current.map((d) => (d.deck.id === deck.id ? replaced : d));
      setDecks((prev) => prev.map((d) => (d.deck.id === deck.id ? replaced : d)));
      setSelectedId(deck.id);
    } else {
      const added = addDeck(presentation);
      deck = { ...added.deck, name: label };
      added.deck = deck;
      setDecks((prev) => prev.map((d) => (d.deck.id === deck.id ? { ...d, deck } : d)));
      scriptureDeck.current = deck.id;
    }
    goLiveDeck(deck, index, null);
    setStatus(`On screen: ${deck.slides[index]?.layout.boxes[1]?.text ?? presentation.name}. → and ← move through the verses.`);
  };

  /** Ask which presentation gets the passage: one that's open, or a song in the library. */
  const addScriptureTo = async (source: Presentation, name: string): Promise<void> => {
    const open = decksRef.current.filter((d) => d.deck.id !== scriptureDeck.current);
    const openPaths = new Set(open.map((d) => d.path).filter(Boolean));
    const songs = library.filter((s) => !openPaths.has(s.path)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 150);
    const last = open.find((d) => d.deck.id === bibleTarget);
    const choice = await window.vessel.showMenu([
      { label: `Add ${name} to…`, enabled: false },
      ...(last ? [{ id: `open:${last.deck.id}`, label: `${last.deck.name || 'Untitled'} (last used)` }, { type: 'separator' as const }] : []),
      ...open.filter((d) => d !== last).map((d) => ({ id: `open:${d.deck.id}`, label: `${d.deck.name || 'Untitled'}${d.dirty ? ' *' : ''}` })),
      ...(songs.length ? [{ label: 'A song in the library', submenu: songs.map((s) => ({ id: `file:${s.path}`, label: s.name })) }] : []),
      ...(!open.length && !songs.length ? [{ label: 'No presentations yet. Use Save to library instead.', enabled: false }] : [])
    ]);
    if (!choice) return;
    const deckId = choice.startsWith('open:') ? choice.slice(5) : (await openPath(choice.slice(5), { select: false }))?.deck.id;
    const target = deckId && decksRef.current.find((d) => d.deck.id === deckId);
    if (!target) return setStatus('That presentation couldn’t be opened.');
    setBibleTarget(target.deck.id);
    updateDeck(target.deck.id, (d) => {
      const next = appendPresentation(d.presentation, source).presentation;
      return { ...withPresentation(d, next), past: [...d.past, d.presentation].slice(-HISTORY_LIMIT), future: [] };
    });
    setStatus(`Added ${name} (${source.cues.length} slide${source.cues.length === 1 ? '' : 's'}) to the end of “${target.deck.name || 'Untitled'}”. Save it to keep them.`);
  };

  /** Ask which service playlist gets the passage: the open one, another, or a new one. */
  const addScriptureToService = async (presentation: Presentation, name: string): Promise<void> => {
    const current = serviceRef.current;
    const others = playlistFiles.filter((p) => p.path !== current?.path);
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const choice = await window.vessel.showMenu([
      { label: `Add ${name} to…`, enabled: false },
      ...(current ? [{ id: 'current', label: `${current.service.name || 'This service'} (open now)` }, { type: 'separator' as const }] : []),
      ...others.slice(0, 40).map((p) => ({ id: `file:${p.path}`, label: p.name })),
      ...(others.length ? [{ type: 'separator' as const }] : []),
      { id: 'new', label: `New playlist “${today}”` }
    ]);
    if (!choice) return;
    if (choice === 'new') newPlaylist(today);
    else if (choice.startsWith('file:')) await selectPlaylist(choice.slice(5));
    if (!serviceRef.current) return setStatus('That playlist couldn’t be opened.');
    await keepScripture(presentation, name, true);
  };

  /** Save a passage into the library, optionally adding it to the end of the service. */
  const keepScripture = async (presentation: Presentation, name: string, addToService: boolean): Promise<void> => {
    const path = await window.vessel.saveFile(serializePresentation(presentation), name);
    if (!path) return setStatus('The passage could not be saved.');
    addDeck(presentation, path, false, !addToService);
    if (addToService) {
      changeServiceItems((items) => [...items, { id: newServiceId(), kind: 'presentation', name, path }]);
      setStatus(`Added ${name} to the end of “${serviceRef.current?.service.name || 'the service'}” (and saved it to the library).`);
    } else setStatus(`Saved ${name} to the library.`);
    refreshLibrary();
  };

  /** Open or import files; returns the presentations that now have a file (to add to a service). */
  const addOpened = async (files: OpenedFile[], extra: string[] = []): Promise<Array<{ path: string; name: string }>> => {
    const messages: string[] = [];
    const kept: Array<{ path: string; name: string }> = [];
    let unpacked = 0;
    for (const file of files) {
      const name = fileName(file.path).replace(/\.(pro[56]x?|pptx|ppsx|docx|odt|rtf|txt|text|md|cho|chopro|chordpro|crd|ppt|pps|doc|key|pages|odp)$/i, '');
      if (file.error) {
        messages.push(`Could not open ${name}: ${file.error}`);
        continue;
      }
      try {
        const presentation = parsePresentation(file.bytes);
        if (file.documentReport) {
          const done = await addImportedDocument(presentation, name, file.documentReport);
          messages.push(done.message);
          if (done.path) kept.push({ path: done.path, name: done.name });
          continue;
        }
        const report = file.importReport;
        if (!report) {
          const already = decksRef.current.find((d) => d.path === file.path);
          if (already) setSelectedId(already.deck.id);
          else addDeck(presentation, file.path);
          kept.push({ path: file.path, name: presentation.name || name });
          continue;
        }
        // Converted from ProPresenter 5/6: saved as a new .pro in the library; the original is never touched.
        const saved = await window.vessel.saveFile(serializePresentation(presentation), presentation.name || name);
        addDeck(presentation, saved ?? undefined, !saved);
        if (saved) kept.push({ path: saved, name: presentation.name || name });
        unpacked += file.unpackedMedia ?? 0;
        const notes = [`${report.slides} slides`, `${report.groups} groups`];
        if (report.arrangements) notes.push(`${report.arrangements} arrangements`);
        if (report.backgrounds) notes.push(`${report.backgrounds} backgrounds`);
        if (report.images) notes.push(`${report.images} pictures`);
        const skipped = Object.entries(report.skipped).map(([what, n]) => `${n} ${what.replace(/Element$/, '').toLowerCase()} element(s)`);
        if (skipped.length) notes.push(`not imported yet: ${skipped.join(', ')}`);
        if (report.missingMedia.length) notes.push(`missing media: ${report.missingMedia.slice(0, 3).join(', ')}${report.missingMedia.length > 3 ? '…' : ''}`);
        messages.push(`Imported ${name} (version ${report.version}) into the library: ${notes.join(', ')}.`);
      } catch (err) {
        messages.push(`Could not read ${name}: ${(err as Error).message}`);
      }
    }
    if (unpacked) {
      setMedia(await window.vessel.listMedia());
      messages.push(`${unpacked} media file(s) unpacked to Documents/Vessel/Imported Media and added to the media bin.`);
    }
    messages.push(...extra);
    if (messages.length) setStatus(messages.join('  ·  '));
    return kept;
  };

  /**
   * Files dragged in from Finder or Explorer. Each goes where its kind belongs;
   * dropped on the service at row `serviceAt`, songs are added there too.
   */
  const addDropped = async (paths: string[], serviceAt?: number, mediaFolder?: string | null): Promise<void> => {
    if (!paths.length) return;
    let importOptions = {};
    try {
      importOptions = JSON.parse(localStorage.getItem('vessel.importOptions') ?? '{}') as object;
    } catch {
      // The Import window's last choices, if remembered; the defaults otherwise.
    }
    setStatus(`Opening ${paths.length} file${paths.length === 1 ? '' : 's'}…`);
    const dropped = await window.vessel.openDropped(paths, importOptions, mediaFolder);
    const notes: string[] = [];
    if (dropped.media) {
      // Counted against the bin as it was (with Copy media on, the bin holds the copies' paths).
      const before = new Set(media.map((m) => m.id));
      setMedia(dropped.media);
      const added = dropped.media.filter((m) => !before.has(m.id)).length;
      if (added) notes.push(`Added ${added} media file${added === 1 ? '' : 's'} to the media bin.`);
    }
    for (const b of dropped.bibles) notes.push(`Added ${b.name} (${b.abbreviation}) to the Bible: ${b.verses.toLocaleString()} verse${b.verses === 1 ? '' : 's'}.`);
    if (dropped.bibles.length) setBibleVersion((v) => v + 1);
    notes.push(...dropped.errors.map((e) => `Could not use ${e}`));
    if (!notes.length && !dropped.presentations.length && !dropped.playlists.length) notes.push('Those files were already here.');
    const kept = await addOpened(dropped.presentations, notes);
    if (dropped.playlists.length) await importPlaylists(dropped.playlists);
    if (serviceAt !== undefined && kept.length && serviceRef.current) {
      const items: ServiceItem[] = kept.map((k) => ({ id: newServiceId(), kind: 'presentation', name: k.name, path: k.path }));
      changeServiceItems((list) => [...list.slice(0, Math.min(serviceAt, list.length)), ...items, ...list.slice(Math.min(serviceAt, list.length))]);
      setStatus(`Added ${kept.map((k) => `“${k.name}”`).join(', ')} to the service.${notes.length ? `  ·  ${notes.join('  ·  ')}` : ''}`);
    }
    refreshLibrary();
  };

  // ---- Service playlists -------------------------------------------------

  /** Open every song in a service in the background, so moving between songs is instant. */
  const preload = useCallback(
    (items: ServiceItem[]) => {
      void (async () => {
        for (const it of items) if (it.kind === 'presentation') await openPath(it.path, { select: false, arrangementName: it.arrangementName });
      })();
    },
    [openPath]
  );

  const showService = (next: OpenService | null): void => {
    serviceRef.current = next;
    setService(next);
  };

  const selectPlaylist = useCallback(
    async (path: string | null) => {
      setCurrentRow(null);
      setLiveRow(null);
      if (!path) {
        showService(null);
        setSettings(await window.vessel.updateSettings({ lastPlaylist: undefined }));
        return;
      }
      const bytes = await window.vessel.readPlaylist(path);
      if (!bytes) {
        setStatus('That playlist could not be opened.');
        return;
      }
      const loaded = decodeService(bytes, fileName(path).replace(/\.proPlaylist$/i, ''));
      showService({ key: crypto.randomUUID(), path, service: loaded });
      setSettings(await window.vessel.updateSettings({ lastPlaylist: path }));
      preload(loaded.items);
    },
    [preload]
  );

  /** Write the current playlist; a new one gets its file the first time it has something in it. */
  const persistService = async (): Promise<void> => {
    const latest = serviceRef.current;
    if (!latest) return;
    if (latest.path !== null) {
      await window.vessel.writePlaylist(encodeService(latest.service), latest.service.name, latest.path);
      return;
    }
    if (latest.service.items.length === 0) return;
    const path = await window.vessel.writePlaylist(encodeService(latest.service), latest.service.name);
    const now = serviceRef.current;
    if (now && now.key === latest.key && now.path === null) {
      showService({ ...now, path });
      // Edits made while the file was being created.
      if (now.service !== latest.service) await window.vessel.writePlaylist(encodeService(now.service), now.service.name, path);
    }
    setPlaylistFiles(await window.vessel.listPlaylists());
    setSettings(await window.vessel.updateSettings({ lastPlaylist: path }));
  };

  const saveService = (next: OpenService): void => {
    showService(next);
    writeChain.current = writeChain.current.then(persistService).catch((err: Error) => setStatus(`Could not save the playlist: ${err.message}`));
  };

  /** Start a new, unsaved playlist; it is written once something is added to it. */
  const newPlaylist = (name: string): void => {
    setCurrentRow(null);
    setLiveRow(null);
    showService({ key: crypto.randomUUID(), path: null, service: { name, items: [] } });
  };

  const changeServiceItems = (change: (items: ServiceItem[]) => ServiceItem[]): void => {
    const service = serviceRef.current;
    if (!service) return;
    const items = change(service.service.items);
    const movedLive = liveRow !== null ? items.findIndex((it) => it.id === service.service.items[liveRow]?.id) : -1;
    const movedCurrent = currentRow !== null ? items.findIndex((it) => it.id === service.service.items[currentRow]?.id) : -1;
    setLiveRow(movedLive >= 0 ? movedLive : null);
    setCurrentRow(movedCurrent >= 0 ? movedCurrent : null);
    saveService({ ...service, service: { ...service.service, items } });
    preload(items);
  };

  const renameService = async (name: string): Promise<void> => {
    const service = serviceRef.current;
    if (!service) return;
    if (service.path === null) return showService({ ...service, service: { ...service.service, name } });
    await writeChain.current;
    const path = await window.vessel.renamePlaylist(service.path, name);
    saveService({ ...service, path, service: { ...service.service, name } });
    setSettings(await window.vessel.updateSettings({ lastPlaylist: path }));
    setPlaylistFiles(await window.vessel.listPlaylists());
  };

  const deleteService = async (): Promise<void> => {
    const service = serviceRef.current;
    if (!service) return;
    if (service.path === null) {
      // Never saved: nothing on disk to remove.
      if (service.service.items.length === 0 || confirm(`Discard the new playlist “${service.service.name}”?`)) await selectPlaylist(null);
      return;
    }
    if (!confirm(`Move the playlist “${service.service.name}” to the Trash? The songs stay in the library.`)) return;
    await writeChain.current;
    await window.vessel.trashPlaylist(service.path);
    await selectPlaylist(null);
    setPlaylistFiles(await window.vessel.listPlaylists());
  };

  const openRow = (row: number): void => {
    const item = service?.service.items[row];
    if (item?.kind !== 'presentation') return;
    void openPath(item.path, { arrangementName: item.arrangementName }).then((d) => d && setCurrentRow(row));
  };

  /** Open a service row's song and put its first slide on screen. */
  const goLiveRow = async (row: number): Promise<void> => {
    const item = serviceRef.current?.service.items[row];
    if (item?.kind !== 'presentation') return;
    const d = await openPath(item.path, { arrangementName: item.arrangementName });
    if (!d) return;
    setCurrentRow(row);
    goLiveDeck(d.deck, 0, row);
  };

  /** Copy a library song to a new file ("Name copy"). */
  const duplicateSong = async (path: string): Promise<void> => {
    const file = await window.vessel.readFile(path);
    if (!file) return setStatus('That song could not be read.');
    const copy = parsePresentation(file.bytes);
    copy.uuid = { $typeName: 'vessel.format.UUID', string: crypto.randomUUID().toUpperCase() };
    copy.name = `${copy.name || fileName(path)} copy`;
    const saved = await window.vessel.saveFile(serializePresentation(copy), copy.name);
    if (saved) {
      refreshLibrary();
      setStatus(`Made “${copy.name}”.`);
    }
  };

  /** Move a library song to the Trash, closing it if it's open. */
  const trashSong = async (path: string): Promise<void> => {
    const open = decksRef.current.find((d) => d.path === path);
    const name = open?.deck.name || fileName(path);
    const warning = open?.dirty ? ' It has unsaved changes, which will be lost.' : '';
    if (!confirm(`Move “${name}” to the Trash?${warning}`)) return;
    if (!(await window.vessel.trashSong(path))) return setStatus('Only songs in your library folders can be moved to the Trash from here.');
    if (open) {
      setDecks((prev) => prev.filter((d) => d.path !== path));
      if (selectedId === open.deck.id) setSelectedId(null);
      if (liveSlide?.deckId === open.deck.id) setLiveSlide(null);
    }
    refreshLibrary();
    setStatus(`Moved “${name}” to the Trash.`);
  };

  /** File ▸ Open Playlist. */
  const openPlaylist = async (): Promise<void> => importPlaylists(await window.vessel.openFiles('playlist'));

  /** ProPresenter playlists (the Library file or a .proPlaylist) become Vessel service playlists. */
  const importPlaylists = async (files: OpenedFile[]): Promise<void> => {
    let first: string | null = null;
    let count = 0;
    for (const file of files) {
      try {
        for (const view of playlistViews(parsePlaylistFile(file.bytes).document)) {
          const items: ServiceItem[] = view.entries.flatMap((e): ServiceItem[] =>
            e.kind === 'header'
              ? [{ id: newServiceId(), kind: 'header', name: e.name, color: '#5b6476' }]
              : e.kind === 'presentation' && e.documentPath
                ? [{ id: newServiceId(), kind: 'presentation', name: e.name, path: e.documentPath, arrangementName: e.arrangementName }]
                : []
          );
          const name = view.name.split(' / ').pop() || 'Imported playlist';
          const path = await window.vessel.writePlaylist(encodeService({ name, items }), name);
          first ??= path;
          count++;
        }
      } catch (err) {
        setStatus(`Could not read playlist: ${(err as Error).message}`);
      }
    }
    if (first) {
      setPlaylistFiles(await window.vessel.listPlaylists());
      await selectPlaylist(first);
      setStatus(`Imported ${count} playlist(s) as service playlists.`);
    }
  };

  const createSong = async (name: string, lyrics: string): Promise<void> => {
    setShowNewSong(false);
    const presentation = applyTheme(sized(createPresentation(name, parseLyrics(lyrics))), findTheme(themes, themes.defaultId));
    const path = await window.vessel.saveFile(serializePresentation(presentation), name);
    addDeck(presentation, path ?? undefined, !path);
    if (path) setStatus(`Saved “${name}” to the library.`);
  };

  /**
   * A Planning Center plan becomes a service playlist: songs already in the
   * library are used as they are, others are made from Planning Center's
   * lyrics (with their song details), and headers stay headers.
   */
  const importPlan = async ({ plan, items, otherAsHeadings }: PcoImport): Promise<void> => {
    const service: ServiceItem[] = [];
    let found = 0;
    let made = 0;
    const missing: string[] = [];
    let known = library;
    for (const it of items) {
      if (it.kind === 'header' || (it.kind === 'other' && otherAsHeadings)) {
        if (it.title) service.push({ id: newServiceId(), kind: 'header', name: it.title, color: '#5b6476' });
        continue;
      }
      if (it.kind !== 'song' || !it.song) continue;
      const match = findLibrarySong(it, known);
      const arrangementName = it.song.arrangement || undefined;
      if (match) {
        found++;
        service.push({ id: newServiceId(), kind: 'presentation', name: match.name, path: match.path, arrangementName });
        continue;
      }
      if (!it.song.lyrics.trim()) {
        missing.push(it.song.title);
        continue;
      }
      const name = it.song.title;
      let presentation = applyLyrics(sized(createPresentation(name, [])), lyricsToSongText(it.song.lyrics, it.song.sequence));
      const { year, publisher } = parseCopyright(it.song.copyright);
      presentation = withSongInfo(presentation, { title: name, authors: it.song.author, publisher, year, songNumber: it.song.ccli, display: false });
      presentation = applyTheme(presentation, findTheme(themes, themes.defaultId));
      const path = await window.vessel.saveFile(serializePresentation(presentation), name);
      if (!path) continue;
      made++;
      // A song that comes twice in the plan is only made once.
      known = [...known, { path, name, modified: Date.now(), slides: presentation.cues.length, search: name.toLowerCase() }];
      service.push({ id: newServiceId(), kind: 'presentation', name, path });
    }
    const name = planName(plan);
    const path = await window.vessel.writePlaylist(encodeService({ name, items: service }), name);
    setPlaylistFiles(await window.vessel.listPlaylists());
    refreshLibrary();
    await selectPlaylist(path);
    setStatus(
      `Made the service playlist “${name}”: ${found} song${found === 1 ? '' : 's'} from your library${made ? `, ${made} new from Planning Center` : ''}.${
        missing.length ? ` Left out (no lyrics in Planning Center): ${missing.join(', ')}.` : ''
      }`
    );
  };

  const changeThemes = (lib: ThemeLibrary): void => {
    setThemes(lib);
    void window.vessel.saveThemes(lib);
  };

  const applyThemeToSelected = (theme: Theme): void => {
    apply((p) => applyTheme(p, theme));
    setStatus(`Applied the “${theme.name}” theme to ${selected?.deck.name || 'the presentation'}. Undo with ⌘Z / Ctrl+Z.`);
    setShowThemes(false);
  };

  /** Ask for a folder, look there for the missing media by name, and point everything at what's found. */
  const findMissing = async (paths: string[] = missing): Promise<void> => {
    if (!paths.length) return;
    const result = await window.vessel.findMovedMedia(paths);
    if (!result) return;
    setMedia(result.items);
    const moves = result.found;
    const moved = Object.keys(moves);
    if (moved.length) {
      // Each changed presentation gets an undo step and needs saving like any edit.
      setDecks((prev) =>
        prev.map((d) =>
          usesAny(d.presentation, moved) ? { ...withPresentation(d, relinkMedia(d.presentation, moves)), past: [...d.past, d.presentation].slice(-HISTORY_LIMIT), future: [] } : d
        )
      );
      const bg = liveRef.current.background;
      if (bg && moves[bg.path]) pushLive({ background: { ...bg, path: moves[bg.path] } });
      setMissing((prev) => prev.filter((p) => !moves[p]));
    }
    const folder = fileName(result.folder);
    const n = paths.length;
    setStatus(
      moved.length === n
        ? `Found ${n === 1 ? 'the missing file' : `all ${n} missing files`} in ${folder}.`
        : moved.length
          ? `Found ${moved.length} of ${n} missing files in ${folder}. Try another folder for the rest.`
          : `None of the missing files are in ${folder} or the folders inside it.`
    );
  };

  const save = async (): Promise<void> => {
    if (!selected) return;
    const path = await window.vessel.saveFile(serializePresentation(selected.presentation), selected.deck.name, selected.path);
    if (!path) return;
    setDecks((prev) => prev.map((d) => (d.deck.id === selected.deck.id ? { ...d, path, dirty: false, deck: { ...d.deck, sourcePath: path } } : d)));
    setStatus(`Saved ${fileName(path)}`);
  };

  // Autosave (Preferences ▸ General): a moment after the last edit, write each
  // changed presentation back to its own .pro file. Writes run one at a time.
  const autosave = settings?.autosave !== false;
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!autosave) return;
    const due = decks.filter((d) => d.dirty && d.path && /\.pro$/i.test(d.path));
    if (!due.length) return;
    const timer = setTimeout(() => {
      for (const d of due) {
        const { presentation, path } = d;
        saveChain.current = saveChain.current.then(async () => {
          try {
            await window.vessel.saveFile(serializePresentation(presentation), d.deck.name, path);
          } catch (err) {
            setStatus(`Couldn’t save ${d.deck.name || fileName(path!)} automatically: ${(err as Error).message}`);
            return;
          }
          // Still unsaved if it changed again while this was being written.
          setDecks((prev) => prev.map((x) => (x.deck.id === d.deck.id && x.presentation === presentation ? { ...x, dirty: false } : x)));
        });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [decks, autosave]);

  /** The next/previous song row in the service from `row`, skipping headers. */
  const neighbourRow = useCallback(
    (row: number | null, dir: 1 | -1): number | null => {
      if (!service || row === null) return null;
      for (let i = row + dir; i >= 0 && i < service.service.items.length; i += dir) if (service.service.items[i].kind === 'presentation') return i;
      return null;
    },
    [service]
  );

  /** What the stage shows as "Next": the next slide, or the first slide of the next song. */
  const nextForStage = useCallback(
    (deck: Deck, index: number, row: number | null): StageSlide | null => {
      const following = nextEnabled(deck, index, 1);
      if (following >= 0) return stageSlide(deck.slides[following]);
      const nextRow = neighbourRow(row, 1);
      const item = nextRow !== null ? service?.service.items[nextRow] : undefined;
      const nextDeck = item?.kind === 'presentation' ? decksRef.current.find((d) => d.path === item.path)?.deck : undefined;
      const first = stageSlide(nextDeck?.slides[nextDeck ? nextEnabled(nextDeck, -1, 1) : -1]);
      return first && nextDeck ? { ...first, groupName: `${nextDeck.name}${first.groupName ? ` · ${first.groupName}` : ''}` } : null;
    },
    [neighbourRow, service]
  );

  // ---- CCLI: the copyright line and the usage log ------------------------

  const ccli = useRef({ settings: settings, output: outputDisplay });
  ccli.current = { settings, output: outputDisplay };
  /** Songs already noted today, so the log isn't asked again for every slide. */
  const loggedToday = useRef(new Set<string>());

  /** The copyright line for slide `index` of a presentation, when it should show. */
  const copyrightFor = (presentation: Presentation | undefined, index: number, count: number): string | undefined => {
    const s = ccli.current.settings;
    if (!presentation || isScripture(presentation) || !showsCopyright(s?.ccliCopyright ?? 'off', index, count)) return undefined;
    const info = songInfoOf(presentation);
    return info.display && hasCopyrightDetails(info) ? copyrightLine(info, s?.ccliLicence ?? '') : undefined;
  };

  /** Note a song in the CCLI log: once a day, only when the audience can see it, never scripture. */
  const logShown = (loaded: LoadedDeck | undefined): void => {
    if (!loaded || ccli.current.output === null || isScripture(loaded.presentation) || loaded.deck.id === scriptureDeck.current) return;
    if (!loaded.deck.slides.some((s) => s.text.trim())) return;
    const info = songInfoOf(loaded.presentation);
    const entry = { date: localDate(), title: info.title || loaded.deck.name || 'Untitled', songNumber: info.songNumber, authors: info.authors, publisher: info.publisher, ...(loaded.path ? { path: loaded.path } : {}) };
    const key = usageKey(entry);
    if (loggedToday.current.has(key)) return;
    loggedToday.current.add(key);
    void window.vessel.logSongUsage(entry);
  };

  const goLiveDeck = useCallback(
    (deck: Deck, index: number, row: number | null) => {
      const slide = deck.slides[index];
      if (!slide) return;
      const loaded = decksRef.current.find((d) => d.deck.id === deck.id);
      const copyright = copyrightFor(loaded?.presentation, index, deck.slides.length);
      logShown(loaded);
      setLiveSlide({ deckId: deck.id, index });
      setLiveRow(row);
      // A slide without its own background keeps whatever is showing; one with
      // its own shows it, unless the operator just cleared that same media.
      pushLive((prev) => {
        const next = backgroundForSlide(slide.background, prev.background, clearedMedia.current);
        clearedMedia.current = next.cleared;
        return { text: slide.text, layout: slide.layout, cleared: false, blackout: false, background: next.background, copyright, logo: null };
      });
      pushStage({ current: stageSlide(slide), next: nextForStage(deck, index, row) });
    },
    [pushLive, pushStage, nextForStage]
  );

  /** Row in the service for a deck: the one it was opened from, else its first appearance. */
  const rowOfDeck = useCallback(
    (deck: Deck): number | null => {
      if (!service) return null;
      const items = service.service.items;
      const path = decksRef.current.find((d) => d.deck.id === deck.id)?.path;
      for (const r of [liveRow, currentRow]) if (r !== null && items[r]?.kind === 'presentation' && (items[r] as { path: string }).path === path) return r;
      const i = items.findIndex((it) => it.kind === 'presentation' && it.path === path);
      return i >= 0 ? i : null;
    },
    [service, liveRow, currentRow]
  );

  const goLive = useCallback(
    (deckId: string, index: number) => {
      const deck = decksRef.current.find((d) => d.deck.id === deckId)?.deck;
      if (deck) goLiveDeck(deck, index, rowOfDeck(deck));
    },
    [goLiveDeck, rowOfDeck]
  );

  /** Step through slides, rolling into the next or previous song of the service at the ends. */
  const step = useCallback(
    async (dir: 1 | -1) => {
      // Next/previous act on the presentation you're looking at; if it isn't on
      // screen yet, either key starts it from its first slide.
      const deckId = selectedId ?? liveSlide?.deckId;
      const deck = decksRef.current.find((d) => d.deck.id === deckId)?.deck;
      if (!deck) return;
      const current = liveSlide?.deckId === deck.id ? liveSlide.index : -1;
      // Turned-off slides are passed over.
      const target = current === -1 ? nextEnabled(deck, -1, 1) : nextEnabled(deck, current, dir);
      if (target >= 0) return goLiveDeck(deck, target, rowOfDeck(deck));
      const row = neighbourRow(liveSlide?.deckId === deck.id ? (liveRow ?? rowOfDeck(deck)) : currentRow, dir);
      const item = row !== null ? service?.service.items[row] : undefined;
      if (item?.kind !== 'presentation') return;
      const next = await openPath(item.path, { arrangementName: item.arrangementName });
      const index = next ? nextEnabled(next.deck, dir === 1 ? -1 : next.deck.slides.length, dir) : -1;
      if (!next || index < 0) return;
      setCurrentRow(row);
      goLiveDeck(next.deck, index, row);
    },
    [liveSlide, selectedId, liveRow, currentRow, goLiveDeck, rowOfDeck, neighbourRow, service, openPath]
  );

  // ---- Video sound on the output -------------------------------------------

  const [videoSound, setVideoSound] = useState<{ volume: number; muted: boolean }>(() => {
    try {
      return { volume: 1, muted: false, ...(JSON.parse(localStorage.getItem('vessel.videoSound') ?? '{}') as object) };
    } catch {
      return { volume: 1, muted: false };
    }
  });
  useEffect(() => {
    pushLive({ videoVolume: videoSound.volume, videoMuted: videoSound.muted });
    try {
      localStorage.setItem('vessel.videoSound', JSON.stringify(videoSound));
    } catch {
      // Not remembered; it applies now.
    }
  }, [videoSound, pushLive]);
  // Preferences ▸ Audio and video: where sound goes, its level and delay, for the output's videos too.
  useEffect(() => {
    pushLive({ audioOutputId: settings?.audioOutputId ?? '', audioLevel: settings?.audioLevel ?? 1, audioDelayMs: settings?.audioDelayMs ?? 0 });
  }, [settings?.audioOutputId, settings?.audioLevel, settings?.audioDelayMs, pushLive]);
  // Preferences ▸ Groups and Media: colours and keys for groups, and how new backgrounds behave.
  useEffect(() => {
    setGroupDefinitions(settings?.groups);
    setBackgroundDefaults({ scale: settings?.mediaScale, videoLoop: settings?.videoLoop });
  }, [settings?.groups, settings?.mediaScale, settings?.videoLoop]);

  // Videos set to Always mute in the media bin stay silent wherever they're used.
  useEffect(() => {
    pushLive({ silentVideos: media.filter((m) => m.kind === 'video' && m.muted).map((m) => m.path) });
  }, [media, pushLive]);
  const liveVideo = live.background?.kind === 'video' ? live.background : null;
  const liveVideoItem = liveVideo ? media.find((m) => m.path === liveVideo.path) : undefined;

  // ---- Slide timers (announcement loops) ----------------------------------

  /** When the slide on screen moves on by itself, and whether the operator has paused that. */
  const [advanceAt, setAdvanceAt] = useState<{ at: number; seconds: number; to: SlideAdvance['to'] } | null>(null);
  const [timerPaused, setTimerPaused] = useState(false);
  /** The Custom time window: for the whole presentation, or one slide. */
  const [askTimer, setAskTimer] = useState<
    { kind: 'deck'; seconds?: number; loop: boolean } | { kind: 'slide'; cueId: string; seconds?: number; to: SlideAdvance['to'] } | null
  >(null);
  const [, setTick] = useState(0);

  /** The slide a timer moves to from `index`, skipping turned-off slides; -1 for none. */
  const timerTarget = (deck: Deck, index: number, to: SlideAdvance['to']): number => {
    if (to === 'next') return nextEnabled(deck, index, 1);
    if (to === 'first') return nextEnabled(deck, -1, 1);
    if (to === 'random') {
      const others = deck.slides.map((_s, i) => i).filter((i) => i !== index && deck.slides[i].enabled);
      return others.length ? others[Math.floor(Math.random() * others.length)] : -1;
    }
    return deck.slides.findIndex((s) => s.cueId === to.cueId && s.enabled);
  };

  const advanceNow = useRef<() => void>(() => undefined);
  advanceNow.current = () => {
    // Cleared text stays cleared; clicking a slide starts things again.
    if (!liveSlide || liveRef.current.cleared) return setAdvanceAt(null);
    const deck = decksRef.current.find((d) => d.deck.id === liveSlide.deckId)?.deck;
    const advance = deck?.slides[liveSlide.index]?.advance;
    if (!deck || !advance) return;
    const target = timerTarget(deck, liveSlide.index, advance.to);
    if (target >= 0) goLiveDeck(deck, target, liveRow);
    else setAdvanceAt(null);
  };

  // Each time a slide goes on screen (even the same one again), its timer starts afresh.
  useEffect(() => {
    setAdvanceAt(null);
    if (!liveSlide || timerPaused) return;
    const advance = decksRef.current.find((d) => d.deck.id === liveSlide.deckId)?.deck.slides[liveSlide.index]?.advance;
    if (!advance) return;
    setAdvanceAt({ at: Date.now() + advance.seconds * 1000, seconds: advance.seconds, to: advance.to });
    const timer = setTimeout(() => advanceNow.current(), advance.seconds * 1000);
    return () => clearTimeout(timer);
  }, [liveSlide, timerPaused]);

  /** "Loop · 8s", "Once · 8s", "Some slides timed", or null when no slide has a timer. */
  const deckTimer = (deck: Deck): string | null => {
    const timed = deck.slides.filter((s) => s.advance);
    if (!timed.length) return null;
    const seconds = new Set(timed.map((s) => s.advance!.seconds));
    const last = deck.slides[deck.slides.length - 1];
    const loops = last?.advance?.to === 'first';
    const everyButLast = deck.slides.slice(0, -1).every((s) => s.advance?.to === 'next');
    if (seconds.size === 1 && everyButLast && (loops || !last?.advance)) return `${loops ? 'Loop' : 'Once'} · ${formatSeconds([...seconds][0])}`;
    return 'Some slides timed';
  };

  const timerMenu = async (): Promise<void> => {
    if (!selected) return;
    const current = deckTimer(selected.deck);
    const choices = TIMER_SECONDS.map((s) => ({ s, label: formatSeconds(s, true) }));
    const choice = await window.vessel.showMenu([
      { label: 'Loop: each slide moves on, then back to the first', submenu: choices.map((c) => ({ id: `loop:${c.s}`, label: `Every ${c.label}`, checked: current === `Loop · ${formatSeconds(c.s)}` })) },
      { label: 'Play through once, stopping on the last slide', submenu: choices.map((c) => ({ id: `once:${c.s}`, label: `Every ${c.label}`, checked: current === `Once · ${formatSeconds(c.s)}` })) },
      { id: 'custom', label: 'Custom time…' },
      { type: 'separator' },
      { id: 'off', label: 'No timers (move on by hand)', enabled: !!current }
    ]);
    if (!choice) return;
    if (choice === 'custom') {
      const timed = selected.deck.slides.find((s) => s.advance);
      return setAskTimer({ kind: 'deck', seconds: timed?.advance?.seconds, loop: !current?.startsWith('Once') });
    }
    const [kind, value] = choice.split(':');
    if (kind === 'off') {
      apply((p) => setPresentationTimer(p, null));
      return setStatus('Timers removed. Save to keep the change.');
    }
    const seconds = Number(value);
    apply((p) => setPresentationTimer(p, seconds, kind === 'loop'));
    setStatus(
      `${kind === 'loop' ? 'Looping' : 'Playing through once'}: every slide moves on after ${formatSeconds(seconds, true)}. Click a slide to start; Pause in the Live panel holds it. Save to keep it (ProPresenter 7 reads these timers too).`
    );
  };

  // Redraw the countdown while a timer runs.
  useEffect(() => {
    if (!advanceAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [advanceAt]);

  // Edits to the presentation on screen (text, theme) show live straight away.
  useEffect(() => {
    if (!liveSlide || liveRef.current.cleared) return;
    const loaded = decks.find((d) => d.deck.id === liveSlide.deckId);
    const deck = loaded?.deck;
    const slide = deck?.slides[liveSlide.index];
    if (!deck || !slide) return;
    const copyright = copyrightFor(loaded.presentation, liveSlide.index, deck.slides.length);
    if (slide.text !== liveRef.current.text || copyright !== liveRef.current.copyright || JSON.stringify(slide.layout) !== JSON.stringify(liveRef.current.layout)) {
      pushLive({ text: slide.text, layout: slide.layout, copyright });
      pushStage({ current: stageSlide(slide), next: nextForStage(deck, liveSlide.index, liveRow) });
    }
  }, [decks, liveSlide, liveRow, pushLive, pushStage, nextForStage, settings]);

  const showBackground = useCallback(
    (bg: Background | null) => {
      clearedMedia.current = bg ? null : rememberCleared(liveRef.current.background, clearedMedia.current);
      pushLive({ background: bg, blackout: false });
    },
    [pushLive]
  );
  const clear = useCallback(() => {
    pushLive({ cleared: true });
    pushStage({ current: null });
  }, [pushLive, pushStage]);
  const clearAll = useCallback(() => {
    // Everything: lyrics, background and audio.
    setAudio(null);
    setLiveSlide(null);
    setLiveRow(null);
    clearedMedia.current = rememberCleared(liveRef.current.background, clearedMedia.current);
    pushLive({ cleared: true, background: null });
    pushStage({ current: null, next: null });
  }, [pushLive, pushStage]);
  const toggleBlackout = useCallback(() => pushLive((prev) => ({ blackout: !prev.blackout })), [pushLive]);

  const logoKey = useRef<() => void>(() => undefined);
  logoKey.current = () => toggleLogo();

  /** The Logo button: the church's logo instead of the slides, until it's pressed again or a slide goes on screen. */
  const toggleLogo = (): void => {
    if (liveRef.current.logo) return pushLive({ logo: null });
    const logo = ccli.current.settings?.logoPath;
    if (!logo) {
      setStatus('Choose your logo first: Preferences ▸ General ▸ Logo.');
      return setShowPrefs(true);
    }
    pushLive({ logo });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (mode === 'edit' || e.metaKey || e.ctrlKey || e.altKey) return;
      const deck = decksRef.current.find((d) => d.deck.id === selectedId)?.deck;
      const current = deck && liveSlide?.deckId === deck.id ? liveSlide.index : -1;

      // Typing a slide number, then Enter, jumps there; Escape cancels the number first.
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setTypedNumber((n) => (n + e.key).slice(-4));
        return;
      }
      if (typedNumber) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const index = deck ? slideForNumber(deck, typedNumber) : null;
          if (deck && index !== null) goLive(deck.id, index);
          setTypedNumber('');
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          setTypedNumber((n) => n.slice(0, -1));
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setTypedNumber('');
          return;
        }
      }

      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        void step(1);
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        void step(-1);
      } else if (e.key === 'Escape' && e.shiftKey) {
        clearAll();
      } else if (e.key === 'Escape' || e.key === 'F1') {
        clear();
      } else if (e.key === '.') {
        toggleBlackout();
      } else if (/^[a-z]$/i.test(e.key)) {
        // A group's letter jumps to it (C → Chorus); pressing it again moves to the next one.
        const index = deck ? jumpForKey(deck, e.key, current) : null;
        if (deck && index !== null) {
          e.preventDefault();
          goLive(deck.id, index);
        } else if (e.key.toLowerCase() === 'l') {
          // L shows the logo, unless the song has a group on L.
          e.preventDefault();
          logoKey.current();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, clear, clearAll, toggleBlackout, undo, redo, mode, save, selectedId, liveSlide, goLive, typedNumber]);

  // A typed number that's left alone for a while is forgotten.
  useEffect(() => {
    if (!typedNumber) return;
    const t = setTimeout(() => setTypedNumber(''), 4000);
    return () => clearTimeout(t);
  }, [typedNumber]);

  const changeOutput = (value: string): void => {
    const id = value === '' ? null : Number(value);
    setOutputDisplay(id);
    void window.vessel.setOutput(id);
    void window.vessel.updateSettings({ outputDisplayId: id });
  };

  const changeStageOutput = (value: string): void => {
    const id = value === '' ? null : Number(value);
    setStageDisplay(id);
    void window.vessel.setStageOutput(id);
    void window.vessel.updateSettings({ stageDisplayId: id });
  };

  // Restore the last session once settings and displays are known: playlist, fade, screens.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !settings || displays.length === 0) return;
    restored.current = true;
    if (settings.transitionMs !== undefined) pushLive({ transitionMs: settings.transitionMs });
    if (settings.lastPlaylist && settings.reopenLastPlaylist !== false) void selectPlaylist(settings.lastPlaylist);
    const ids = new Set(displays.map((d) => d.id));
    // Preferences ▸ Screens can leave the audience screen off until it's chosen.
    if (settings.outputDisplayId != null && ids.has(settings.outputDisplayId) && settings.showOutputAtLaunch !== false) changeOutput(String(settings.outputDisplayId));
    if (settings.stageDisplayId != null && ids.has(settings.stageDisplayId) && settings.stageDisplayId !== settings.outputDisplayId)
      changeStageOutput(String(settings.stageDisplayId));
    // The stream output comes back too, in its window or on its display if that's still there.
    const stream = settings.streamOutput;
    if (settings.showOutputAtLaunch !== false && (stream === 'window' || (typeof stream === 'number' && ids.has(stream)))) void window.vessel.setStreamOutput(stream);
  });

  const displayOptions = (taken: number | null): React.JSX.Element[] =>
    displays.map((d) => (
      // One display can't show both outputs; the one in use elsewhere is greyed out.
      <option key={d.id} value={d.id} disabled={d.id === taken}>
        {d.label} {d.bounds.width}×{d.bounds.height}
        {d.primary ? ' (main)' : ''}
      </option>
    ));

  // ---- Remote control ----------------------------------------------------

  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  const [showRemote, setShowRemote] = useState(false);
  useEffect(() => {
    void window.vessel.remoteStatus().then(setRemote);
    return window.vessel.onRemoteStatus(setRemote);
  }, []);

  /** What phones show: the presentation you're looking at, the service, what's live and the stage. */
  const openRemote = (): void => setShowRemote(true);

  const remoteState = useMemo<RemoteState>(
    () => ({
      presentation: selected
        ? {
            name: selected.deck.name,
            slides: selected.deck.slides.map((s) => ({ text: s.text, group: s.groupName, color: s.groupColor })),
            liveIndex: liveSlide?.deckId === selected.deck.id ? liveSlide.index : null
          }
        : null,
      service: service
        ? {
            name: service.service.name,
            items: service.service.items.map((it, i) => ({ name: it.name, kind: it.kind, current: i === currentRow, live: i === liveRow }))
          }
        : null,
      live: { text: live.text, cleared: live.cleared, blackout: live.blackout },
      next: stage.next ? { text: stage.next.text, group: stage.next.groupName, color: stage.next.groupColor } : null,
      timer: stage.timer,
      message: stage.message
    }),
    [selected, liveSlide, service, currentRow, liveRow, live, stage]
  );
  const remoteStateRef = useRef(remoteState);
  remoteStateRef.current = remoteState;
  const sentRemote = useRef('');
  useEffect(() => {
    const json = JSON.stringify(remoteState);
    if (json === sentRemote.current) return;
    sentRemote.current = json;
    window.vessel.setRemoteState(remoteState);
  }, [remoteState]);
  useEffect(() => window.vessel.onRemoteStateRequest(() => window.vessel.setRemoteState(remoteStateRef.current)), []);

  /** Actions from MIDI, a Stream Deck or Companion: the same as the buttons and keys. */
  const runControl = useRef<(a: ControlAction) => void>(() => undefined);
  runControl.current = (a) => {
    const now = Date.now();
    switch (a) {
      case 'next':
        return void step(1);
      case 'prev':
        return void step(-1);
      case 'clear':
        return clear();
      case 'clear-media':
        return showBackground(null);
      case 'clear-all':
        return clearAll();
      case 'black':
        return toggleBlackout();
      case 'logo':
        return toggleLogo();
      case 'video': {
        const c = liveRef.current.videoClock;
        const loop = !!liveRef.current.background?.loop;
        if (c) pushLive({ videoClock: c.playing ? pauseClock(c, now, NaN, loop) : playClock(c, now, NaN, loop) });
        return;
      }
      case 'timer': {
        const t = stageRef.current.timer;
        return pushStage({ timer: isRunning(t) ? pauseTimer(t, now) : startTimer(t, now) });
      }
      case 'timer-reset':
        return pushStage({ timer: resetTimer(stageRef.current.timer) });
      case 'hide-message':
        return pushLive({ message: null });
      case 'hide-lower-third':
        return pushLive({ lowerThird: null });
    }
  };

  // MIDI (Preferences ▸ Control): each note or controller set there runs its action.
  const midi = normalizeMidi(settings?.midi);
  const midiRef = useRef(midi);
  midiRef.current = midi;
  useEffect(() => {
    if (!midi.enabled) return;
    return listenMidi((trigger, input) => {
      const m = midiRef.current;
      if (m.input && m.input !== input) return;
      // Preferences is learning a new trigger: don't run anything meanwhile.
      if (document.querySelector('.midi-learning')) return;
      const action = actionForTrigger(m.bindings, trigger);
      if (action) runControl.current(action);
    });
  }, [midi.enabled]);

  // Phone commands run through the same actions as the keyboard and mouse.
  const remoteCommand = useRef<(c: RemoteCommand) => void>(() => undefined);
  remoteCommand.current = (c) => {
    switch (c.type) {
      case 'next':
        return void step(1);
      case 'prev':
        return void step(-1);
      case 'clear':
        return clear();
      case 'clearAll':
        return clearAll();
      case 'black':
        return toggleBlackout();
      case 'goto':
        if (selected) goLive(selected.deck.id, c.index);
        return;
      case 'openRow':
        return openRow(c.row);
      case 'timer': {
        const t = stageRef.current.timer;
        const now = Date.now();
        return pushStage({ timer: c.action === 'start' ? startTimer(t, now) : c.action === 'pause' ? pauseTimer(t, now) : resetTimer(t) });
      }
      case 'message':
        return pushStage({ message: c.text });
      case 'action':
        return runControl.current(c.action);
    }
  };
  useEffect(() => window.vessel.onRemoteCommand((c) => remoteCommand.current(c)), []);

  // ---- Menu bar ------------------------------------------------------------

  const [showShortcuts, setShowShortcuts] = useState(false);

  // Keep the menu bar's ticks and enabled items in step.
  useEffect(() => {
    window.vessel.setMenuState({ mode, outputId: outputDisplay, stageId: stageDisplay, hasPresentation: !!selected });
  }, [mode, outputDisplay, stageDisplay, selected]);

  /** Undo/Redo from the menu: the text box you're typing in if there is one, else the presentation. */
  const typing = (): boolean => document.activeElement instanceof HTMLElement && !!document.activeElement.closest('input, textarea');

  const appCommand = useRef<(c: AppCommand) => void>(() => undefined);
  appCommand.current = (c) => {
    if (c.startsWith('output:')) return changeOutput(c === 'output:off' ? '' : c.slice(7));
    if (c.startsWith('stage:')) return changeStageOutput(c === 'stage:off' ? '' : c.slice(6));
    switch (c) {
      case 'new-song':
        return setShowNewSong(true);
      case 'open':
        return void openPresentations();
      case 'import-documents':
        return setShowImport(true);
      case 'bible':
        return openBible();
      case 'ccli':
        return setShowCcli(true);
      case 'preferences':
        setPrefsSection(undefined);
        return setShowPrefs(true);
      case 'planning-center':
        return setShowPco(true);
      case 'stream-look':
        setPrefsSection('screens');
        return setShowPrefs(true);
      case 'open-playlist':
        return void openPlaylist();
      case 'import-media':
        return void window.vessel.importMedia().then(setMedia);
      case 'save':
        return void save();
      case 'undo':
        return typing() ? void document.execCommand('undo') : undo();
      case 'redo':
        return typing() ? void document.execCommand('redo') : redo();
      case 'mode-show':
        return setMode('show');
      case 'mode-edit':
        return selected ? setMode('edit') : undefined;
      case 'next':
        return void step(1);
      case 'prev':
        return void step(-1);
      case 'clear':
        return clear();
      case 'clear-media':
        return showBackground(null);
      case 'clear-all':
        return clearAll();
      case 'black':
        return toggleBlackout();
      case 'logo':
        return toggleLogo();
      case 'themes':
        return setShowThemes(true);
      case 'remote':
        return setShowRemote(true);
      case 'shortcuts':
        return setShowShortcuts(true);
    }
  };
  useEffect(() => window.vessel.onAppCommand((c) => appCommand.current(c)), []);

  // ---- Files dragged in from Finder or Explorer ---------------------------

  const [draggingFiles, setDraggingFiles] = useState(false);
  const dropFiles = useRef<(paths: string[], serviceAt?: number) => void>(() => undefined);
  dropFiles.current = (paths, serviceAt) => void addDropped(paths, serviceAt);
  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files');
    // dragenter/dragleave fire for every element crossed; count them to know when the drag leaves the window.
    let depth = 0;
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth++;
      setDraggingFiles(true);
    };
    const leave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDraggingFiles(false);
    };
    const over = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent): void => {
      depth = 0;
      setDraggingFiles(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      dropFiles.current(window.vessel.pathsOfFiles([...(e.dataTransfer?.files ?? [])]));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const liveMenu = async (): Promise<void> => {
    const choice = await window.vessel.showMenu([
      { id: 'clear', label: 'Clear text', accelerator: 'Escape', enabled: !live.cleared },
      { id: 'clear-media', label: 'Clear media', enabled: !!live.background },
      { id: 'clear-all', label: 'Clear all', accelerator: 'Shift+Escape' },
      { id: 'stop-audio', label: 'Stop audio', enabled: !!audio },
      { type: 'separator' },
      { id: 'logo', label: live.logo ? 'Hide the logo' : 'Show the logo', accelerator: 'L' },
      { id: 'black', label: live.blackout ? 'Bring screen back' : 'Black screen', accelerator: '.' }
    ]);
    if (choice === 'stop-audio') setAudio(null);
    else if (choice) appCommand.current(choice as AppCommand);
  };

  const groups = useMemo(() => {
    if (!selected) return [];
    const out: Array<{ groupId: string; name: string; color?: string; hotkey?: string; slides: Array<{ slide: SlideView; index: number }> }> = [];
    const keyOf = new Map(selected.deck.groups.map((g) => [g.id, g.hotkey]));
    // A group starts a new block when it changes, or repeats (Chorus, Chorus) in an arrangement.
    const firstCue = new Map(selected.deck.groups.map((g) => [g.id, g.slides[0]?.cueId]));
    let lastGroupId: string | undefined;
    selected.deck.slides.forEach((slide, index) => {
      const last = out[out.length - 1];
      if (last && slide.groupId === lastGroupId && firstCue.get(slide.groupId) !== slide.cueId) last.slides.push({ slide, index });
      else out.push({ groupId: slide.groupId, name: slide.groupName, color: slide.groupColor, hotkey: keyOf.get(slide.groupId), slides: [{ slide, index }] });
      lastGroupId = slide.groupId;
    });
    return out;
  }, [selected]);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">Vessel</div>
        <button onClick={() => setShowNewSong(true)}>New song</button>
        <button onClick={openPresentations} title="Open a presentation (.pro) or import an older one (.pro5, .pro6, .pro6x)">
          Open…
        </button>
        <button onClick={() => setShowImport(true)} title="Make songs from PowerPoint, Word or text files">
          Import…
        </button>
        <button onClick={openPlaylist}>Open playlist</button>
        <button className={showBible ? 'active-toggle' : ''} onClick={() => (showBible ? closeBible() : openBible())} title="Show Bible verses (⌘B / Ctrl+B)">
          Bible
        </button>
        <button onClick={() => setShowThemes(true)}>Themes…</button>
        <button className={remote?.enabled ? 'remote-on' : ''} title="Control Vessel from a phone or tablet" onClick={openRemote}>
          Remote{remote?.enabled ? ` ●${remote.clients ? ` ${remote.clients}` : ''}` : ''}
        </button>
        <button onClick={save} disabled={!selected}>
          Save{selected?.dirty ? ' *' : ''}
        </button>
        <div className="segmented">
          <button className={mode === 'show' ? 'active' : ''} onClick={() => setMode('show')}>
            Show
          </button>
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')} disabled={!selected}>
            Edit
          </button>
        </div>
        <div className="spacer" />
        <label className="output-select display-select" title="Audience screen">
          Output
          <select value={outputDisplay ?? ''} onChange={(e) => changeOutput(e.target.value)}>
            <option value="">Off</option>
            {displayOptions(stageDisplay)}
          </select>
        </label>
        <label className="output-select display-select" title="Stage display for the people on stage">
          Stage
          <select value={stageDisplay ?? ''} onChange={(e) => changeStageOutput(e.target.value)}>
            <option value="">Off</option>
            {displayOptions(outputDisplay)}
          </select>
        </label>
        <label className="output-select" title="Crossfade length for slides and media">
          Fade
          <select value={live.transitionMs} onChange={(e) => changeTransition(Number(e.target.value))}>
            <option value={0}>Cut</option>
            <option value={250}>0.25s</option>
            <option value={500}>0.5s</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
          </select>
        </label>
        <button className="icon-button toolbar-prefs" onClick={() => setShowPrefs(true)} title="Preferences (⌘, / Ctrl+,)" aria-label="Preferences">
          <SettingsIcon />
        </button>
      </header>

      <Sidebar
        settings={settings}
        library={library}
        openDecks={decks.map((d) => ({ path: d.path, name: d.deck.name, dirty: d.dirty, selected: d.deck.id === selectedId }))}
        onOpen={openFromLibrary}
        onSelectOpen={(i) => setSelectedId(decks[i]?.deck.id ?? null)}
        onAddFolder={() => void window.vessel.addLibraryFolder().then((s2) => (setSettings(s2), refreshLibrary()))}
        onRemoveFolder={(f) => void window.vessel.removeLibraryFolder(f).then((s2) => (setSettings(s2), refreshLibrary()))}
        playlists={playlistFiles}
        service={service}
        currentRow={currentRow}
        liveRow={liveRow}
        onSelectPlaylist={(path) => void selectPlaylist(path)}
        onNewPlaylist={newPlaylist}
        onRenameService={(name) => void renameService(name)}
        onDeleteService={() => void deleteService()}
        onServiceItems={changeServiceItems}
        onOpenRow={openRow}
        onGoLiveRow={(row) => void goLiveRow(row)}
        onGoLivePath={(path) => void openPath(path).then((d) => d && goLiveDeck(d.deck, 0, rowForPath(d.path)))}
        onNewSong={() => setShowNewSong(true)}
        onOpenFiles={() => void openPresentations()}
        onImportDocuments={() => setShowImport(true)}
        onDropFiles={(paths, at) => {
          setDraggingFiles(false);
          dropFiles.current(paths, at);
        }}
        onDuplicateSong={(path) => void duplicateSong(path)}
        onTrashSong={(path) => void trashSong(path)}
        onReveal={(path) => void window.vessel.revealFile(path)}
      />

      <main className="slides">
        {showBible ? (
          <BiblePanel
            themes={themes}
            slideSize={settings?.slideSize}
            refresh={bibleVersion}
            hasService={!!service}
            live={liveSlide && liveSlide.deckId === scriptureDeck.current ? { name: decks.find((d) => d.deck.id === liveSlide.deckId)?.presentation.name ?? '', index: liveSlide.index } : null}
            onShowSlide={showScripture}
            onAddToPresentation={({ presentation, name }) => void addScriptureTo(presentation, name)}
            onAddToService={({ presentation, name }) => void addScriptureToService(presentation, name)}
            onSave={({ presentation, name }) => void keepScripture(presentation, name, false)}
            onStatus={setStatus}
            onClose={closeBible}
          />
        ) : null}
        {!showBible && selected && deckMissing.length > 0 && (
          <div className="missing-media" role="status">
            <WarningIcon />
            <span title={deckMissing.join('\n')}>
              {deckMissing.length === 1 ? 'A media file' : `${deckMissing.length} media files`} in this presentation can’t be found:{' '}
              {deckMissing.map(fileName).join(', ')}
            </span>
            <button onClick={() => void findMissing()}>Find…</button>
          </div>
        )}
        {showBible ? null : selected && mode === 'edit' ? (
          <Editor
            key={selected.deck.id}
            deck={selected.deck}
            presentation={selected.presentation}
            apply={apply}
            media={media}
            focusCue={focusCue}
            onFocused={() => setFocusCue(null)}
            history={{ canUndo: selected.past.length > 0, canRedo: selected.future.length > 0, undo, redo }}
            ccliLicence={settings?.ccliLicence ?? ''}
          />
        ) : selected ? (
          <>
            <div className="deck-head">
              <h2 className="deck-title">
                {selected.deck.name || 'Untitled'}
                {selected.deck.arrangementName && <span className="arrangement"> · {selected.deck.arrangementName}</span>}
              </h2>
              <button className={deckTimer(selected.deck) ? 'active-toggle' : ''} onClick={() => void timerMenu()} title="Make the slides move on by themselves (an announcement loop)">
                ⟳ {deckTimer(selected.deck) ?? 'Timer'}
              </button>
            </div>
            {groups.map((group, gi) => (
              <div key={gi} className="group">
                {group.name && (
                  <div
                    className="group-label"
                    style={{ borderColor: group.color }}
                    title="Right-click for group options"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void openGroupMenu(selected.deck, group.groupId, apply);
                    }}
                  >
                    {group.name}
                    {group.hotkey && (
                      <kbd className="hotkey" title={`Press ${group.hotkey} to jump here`}>
                        {group.hotkey}
                      </kbd>
                    )}
                  </div>
                )}
                <div className="slide-grid">
                  {group.slides.map(({ slide, index }) => (
                    <SlideTile
                      key={slide.id}
                      slide={slide}
                      index={index}
                      live={liveSlide?.deckId === selected.deck.id && liveSlide.index === index}
                      onClick={() => goLive(selected.deck.id, index)}
                      onMenu={() =>
                        void openSlideMenu({
                          deck: selected.deck,
                          slide,
                          media,
                          apply,
                          onGoLive: () => goLive(selected.deck.id, index),
                          onCustomTimer: () => setAskTimer({ kind: 'slide', cueId: slide.cueId, seconds: slide.advance?.seconds, to: slide.advance?.to ?? 'next' }),
                          onEditText: () => {
                            setFocusCue(slide.cueId);
                            setMode('edit');
                          }
                        })
                      }
                      onDropSlide={(drag) => dropSlideOn(selected.deck, drag, slide, apply)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="placeholder">Select or create a presentation</div>
        )}
      </main>

      <aside className="preview">
        <h3>Live</h3>
        <div className="live-controls">
          <button title="Hide the lyrics (Esc)" onClick={clear}>
            Clear text
          </button>
          <button title="Remove the background" onClick={() => showBackground(null)} disabled={!live.background}>
            Clear media
          </button>
          <button title="Clear text and background (Shift+Esc)" onClick={clearAll}>
            Clear all
          </button>
          <button className={`wide ${live.logo ? 'active-toggle' : ''}`} title={settings?.logoPath ? 'Show your logo instead of the slides (L)' : 'Choose your logo in Preferences ▸ General'} onClick={toggleLogo}>
            Logo
          </button>
          <button className={`wide ${live.blackout ? 'danger active' : ''}`} title="Black out the screen (.)" onClick={toggleBlackout}>
            Black
          </button>
        </div>
        <div
          className="preview-screen"
          title="Right-click to clear or black out"
          onContextMenu={(e) => {
            e.preventDefault();
            void liveMenu();
          }}
        >
          {/* With no audience output to play it, the preview plays the video's sound (Preferences ▸ Audio and video). */}
          <AudienceView live={live} muted={!(outputDisplay === null && settings?.previewSound !== false)} />
        </div>
        {liveVideo && live.videoClock?.path === liveVideo.path && <VideoTransport video={liveVideo} clock={live.videoClock} onClock={(videoClock) => pushLive({ videoClock })} />}
        {liveVideo && (
          <div className={`video-sound ${liveVideoItem?.muted ? 'silent' : ''}`}>
            <span className="video-title" title={liveVideo.path}>
              <PlayIcon size={12} /> {mediaName(liveVideo.path)}
            </span>
            {liveVideoItem?.muted ? (
              <>
                <span className="muted">Always muted</span>
                <button onClick={() => void window.vessel.setMediaMuted(liveVideoItem.id, false).then(setMedia)} title="Play this video's sound again">
                  Unmute this video
                </button>
              </>
            ) : (
              <>
                <button
                  className={`sound-icon ${videoSound.muted ? 'active-toggle' : ''}`}
                  onClick={() => setVideoSound((v) => ({ ...v, muted: !v.muted }))}
                  aria-label={videoSound.muted ? 'Unmute video sound' : 'Mute video sound'}
                  title={
                    outputDisplay === null && settings?.previewSound === false
                      ? 'Video sound plays on the audience output (it’s off now)'
                      : videoSound.muted
                        ? 'Muted: click to play the video’s sound'
                        : 'Sound on: click to mute the video'
                  }
                >
                  {videoSound.muted ? <MutedIcon /> : <SoundIcon />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={videoSound.volume}
                  disabled={videoSound.muted}
                  onChange={(e) => setVideoSound((v) => ({ ...v, volume: Number(e.target.value) }))}
                  title={`Video volume on the output: ${Math.round(videoSound.volume * 100)}%`}
                  aria-label="Video volume"
                />
              </>
            )}
          </div>
        )}
        {audio && (
          <AudioPlayer
            track={audio}
            onStop={() => setAudio(null)}
            level={settings?.audioLevel ?? 1}
            routing={{ sinkId: settings?.audioOutputId, delayMs: settings?.audioDelayMs }}
          />
        )}
        {((advanceAt && !live.cleared) || timerPaused) && (
          <div className={`slide-timer ${timerPaused ? 'paused' : ''}`}>
            <span>
              {timerPaused
                ? 'Slide timers paused'
                : `${advanceAt!.to === 'first' ? 'Back to the first slide' : advanceAt!.to === 'random' ? 'Another slide' : 'Next slide'} in ${Math.max(0, Math.ceil((advanceAt!.at - Date.now()) / 1000))}s`}
            </span>
            {!timerPaused && <span className="slide-timer-bar" style={{ width: `${Math.min(100, Math.max(0, 100 - ((advanceAt!.at - Date.now()) / (advanceAt!.seconds * 1000)) * 100))}%` }} />}
            <button onClick={() => setTimerPaused((p) => !p)} title={timerPaused ? 'Let timed slides move on again' : 'Hold this slide; timed slides stop moving on'}>
              {timerPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
        {typedNumber && (
          <div className="typed-number">
            Go to slide <b>{typedNumber}</b> <kbd>Enter</kbd>
          </div>
        )}
        {outputDisplay === null && <p className="hint">Output is off. Pick a display above to show it.</p>}
        <MessagePanel
          shown={live.message ?? null}
          saved={normalizeMessages(settings?.messages)}
          timer={stage.timer}
          onShow={(text) => {
            pushLive({ message: { text, timer: stageRef.current.timer } });
            void window.vessel.updateSettings({ messages: rememberMessage(normalizeMessages(settings?.messages), text) }).then(setSettings);
          }}
          onHide={() => pushLive({ message: null })}
          onForget={(id) => void window.vessel.updateSettings({ messages: normalizeMessages(settings?.messages).filter((m) => m.id !== id) }).then(setSettings)}
        />
        <LowerThirdPanel
          shown={live.lowerThird ?? null}
          saved={normalizeLowerThirds(settings?.lowerThirds)}
          onShow={(lowerThird) => {
            pushLive({ lowerThird });
            void window.vessel.updateSettings({ lowerThirds: rememberLowerThird(normalizeLowerThirds(settings?.lowerThirds), lowerThird) }).then(setSettings);
          }}
          onHide={() => pushLive({ lowerThird: null })}
          onForget={(id) => void window.vessel.updateSettings({ lowerThirds: normalizeLowerThirds(settings?.lowerThirds).filter((l) => l.id !== id) }).then(setSettings)}
        />
        <StagePanel stage={stage} onChange={pushStage} onLayout={changeStageLayout} />
        {stageDisplay === null && <p className="hint">Stage display is off. Pick a display under Stage above.</p>}
      </aside>

      <MediaBin
        items={media}
        folders={mediaFolders}
        liveBackground={live.background}
        playingAudio={audio?.path ?? null}
        onTrigger={showBackground}
        onPlayAudio={(item) => setAudio({ path: item.path, name: item.name, key: crypto.randomUUID() })}
        onImport={(folder) => void window.vessel.importMedia(folder).then(setMedia)}
        onRemove={(id) => void window.vessel.removeMedia(id).then(setMedia)}
        onItems={setMedia}
        onFolders={setMediaFolders}
        onMute={(item, muted) => void window.vessel.setMediaMuted(item.id, muted).then(setMedia)}
        onDropFiles={(paths, folder) => {
          setDraggingFiles(false);
          void addDropped(paths, undefined, folder);
        }}
        songName={selected ? selected.deck.name || 'Untitled' : null}
        onSongBackground={(bg) => apply((p) => p.cues.reduce((q, c) => setSlideBackground(q, uuidOf(c.uuid), bg), p))}
        onSongPicture={(path) => apply((p) => addSlideImage(p, p.cues.map((c) => uuidOf(c.uuid)), path, 'top-right'))}
        onReveal={(path) => void window.vessel.revealFile(path)}
        missing={missing}
        onFindMissing={() => void findMissing(media.filter((m) => missing.includes(m.path)).map((m) => m.path))}
      />

      {draggingFiles && (
        <div className="drop-hint">
          <div>
            <strong>Drop to add</strong>
            <span>Songs, PowerPoint, Word and text files go to the library (drop on the service to add them there too)</span>
            <span>Pictures and videos go to the media bin · Bible files to the Bible · Playlists become service playlists</span>
          </div>
        </div>
      )}
      <footer className="statusbar" title={status}>
        {status}
      </footer>
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {showPrefs && (
        <PreferencesDialog
          settings={settings}
          media={media}
          displays={displays}
          outputDisplay={outputDisplay}
          stageDisplay={stageDisplay}
          onOutput={changeOutput}
          onStageOutput={changeStageOutput}
          onStreamOutput={(target) => void window.vessel.setStreamOutput(target).then(setSettings)}
          initialSection={prefsSection}
          transitionMs={live.transitionMs}
          onTransition={changeTransition}
          onSettings={(patch) => void window.vessel.updateSettings(patch).then(setSettings)}
          onAddFolder={() => void window.vessel.addLibraryFolder().then((s2) => (setSettings(s2), refreshLibrary()))}
          onRemoveFolder={(f) => void window.vessel.removeLibraryFolder(f).then((s2) => (setSettings(s2), refreshLibrary()))}
          videoSound={videoSound}
          onVideoSound={setVideoSound}
          stageLayout={stage.layout ?? normalizeStageLayout(undefined)}
          onStageLayout={changeStageLayout}
          remoteEnabled={!!remote?.enabled}
          remote={remote}
          onOpenRemote={() => {
            setShowPrefs(false);
            void openRemote();
          }}
          onOpenCcli={() => {
            setShowPrefs(false);
            setShowCcli(true);
          }}
          onClose={() => {
            setShowPrefs(false);
            setPrefsSection(undefined);
          }}
        />
      )}
      {askTimer && (
        <TimerDialog
          title={askTimer.kind === 'deck' ? 'Timer for every slide' : 'Timer for this slide'}
          seconds={askTimer.seconds}
          loop={askTimer.kind === 'deck' ? askTimer.loop : undefined}
          onCancel={() => setAskTimer(null)}
          onSave={(seconds, loop) => {
            const ask = askTimer;
            setAskTimer(null);
            if (ask.kind === 'deck') {
              apply((p) => setPresentationTimer(p, seconds, loop));
              setStatus(`${loop ? 'Looping' : 'Playing through once'}: every slide moves on after ${formatSeconds(seconds, true)}. Click a slide to start; save to keep it.`);
            } else apply((p) => setSlideAdvance(p, ask.cueId, { seconds, to: ask.to }));
          }}
        />
      )}
      {showCcli && (
        <CcliDialog
          settings={settings}
          onSettings={(patch) => void window.vessel.updateSettings(patch).then(setSettings)}
          onOpenSong={(path) =>
            void openPath(path).then((d) => {
              if (d) setMode('edit');
            })
          }
          onStatus={setStatus}
          onClose={() => setShowCcli(false)}
        />
      )}
      {showPco && <PlanningCenterDialog library={library} onImport={importPlan} onClose={() => setShowPco(false)} />}
      {showImport && <ImportDialog onImport={(o) => void importDocuments(o)} onCancel={() => setShowImport(false)} />}
      {showRemote && <RemoteDialog status={remote} onStatus={setRemote} onClose={() => setShowRemote(false)} />}
      {showNewSong && <NewSongDialog onCreate={(n, l) => void createSong(n, l)} onCancel={() => setShowNewSong(false)} />}
      {showThemes && (
        <ThemeDialog
          library={themes}
          onLibraryChange={changeThemes}
          presentationName={selected ? selected.deck.name || 'Untitled' : undefined}
          background={live.background}
          onApply={applyThemeToSelected}
          onClose={() => setShowThemes(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Operator />);
