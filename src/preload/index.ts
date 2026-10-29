import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { RemoteCommand, RemoteRole, RemoteStatus } from '../shared/remote';
import type { AppCommand } from '../shared/shortcuts';
import type { LiveState, VesselApi, StageState } from '../shared/types';
import type { StreamLook } from '../shared/stream';

const api: VesselApi = {
  openFiles: (kind) => ipcRenderer.invoke('files:open', kind),
  importDocuments: (opts, kind) => ipcRenderer.invoke('files:import', opts, kind),
  pathsOfFiles: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean),
  openDropped: (paths, opts, mediaFolder) => ipcRenderer.invoke('files:dropped', paths, opts, mediaFolder),
  listMediaFolders: () => ipcRenderer.invoke('media:folders'),
  createMediaFolder: (name) => ipcRenderer.invoke('media:folder-create', name),
  renameMediaFolder: (id, name) => ipcRenderer.invoke('media:folder-rename', id, name),
  deleteMediaFolder: (id) => ipcRenderer.invoke('media:folder-delete', id),
  moveMedia: (ids, folder) => ipcRenderer.invoke('media:move', ids, folder),
  setMediaMuted: (id, muted) => ipcRenderer.invoke('media:mute', id, muted),
  logSongUsage: (entry) => ipcRenderer.invoke('ccli:log', entry),
  songUsage: () => ipcRenderer.invoke('ccli:usage'),
  saveReport: (csv, name) => ipcRenderer.invoke('ccli:save-report', csv, name),
  clearSongUsage: () => ipcRenderer.invoke('ccli:clear'),
  dataFolder: () => ipcRenderer.invoke('app:data-folder'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  listBibles: () => ipcRenderer.invoke('bibles:list'),
  addBibles: () => ipcRenderer.invoke('bibles:add'),
  downloadBible: (id) => ipcRenderer.invoke('bibles:download', id),
  onBibleProgress: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, p: { id: string; received: number; total: number }): void => listener(p);
    ipcRenderer.on('bibles:progress', handler);
    return () => ipcRenderer.removeListener('bibles:progress', handler);
  },
  removeBible: (id) => ipcRenderer.invoke('bibles:remove', id),
  getBible: (id) => ipcRenderer.invoke('bibles:get', id),
  readFile: (path) => ipcRenderer.invoke('files:read', path),
  saveFile: (bytes, suggestedName, existingPath) => ipcRenderer.invoke('files:save', bytes, suggestedName, existingPath),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  setOutput: (displayId) => ipcRenderer.invoke('output:set', displayId),
  setLive: (state) => ipcRenderer.send('live:set', state),
  setStageOutput: (displayId) => ipcRenderer.invoke('stage-output:set', displayId),
  setStage: (state) => ipcRenderer.send('stage:set', state),
  onStage: (listener) => {
    const handler = (_e: unknown, state: StageState): void => listener(state);
    ipcRenderer.on('stage:update', handler);
    return () => ipcRenderer.removeListener('stage:update', handler);
  },
  onLive: (listener) => {
    const handler = (_e: unknown, state: LiveState): void => listener(state);
    ipcRenderer.on('live:update', handler);
    return () => ipcRenderer.removeListener('live:update', handler);
  },
  listMedia: () => ipcRenderer.invoke('media:list'),
  loadThemes: () => ipcRenderer.invoke('themes:load'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getMigration: () => ipcRenderer.invoke('app:migration'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  addLibraryFolder: () => ipcRenderer.invoke('library:add-folder'),
  removeLibraryFolder: (path) => ipcRenderer.invoke('library:remove-folder', path),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  onLibraryChanged: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },
  listPlaylists: () => ipcRenderer.invoke('playlists:list'),
  readPlaylist: (path) => ipcRenderer.invoke('playlists:read', path),
  writePlaylist: (bytes, name, path) => ipcRenderer.invoke('playlists:write', bytes, name, path),
  renamePlaylist: (path, name) => ipcRenderer.invoke('playlists:rename', path, name),
  trashPlaylist: (path) => ipcRenderer.invoke('playlists:trash', path),
  setUnsavedCount: (count) => ipcRenderer.send('app:unsaved', count),
  showMenu: (entries) => ipcRenderer.invoke('menu:popup', entries),
  onAppCommand: (listener) => {
    const handler = (_e: unknown, command: AppCommand): void => listener(command);
    ipcRenderer.on('app:command', handler);
    return () => ipcRenderer.removeListener('app:command', handler);
  },
  setMenuState: (state) => ipcRenderer.send('menu:state', state),
  revealFile: (path) => ipcRenderer.invoke('files:reveal', path),
  trashSong: (path) => ipcRenderer.invoke('library:trash', path),
  remoteStatus: () => ipcRenderer.invoke('remote:status'),
  setRemoteEnabled: (enabled) => ipcRenderer.invoke('remote:set-enabled', enabled),
  newRemotePin: () => ipcRenderer.invoke('remote:new-pin'),
  newRemotePresenterPin: () => ipcRenderer.invoke('remote:new-presenter-pin'),
  onRemoteStatus: (listener) => {
    const handler = (_e: unknown, status: RemoteStatus): void => listener(status);
    ipcRenderer.on('remote:status', handler);
    return () => ipcRenderer.removeListener('remote:status', handler);
  },
  setRemoteState: (state) => ipcRenderer.send('remote:state', state),
  setPresenterState: (state) => ipcRenderer.send('remote:presenter-state', state),
  setPresenterSlides: (job) => ipcRenderer.send('remote:presenter-slides', job),
  onRemoteCommand: (listener) => {
    const handler = (_e: unknown, command: RemoteCommand, role: RemoteRole): void => listener(command, role ?? 'operator');
    ipcRenderer.on('remote:command', handler);
    return () => ipcRenderer.removeListener('remote:command', handler);
  },
  onRemoteStateRequest: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on('remote:request-state', handler);
    return () => ipcRenderer.removeListener('remote:request-state', handler);
  },
  saveThemes: (library) => ipcRenderer.invoke('themes:save', library),
  importMedia: (folder) => ipcRenderer.invoke('media:import', folder),
  removeMedia: (id) => ipcRenderer.invoke('media:remove', id),
  missingMedia: (paths) => ipcRenderer.invoke('media:missing', paths),
  findMovedMedia: (missing) => ipcRenderer.invoke('media:find-moved', missing),
  installSamples: () => ipcRenderer.invoke('samples:install'),
  exportVesselFile: (req) => ipcRenderer.invoke('vessel:export', req),
  onlineGallery: () => ipcRenderer.invoke('gallery:online'),
  submitToGallery: (entry) => ipcRenderer.invoke('gallery:submit', entry),
  exportDocument: (job) => ipcRenderer.invoke('export:run', job),
  exportPlaylistBundle: (service, edited) => ipcRenderer.invoke('export:bundle', service, edited),
  openVesselFile: (path) => ipcRenderer.invoke('vessel:open', path),
  addFromVesselFile: (choice) => ipcRenderer.invoke('vessel:add', choice),
  discardVesselFile: (token) => ipcRenderer.invoke('vessel:discard', token),
  onOpenFiles: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, paths: string[]): void => listener(paths);
    ipcRenderer.on('files:open-external', handler);
    // Files opened before this window was listening (such as the one that started Vessel).
    void ipcRenderer.invoke('files:pending').then((paths: string[]) => paths.length && listener(paths));
    return () => ipcRenderer.removeListener('files:open-external', handler);
  },
  logError: (message) => ipcRenderer.send('log:renderer', message),
  lastRunUnclean: () => ipcRenderer.invoke('app:last-run-unclean'),
  reportProblem: () => ipcRenderer.invoke('app:report-problem'),
  onScreenOff: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, which: 'output' | 'stage' | 'stream'): void => listener(which);
    ipcRenderer.on('screen:off', handler);
    return () => ipcRenderer.removeListener('screen:off', handler);
  },
  onNotice: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, message: string): void => listener(message);
    ipcRenderer.on('app:notice', handler);
    return () => ipcRenderer.removeListener('app:notice', handler);
  },
  backUp: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  setStreamOutput: (target) => ipcRenderer.invoke('stream-output:set', target),
  ndiStatus: () => ipcRenderer.invoke('ndi:status'),
  pcoStatus: () => ipcRenderer.invoke('pco:status'),
  pcoConnect: (appId, secret) => ipcRenderer.invoke('pco:connect', appId, secret),
  pcoDisconnect: () => ipcRenderer.invoke('pco:disconnect'),
  openPlanningCenterTokens: () => ipcRenderer.invoke('pco:open-tokens'),
  pcoServiceTypes: () => ipcRenderer.invoke('pco:service-types'),
  pcoPlans: (serviceTypeId) => ipcRenderer.invoke('pco:plans', serviceTypeId),
  pcoPlanItems: (serviceTypeId, planId) => ipcRenderer.invoke('pco:items', serviceTypeId, planId),
  openNdiSite: () => ipcRenderer.invoke('ndi:open-site'),
  onStreamLook: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, look: StreamLook): void => listener(look);
    ipcRenderer.on('stream:look', handler);
    return () => ipcRenderer.removeListener('stream:look', handler);
  }
};

contextBridge.exposeInMainWorld('vessel', api);
