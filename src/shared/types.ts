import type { Bible } from './bible/formats';
import type { CopyrightPosition, UsageEntry } from './ccli';
import type { StageLayout } from './stage';
import type { GroupDefinition } from './groups';
import type { DocumentImportReport, DocumentKind, ImportOptions } from './import';
import type { LegacyImportReport } from './pro/legacy';
import type { RemoteCommand, RemoteState, RemoteStatus } from './remote';
import type { MenuEntry } from './menu';
import type { AppCommand } from './shortcuts';
import type { Theme, ThemeLibrary } from './theme';
import type { LiveMessage, SavedMessage } from './messages';
import type { LowerThird, SavedLowerThird } from './lowerThirds';
import { INITIAL_TIMER, type TimerState } from './timer';
import type { VideoClock } from './videoClock';
import type { MidiSettings } from './control';
import type { StreamLook, StreamTarget } from './stream';
import type { NdiSettings, NdiStatus } from './ndi';
import type { ExportJob, ExportResult } from './exports';
import type { Service } from './pro/service';
import type { GalleryEntry } from './themeGallery';
import type { VesselChoice, VesselExportRequest, VesselPreview, VesselReport } from './vesselFile';
import type { PcoItem, PcoPlan, PcoServiceType } from './planningCenter';

/** Media that can be a background or a picture on a slide. */
export type MediaKind = 'image' | 'video';
/** Everything the media bin holds. */
export type BinKind = MediaKind | 'audio';
export type MediaScale = 'fit' | 'fill' | 'stretch';

/** A background image or video on the output's media layer. */
export interface Background {
  path: string;
  kind: MediaKind;
  loop: boolean;
  scale: MediaScale;
}

/** A file in the media bin. */
export interface MediaItem {
  id: string;
  path: string;
  name: string;
  kind: BinKind;
  /** The media folder it's filed in; none means it isn't in a folder. */
  folder?: string;
  /** A video that always plays without sound (e.g. a motion background). */
  muted?: boolean;
}

/** A folder in the media bin, to keep media organised (it isn't a folder on disk). */
export interface MediaFolder {
  id: string;
  name: string;
}

/** One text box on a slide, in slide coordinates, with its first-run styling. */
export interface TextBoxLayout {
  /** Drawing order among everything on the slide (lower is further back). */
  z: number;
  /** Colour filling the box behind the text (a "bar"), if any. */
  fill?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  /** Font name as stored (usually a PostScript name like "Futura-Bold"). */
  font: string;
  bold: boolean;
  italic: boolean;
  /** Point size in slide pixels. */
  sizePt: number;
  color: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  uppercase: boolean;
  shadow: boolean;
  outline: { width: number; color: string } | null;
  /** Shrink the text to fit the box (ProPresenter's "scale font down"). */
  shrink: boolean;
}

/** A picture or shape drawn on the slide itself (not the background layer). */
export type GraphicLayout = {
  /** Element id, for editing. */
  id: string;
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees clockwise. */
  rotation: number;
  opacity: number;
} & (
  | { kind: 'image'; path: string; scale: MediaScale }
  | { kind: 'shape'; shape: 'rectangle' | 'ellipse' | 'rounded'; fill: string | null; stroke: { width: number; color: string } | null; roundness: number }
);

/** How a slide looks: its size, background colour, text boxes and graphics. */
export interface SlideLayout {
  width: number;
  height: number;
  background?: string;
  boxes: TextBoxLayout[];
  graphics: GraphicLayout[];
}

export interface SlideView {
  /** Unique per position in the play order (a cue can repeat in an arrangement). */
  id: string;
  cueId: string;
  groupId: string;
  text: string;
  label: string;
  groupName: string;
  groupColor?: string;
  /** Background the slide triggers when it goes live, if any. */
  background?: Background;
  layout: SlideLayout;
  /** Turned-off slides are skipped by Next/Previous (ProPresenter's "disabled"); clicking still shows them. */
  enabled: boolean;
  /** Moves on by itself after this many seconds (ProPresenter's slide timer), if set. */
  advance?: SlideAdvance;
}

export interface SlideAdvance {
  seconds: number;
  /** Where it goes: the next slide, back to the first (a loop), a random slide, or a particular slide. */
  to: 'next' | 'first' | 'random' | { cueId: string };
}

export interface GroupView {
  id: string;
  name: string;
  color?: string;
  /** #rrggbb for colour inputs. */
  colorHex: string;
  /** Letter that jumps to this group during a show (C for Chorus). */
  hotkey?: string;
  slides: SlideView[];
}

export interface ArrangementView {
  id: string;
  name: string;
  groupIds: string[];
}

export interface Deck {
  id: string;
  name: string;
  /** Play order: follows the selected arrangement, else every group in order. */
  slides: SlideView[];
  /** Every group once, in document order (what the editor shows). */
  groups: GroupView[];
  arrangements: ArrangementView[];
  selectedArrangementId?: string;
  sourcePath?: string;
  arrangementName?: string;
}

export interface PlaylistEntry {
  id: string;
  name: string;
  kind: 'presentation' | 'header' | 'cue' | 'other';
  documentPath?: string;
  arrangementName?: string;
}

export interface PlaylistView {
  id: string;
  name: string;
  entries: PlaylistEntry[];
}

/** What the audience output should be showing. */
export interface LiveState {
  text: string;
  /** How to draw the text; null falls back to plain centred text. */
  layout: SlideLayout | null;
  /** Hide text but keep the output window up (ProPresenter's "clear slide"). */
  cleared: boolean;
  /** Black out everything. */
  blackout: boolean;
  /** Media layer behind the text; null shows black. */
  background: Background | null;
  /** Crossfade length for text and background changes. */
  transitionMs: number;
  /** The song's copyright line, shown along the bottom with this slide (CCLI). */
  copyright?: string;
  /** The logo on screen (the Logo button), drawn over everything else. */
  logo?: string | null;
  /** Where sound goes, its overall level and delay (Preferences ▸ Audio and video). */
  audioOutputId?: string;
  audioLevel?: number;
  audioDelayMs?: number;
  /** Sound of background videos on the output: volume (0–1) and the operator's mute. */
  videoVolume?: number;
  videoMuted?: boolean;
  /** Videos set to always play silently (media bin ▸ Always mute), by path. */
  silentVideos?: string[];
  /** A message along the bottom of the screen, over the slides; null or missing shows none. */
  message?: LiveMessage | null;
  /** A name and second line in the lower left, over the slides. */
  lowerThird?: LowerThird | null;
  /** Practice mode: the preview shows everything, the audience gets black and silence. */
  practice?: boolean;
  /** Play, pause and position of the background video, when one is live. */
  videoClock?: VideoClock | null;
}

/** A slide as the stage display shows it. */
export interface StageSlide {
  text: string;
  label: string;
  groupName: string;
  groupColor?: string;
}

/** Everything the stage display shows. */
export interface StageState {
  current: StageSlide | null;
  /** The slide after the live one, or null at the end of the presentation. */
  next: StageSlide | null;
  /** Message for the people on stage; empty hides it. */
  message: string;
  timer: TimerState;
  /** Which parts the stage display shows; the standard layout when missing. */
  layout?: StageLayout;
}

export const INITIAL_STAGE: StageState = { current: null, next: null, message: '', timer: INITIAL_TIMER };

/** What the audience screens (and stream and NDI) get: in practice mode, black and silence. */
export const audienceState = (s: LiveState): LiveState =>
  // Nothing at all under the black, so nothing can show through a fade (and no video means no sound).
  s.practice ? { ...s, blackout: true, cleared: true, text: '', layout: null, background: null, videoClock: null, copyright: undefined, logo: null, message: null, lowerThird: null } : s;

export const INITIAL_LIVE: LiveState = { text: '', layout: null, cleared: true, blackout: false, background: null, transitionMs: 500 };

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

export interface OpenedFile {
  path: string;
  /** A .pro presentation (converted, for ProPresenter 5/6 files). */
  bytes: Uint8Array;
  /** Set when the file was converted from ProPresenter 5/6. */
  importReport?: LegacyImportReport;
  /** Set when the file was made from a PowerPoint, Word or text file. */
  documentReport?: DocumentImportReport;
  /** Media files unpacked from a .pro6x bundle into the media bin. */
  unpackedMedia?: number;
  /** Why the file could not be opened. */
  error?: string;
}

/** What became of files dropped onto the window. */
export interface DroppedFiles {
  /** .pro files, and songs made from ProPresenter 5/6, PowerPoint, Word and text files. */
  presentations: OpenedFile[];
  /** .proPlaylist files, to become service playlists. */
  playlists: OpenedFile[];
  /** The media bin after adding dropped pictures and videos, or null if none were dropped. */
  media: MediaItem[] | null;
  bibles: BibleInfo[];
  /** Vessel files, opened and waiting for the person to choose what to add. */
  vessel: VesselPreview[];
  errors: string[];
}

/** A Bible added from a downloaded file. */
export interface BibleInfo {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  format: string;
  books: number;
  verses: number;
  /** Credit line for an openly licensed translation. */
  credit?: string;
}

/** A presentation file found in a library folder. */
export interface LibraryItem {
  path: string;
  name: string;
  /** Last modified, epoch ms. */
  modified: number;
  slides: number;
  /** Lower-cased title and lyrics, for searching. */
  search: string;
}

/** A saved service playlist file. */
export interface PlaylistFileInfo {
  path: string;
  name: string;
  modified: number;
}

/** App settings kept between sessions (settings.json in the app's data folder). */
export interface Settings {
  /** Where Vessel saves new presentations. */
  libraryFolder: string;
  /** More folders to show in the library (e.g. ProPresenter's), read and written in place. */
  extraFolders: string[];
  playlistFolder: string;
  lastPlaylist?: string;
  outputDisplayId?: number | null;
  /** Remote control: on/off, the PIN phones sign in with, and the port. */
  remoteEnabled?: boolean;
  remotePin?: string;
  remotePort?: number;
  stageDisplayId?: number | null;
  transitionMs?: number;
  /** The church's CCLI licence number, for the copyright line and reports. */
  ccliLicence?: string;
  /** Where the copyright line shows; off unless chosen. */
  ccliCopyright?: CopyrightPosition;
  stageLayout?: StageLayout;
  /** Dark (the default), light, or follow the computer. */
  appearance?: 'dark' | 'light' | 'system';
  /** Play background videos' sound in the Live preview while the audience output is off. On unless turned off. */
  previewSound?: boolean;
  /** Size of the slides in new presentations (new songs, imported lyrics, Bible passages). 1920×1080 unless set. */
  slideSize?: { width: number; height: number };
  /** Open the last service playlist when Vessel starts. On unless turned off. */
  reopenLastPlaylist?: boolean;
  /** Put the audience screen back on its display when Vessel starts. On unless turned off. */
  showOutputAtLaunch?: boolean;
  /** The church's logo (a picture), shown by the Logo button. */
  logoPath?: string;
  /** Section names with their colours and jump keys; the built-in list when missing. */
  groups?: GroupDefinition[];
  /** Where sound goes (an audio output device id); the computer's default when missing. */
  audioOutputId?: string;
  /** Overall level for all of Vessel's sound, 0–1. */
  audioLevel?: number;
  /** Delay sound by this many milliseconds, to line it up with the picture (0–500). */
  audioDelayMs?: number;
  /** How new backgrounds fit the screen. */
  mediaScale?: MediaScale;
  /** New video backgrounds loop (on unless turned off) or play once. */
  videoLoop?: boolean;
  /** Copy imported media into Documents/Vessel/Media, so songs keep it when files move. */
  copyMedia?: boolean;
  /** Lower thirds used before, most recent first. */
  lowerThirds?: SavedLowerThird[];
  /** Height of the media bin in pixels (it can be dragged taller or shorter). */
  mediaBinHeight?: number;
  /** Audience messages used before, most recent first. */
  messages?: SavedMessage[];
  /** The stream output: where it shows (off, a window, or a display) and how it looks. */
  streamOutput?: StreamTarget;
  streamLook?: StreamLook;
  /** NDI® output of the stream picture. */
  ndi?: NdiSettings;
  /** MIDI control: on or off, which device, and which note or controller runs what. */
  midi?: MidiSettings;
  /** Look for a newer Vessel once a day when it starts. On unless turned off. */
  checkUpdates?: boolean;
  lastUpdateCheck?: number;
  /** A version the operator chose to skip; it isn't offered again at start-up. */
  skippedVersion?: string;
  /** The presentation open last time, reopened at start-up (and after an unexpected quit). */
  lastPresentation?: string;
  /** The sample songs, service and media have been set up (on the first start, or from Help). */
  samplesInstalled?: boolean;
  /** The tour has been taken or turned down, so it isn't offered again (the ? button still runs it). */
  toured?: boolean;
  /** The welcome (first-run) window has been seen. */
  welcomed?: boolean;
  /** Save changes to presentations by themselves, shortly after each edit. On unless turned off. */
  autosave?: boolean;
}

/** Planning Center connection, as the operator sees it. */
export interface PcoConnection {
  connected: boolean;
  organization: string;
  canStore: boolean;
}

/** API exposed to renderers by the preload script as window.vessel. */
export interface VesselApi {
  /** 'pro' shows only presentation files; 'presentation' also takes documents. */
  openFiles(kind: 'presentation' | 'playlist' | 'pro'): Promise<OpenedFile[]>;
  /** Pick PowerPoint, Word or text files (or just one kind) and turn them into presentations. */
  importDocuments(opts: ImportOptions, kind?: DocumentKind): Promise<OpenedFile[]>;
  /** The paths of files dragged in from Finder or Explorer. */
  pathsOfFiles(files: File[]): string[];
  /** Open or import dropped files, each in the way its kind needs. */
  /** `mediaFolder`: pictures, videos and audio go into this media folder. */
  openDropped(paths: string[], opts: Partial<ImportOptions>, mediaFolder?: string | null): Promise<DroppedFiles>;
  listMediaFolders(): Promise<MediaFolder[]>;
  createMediaFolder(name: string): Promise<MediaFolder[]>;
  renameMediaFolder(id: string, name: string): Promise<MediaFolder[]>;
  /** Its media goes back to being unfiled; no files are deleted. */
  deleteMediaFolder(id: string): Promise<{ folders: MediaFolder[]; items: MediaItem[] }>;
  moveMedia(ids: string[], folder: string | null): Promise<MediaItem[]>;
  /** Always play a video silently, or with its sound again. */
  setMediaMuted(id: string, muted: boolean): Promise<MediaItem[]>;
  /** Note that a song was shown today (counted once a day); false if it was already noted. */
  logSongUsage(entry: UsageEntry): Promise<boolean>;
  songUsage(): Promise<UsageEntry[]>;
  /** Ask where to save a CSV report and write it; the path, or null if cancelled. */
  saveReport(csv: string, name: string): Promise<string | null>;
  /** Empty the CCLI usage log. */
  clearSongUsage(): Promise<void>;
  /** Where Vessel keeps its settings, Bibles and logs. */
  dataFolder(): Promise<string>;
  openDataFolder(): Promise<void>;
  listBibles(): Promise<BibleInfo[]>;
  /** Pick downloaded Bible files (XML, or zipped XML) and add them. */
  addBibles(): Promise<{ added: BibleInfo[]; errors: string[]; list: BibleInfo[] }>;
  /** Download one of the free Bibles (FREE_BIBLES) and keep it. */
  downloadBible(id: string): Promise<{ added?: BibleInfo; error?: string; list: BibleInfo[] }>;
  /** How far a Bible download has got, in bytes. */
  onBibleProgress(listener: (p: { id: string; received: number; total: number }) => void): () => void;
  removeBible(id: string): Promise<BibleInfo[]>;
  getBible(id: string): Promise<Bible | null>;
  readFile(path: string): Promise<OpenedFile | null>;
  /** Write a presentation back to its file, or into the library folder when it has none. */
  saveFile(bytes: Uint8Array, suggestedName: string, existingPath?: string): Promise<string | null>;
  listDisplays(): Promise<DisplayInfo[]>;
  setOutput(displayId: number | null): Promise<void>;
  setStageOutput(displayId: number | null): Promise<void>;
  setStage(state: StageState): void;
  onStage(listener: (state: StageState) => void): () => void;
  setLive(state: LiveState): void;
  onLive(listener: (state: LiveState) => void): () => void;
  listMedia(): Promise<MediaItem[]>;
  loadThemes(): Promise<ThemeLibrary>;
  getSettings(): Promise<Settings>;
  /** What was brought across from the app's old name (Lumen) at this launch, if anything. */
  getMigration(): Promise<{ movedDocuments: boolean; copiedSettings: string[]; updatedPlaylists: number; updatedSongs: number } | null>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  addLibraryFolder(): Promise<Settings>;
  removeLibraryFolder(path: string): Promise<Settings>;
  listLibrary(): Promise<LibraryItem[]>;
  onLibraryChanged(listener: () => void): () => void;
  listPlaylists(): Promise<PlaylistFileInfo[]>;
  readPlaylist(path: string): Promise<Uint8Array | null>;
  /** Write a playlist; creates a new file named after `name` when `path` is missing. */
  writePlaylist(bytes: Uint8Array, name: string, path?: string): Promise<string>;
  renamePlaylist(path: string, name: string): Promise<string>;
  trashPlaylist(path: string): Promise<void>;
  /** How many open presentations have unsaved changes (checked when quitting). */
  setUnsavedCount(count: number): void;
  /** Show a native right-click menu; resolves with the chosen entry id, or null. */
  showMenu(entries: MenuEntry[]): Promise<string | null>;
  /** Commands from the menu bar. */
  onAppCommand(listener: (command: AppCommand) => void): () => void;
  /** Tell the menu bar what to tick and enable. */
  setMenuState(state: { mode: 'show' | 'edit'; outputId: number | null; stageId: number | null; hasPresentation: boolean; practice?: boolean }): void;
  /** Show a file in Finder / Explorer. */
  revealFile(path: string): Promise<void>;
  /** Move a song in a library folder to the Trash. */
  trashSong(path: string): Promise<boolean>;
  remoteStatus(): Promise<RemoteStatus>;
  setRemoteEnabled(enabled: boolean): Promise<RemoteStatus>;
  newRemotePin(): Promise<RemoteStatus>;
  onRemoteStatus(listener: (status: RemoteStatus) => void): () => void;
  /** Send what phones should show. */
  setRemoteState(state: RemoteState): void;
  onRemoteCommand(listener: (command: RemoteCommand) => void): () => void;
  /** The remote server asks for a fresh state (e.g. after starting). */
  onRemoteStateRequest(listener: () => void): () => void;
  saveThemes(library: ThemeLibrary): Promise<void>;
  /** Pick pictures, videos or audio and add them (into `folder` when given). */
  importMedia(folder?: string | null): Promise<MediaItem[]>;
  removeMedia(id: string): Promise<MediaItem[]>;
  /** Save a Vessel file (asks where); the path and anything that couldn't be included, or null if cancelled. */
  exportVesselFile(req: VesselExportRequest): Promise<{ path: string; missing: string[] } | null>;
  /** Open a Vessel file (asks which, unless given) and say what's inside. */
  openVesselFile(path?: string): Promise<VesselPreview | null>;
  addFromVesselFile(choice: VesselChoice): Promise<VesselReport>;
  /** The theme gallery's community list (fetched now); `available` is false until Vessel's repository is set. */
  onlineGallery(): Promise<{ available: boolean; entries: GalleryEntry[]; error?: string }>;
  /** Open the browser to propose a theme for the gallery; false when there's nowhere to send it yet. */
  submitToGallery(entry: { theme: Theme; author: string; description: string }): Promise<boolean>;
  /** File ▸ Export: asks where, then saves a PDF, pictures or text. Null if cancelled. */
  exportDocument(job: ExportJob): Promise<ExportResult | null>;
  /** Save a service with its songs and media as one playlist file. Null if cancelled. */
  exportPlaylistBundle(service: Service): Promise<(ExportResult & { missing: string[] }) | null>;
  discardVesselFile(token: string): Promise<void>;
  /** Files opened from Finder or Explorer (double-clicked, or dropped on Vessel's icon). */
  onOpenFiles(listener: (paths: string[]) => void): () => void;
  /** Set up the sample songs, service and media (again); says what was added. */
  installSamples(): Promise<{ songs: number; media: number; bible: boolean; playlist: string | null }>;
  /** Write an error from the operator window into Vessel's log. */
  logError(message: string): void;
  /** Whether the last run ended without quitting properly (a crash or power cut). */
  lastRunUnclean(): Promise<boolean>;
  /** Save a problem report (asks where); its path, or null if cancelled. */
  reportProblem(): Promise<string | null>;
  /** A screen Vessel had to turn off (it kept crashing), so the operator window shows it as off. */
  onScreenOff(listener: (screen: 'output' | 'stage' | 'stream') => void): () => void;
  /** Short notices from the main process for the status bar ("the audience screen was reopened"). */
  onNotice(listener: (message: string) => void): () => void;
  /** Back up songs, playlists, settings and more into one file (asks where). */
  backUp(): Promise<void>;
  /** Restore a backup (asks which), then restart. */
  restoreBackup(): Promise<void>;
  /** Show the stream output in a window, on a display, or not at all; returns the settings with it saved. */
  setStreamOutput(target: StreamTarget): Promise<Settings>;
  /** Planning Center: whether it's connected (the secret never comes back here). */
  pcoStatus(): Promise<PcoConnection>;
  pcoConnect(appId: string, secret: string): Promise<PcoConnection>;
  /** Open Planning Center's Personal Access Tokens page in the browser. */
  openPlanningCenterTokens(): Promise<void>;
  pcoDisconnect(): Promise<PcoConnection>;
  pcoServiceTypes(): Promise<PcoServiceType[]>;
  pcoPlans(serviceTypeId: string): Promise<PcoPlan[]>;
  pcoPlanItems(serviceTypeId: string, planId: string): Promise<PcoItem[]>;
  /** Whether NDI is sending, and to how many receivers. */
  ndiStatus(): Promise<NdiStatus>;
  /** Open ndi.video, where the free NDI Tools (with the runtime) are. */
  openNdiSite(): Promise<void>;
  /** The stream window hears how it should look. */
  onStreamLook(listener: (look: StreamLook) => void): () => void;
  /** Look for a newer Vessel now and say what was found. */
  checkForUpdates(): Promise<void>;
  /** Which of these media files can't be found. */
  missingMedia(paths: string[]): Promise<string[]>;
  /**
   * Ask for a folder and look in it for the missing files by name; the media bin
   * is updated with what's found. Null if the operator cancelled.
   */
  findMovedMedia(missing: string[]): Promise<{ folder: string; found: Record<string, string>; items: MediaItem[] } | null>;
}
