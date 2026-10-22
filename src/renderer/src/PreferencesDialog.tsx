import { useEffect, useState } from 'react';
import { cleanGroup, DEFAULT_GROUPS, type GroupDefinition } from '../../shared/groups';
import { mediaUrl } from '../../shared/media';
import { audioOutputs } from './sound';
import type { CopyrightPosition } from '../../shared/ccli';
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from '../../shared/import';
import { SLIDE_SIZES } from '../../shared/pro/edit';
import { presetOf, STAGE_PRESETS, type StageLayout } from '../../shared/stage';
import type { DisplayInfo, MediaItem, MediaScale, Settings } from '../../shared/types';

type Section = 'general' | 'screens' | 'appearance' | 'groups' | 'sound' | 'media' | 'stage' | 'import' | 'ccli' | 'remote';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'screens', label: 'Screens' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'groups', label: 'Groups' },
  { id: 'sound', label: 'Audio and video' },
  { id: 'media', label: 'Media' },
  { id: 'stage', label: 'Stage display' },
  { id: 'import', label: 'Import' },
  { id: 'ccli', label: 'CCLI' },
  { id: 'remote', label: 'Remote control' }
];

const IMPORT_STORE = 'vessel.importOptions';

function importOptions(): ImportOptions {
  try {
    return { ...DEFAULT_IMPORT_OPTIONS, ...(JSON.parse(localStorage.getItem(IMPORT_STORE) ?? '{}') as Partial<ImportOptions>) };
  } catch {
    return DEFAULT_IMPORT_OPTIONS;
  }
}

/** Preferences (⌘, / Ctrl+,): every setting in one place. */
export function PreferencesDialog({
  settings,
  media,
  displays,
  outputDisplay,
  stageDisplay,
  onOutput,
  onStageOutput,
  transitionMs,
  onTransition,
  onSettings,
  onAddFolder,
  onRemoveFolder,
  videoSound,
  onVideoSound,
  stageLayout,
  onStageLayout,
  remoteEnabled,
  onOpenRemote,
  onOpenCcli,
  onClose
}: {
  settings: Settings | null;
  /** The media bin, to choose the logo from. */
  media: MediaItem[];
  displays: DisplayInfo[];
  outputDisplay: number | null;
  stageDisplay: number | null;
  /** '' turns it off. */
  onOutput: (displayId: string) => void;
  onStageOutput: (displayId: string) => void;
  transitionMs: number;
  onTransition: (ms: number) => void;
  onSettings: (patch: Partial<Settings>) => void;
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;
  videoSound: { volume: number; muted: boolean };
  onVideoSound: (sound: { volume: number; muted: boolean }) => void;
  stageLayout: StageLayout;
  onStageLayout: (layout: StageLayout) => void;
  remoteEnabled: boolean;
  onOpenRemote: () => void;
  onOpenCcli: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [section, setSection] = useState<Section>('general');
  const [imports, setImports] = useState<ImportOptions>(importOptions);
  const [licence, setLicence] = useState(settings?.ccliLicence ?? '');
  const [audioVolume, setAudioVolume] = useState(() => {
    try {
      return Number(localStorage.getItem('vessel.audioVolume') ?? 1);
    } catch {
      return 1;
    }
  });

  const [devices, setDevices] = useState<Array<{ id: string; label: string }> | null>(null);
  const [dataFolder, setDataFolder] = useState('');
  const [groups, setGroups] = useState<GroupDefinition[]>(settings?.groups?.length ? settings.groups : DEFAULT_GROUPS);
  const [delay, setDelay] = useState(String(settings?.audioDelayMs ?? 0));
  useEffect(() => {
    void audioOutputs().then(setDevices);
    void window.vessel.dataFolder().then(setDataFolder);
  }, []);

  /** Groups save as they're edited; rows without a name are left out. */
  const changeGroups = (next: GroupDefinition[]): void => {
    setGroups(next);
    onSettings({ groups: next.map(cleanGroup).filter((g): g is GroupDefinition => !!g) });
  };
  const images = media.filter((m) => m.kind === 'image');

  const changeImports = (patch: Partial<ImportOptions>): void =>
    setImports((o) => {
      const next = { ...o, ...patch };
      try {
        localStorage.setItem(IMPORT_STORE, JSON.stringify(next));
      } catch {
        // Not remembered; the Import window keeps its own choice.
      }
      return next;
    });

  const display = (d: DisplayInfo, i: number): string => `${d.label || `Display ${i + 1}`} · ${d.bounds.width} × ${d.bounds.height}${d.primary ? ' (main)' : ''}`;
  const size = settings?.slideSize ?? { width: 1920, height: 1080 };
  const appearance = settings?.appearance ?? 'dark';
  const stagePreset = presetOf(stageLayout);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal preferences-modal" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="preferences-nav">
          <h2>Preferences</h2>
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="preferences-body">
          {section === 'general' && (
            <>
              <h3>Library</h3>
              <p className="hint">New songs are saved in the Vessel folder. Added folders are shown in the library and saved in place.</p>
              <ul className="pref-folders">
                <li>
                  <span title={settings?.libraryFolder}>{settings?.libraryFolder}</span>
                  <span className="muted">Vessel</span>
                </li>
                {(settings?.extraFolders ?? []).map((f) => (
                  <li key={f}>
                    <span title={f}>{f}</span>
                    <button onClick={() => onRemoveFolder(f)}>Remove</button>
                  </li>
                ))}
              </ul>
              <div>
                <button onClick={onAddFolder}>Add a folder…</button>
              </div>
              <h3>Starting up</h3>
              <label className="pref-check">
                <input type="checkbox" checked={settings?.reopenLastPlaylist !== false} onChange={(e) => onSettings({ reopenLastPlaylist: e.target.checked })} />
                Open the last service playlist when Vessel starts
              </label>
              <h3>Logo</h3>
              <p className="hint">The Logo button (or L) shows it on the audience screen, on black, until you press it again or a slide goes on screen.</p>
              <div className="pref-logo">
                <div className="pref-logo-preview">{settings?.logoPath ? <img src={mediaUrl(settings.logoPath)} alt="" /> : <span className="muted">No logo</span>}</div>
                <label className="pref-field">
                  Picture
                  <select value={settings?.logoPath ?? ''} onChange={(e) => onSettings({ logoPath: e.target.value || undefined })}>
                    <option value="">None</option>
                    {settings?.logoPath && !images.some((m) => m.path === settings.logoPath) && <option value={settings.logoPath}>{settings.logoPath.split(/[\\/]/).pop()}</option>}
                    {images.map((m) => (
                      <option key={m.id} value={m.path}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <span className="hint">From the pictures in your media bin. Import your logo there first.</span>
                </label>
              </div>
              <h3>Data folder</h3>
              <p className="hint">Where Vessel keeps its settings, Bibles, media bin and CCLI log. Back this folder up along with Documents/Vessel.</p>
              <ul className="pref-folders">
                <li>
                  <span title={dataFolder}>{dataFolder}</span>
                  <button onClick={() => void window.vessel.openDataFolder()}>Open</button>
                </li>
              </ul>
            </>
          )}

          {section === 'screens' && (
            <>
              <h3>Screens</h3>
              <label className="pref-field">
                Audience output
                <select value={outputDisplay ?? ''} onChange={(e) => onOutput(e.target.value)}>
                  <option value="">Off</option>
                  {displays.map((d, i) => (
                    <option key={d.id} value={d.id} disabled={d.id === stageDisplay}>
                      {display(d, i)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pref-field">
                Stage display
                <select value={stageDisplay ?? ''} onChange={(e) => onStageOutput(e.target.value)}>
                  <option value="">Off</option>
                  {displays.map((d, i) => (
                    <option key={d.id} value={d.id} disabled={d.id === outputDisplay}>
                      {display(d, i)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">Each screen fills its display at the display’s own resolution. One display can’t show both.</p>
              <label className="pref-check">
                <input type="checkbox" checked={settings?.showOutputAtLaunch !== false} onChange={(e) => onSettings({ showOutputAtLaunch: e.target.checked })} />
                Show the audience screen when Vessel starts
              </label>
              <label className="pref-field">
                Fade between slides and media
                <select value={transitionMs} onChange={(e) => onTransition(Number(e.target.value))}>
                  <option value={0}>Cut</option>
                  <option value={250}>0.25 seconds</option>
                  <option value={500}>0.5 seconds</option>
                  <option value={1000}>1 second</option>
                  <option value={2000}>2 seconds</option>
                </select>
              </label>
              <h3>Slides</h3>
              <label className="pref-field">
                Slide size for new presentations
                <select
                  value={`${size.width}x${size.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split('x').map(Number);
                    onSettings({ slideSize: { width, height } });
                  }}
                >
                  {SLIDE_SIZES.map((s) => (
                    <option key={s.label} value={`${s.width}x${s.height}`}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">Used for new songs, imported lyrics and Bible passages. Presentations you already have keep their own size, and every size fits any screen.</p>
            </>
          )}

          {section === 'appearance' && (
            <>
              <h3>Appearance</h3>
              <div className="pref-appearance">
                {(
                  [
                    ['dark', 'Dark', 'Easy on the eyes in a dark room'],
                    ['light', 'Light', 'For bright rooms and daytime'],
                    ['system', 'Same as this computer', 'Follows the computer’s light or dark setting']
                  ] as const
                ).map(([id, label, note]) => (
                  <button key={id} className={`pref-look ${id} ${appearance === id ? 'active' : ''}`} onClick={() => onSettings({ appearance: id })}>
                    <span className="pref-look-swatch" />
                    <strong>{label}</strong>
                    <span className="hint">{note}</span>
                  </button>
                ))}
              </div>
              <p className="hint">This changes Vessel’s own window. The audience and stage screens always stay black behind your slides.</p>
            </>
          )}

          {section === 'groups' && (
            <>
              <h3>Groups</h3>
              <p className="hint">
                The sections your songs use. New songs and imports colour groups from this list (“Verse 2” uses Verse), and in a show the letter jumps to that group. Songs you
                already have keep their colours.
              </p>
              <table className="pref-groups">
                <thead>
                  <tr>
                    <th>Colour</th>
                    <th>Name</th>
                    <th>Key</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={i}>
                      <td>
                        <input type="color" value={g.color} onChange={(e) => changeGroups(groups.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} aria-label={`${g.name} colour`} />
                      </td>
                      <td>
                        <input value={g.name} placeholder="Group name" onChange={(e) => changeGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      </td>
                      <td>
                        <input
                          className="pref-key"
                          value={g.key ?? ''}
                          maxLength={1}
                          placeholder="–"
                          onChange={(e) => changeGroups(groups.map((x, j) => (j === i ? { ...x, key: e.target.value.toUpperCase() } : x)))}
                          aria-label={`${g.name} key`}
                        />
                      </td>
                      <td>
                        <button onClick={() => changeGroups(groups.filter((_x, j) => j !== i))} title="Remove from the list" aria-label={`Remove ${g.name}`}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pref-row">
                <button onClick={() => changeGroups([...groups, { name: '', color: '#737380' }])}>Add a group</button>
                <button onClick={() => changeGroups(DEFAULT_GROUPS)}>Use the built-in list</button>
              </div>
            </>
          )}

          {section === 'media' && (
            <>
              <h3>New backgrounds</h3>
              <label className="pref-field">
                Fit to the screen
                <select value={settings?.mediaScale ?? 'fill'} onChange={(e) => onSettings({ mediaScale: e.target.value as MediaScale })}>
                  <option value="fill">Fill (crop the edges if needed)</option>
                  <option value="fit">Fit (show it all, bars if needed)</option>
                  <option value="stretch">Stretch to the screen</option>
                </select>
              </label>
              <label className="pref-field">
                Videos
                <select value={settings?.videoLoop === false ? 'once' : 'loop'} onChange={(e) => onSettings({ videoLoop: e.target.value === 'loop' })}>
                  <option value="loop">Loop</option>
                  <option value="once">Play once</option>
                </select>
              </label>
              <p className="hint">For pictures and videos you put on screen from the media bin or add to slides from now on.</p>
              <h3>Keeping media with your songs</h3>
              <label className="pref-check">
                <input type="checkbox" checked={!!settings?.copyMedia} onChange={(e) => onSettings({ copyMedia: e.target.checked })} />
                Copy imported pictures, videos and audio into Documents/Vessel/Media
              </label>
              <p className="hint">Then songs keep their backgrounds when the original files are moved, and copying Documents/Vessel to another computer takes the media along.</p>
            </>
          )}

          {section === 'sound' && (
            <>
              <h3>Sound output</h3>
              <label className="pref-field">
                Play sound through
                <select value={settings?.audioOutputId ?? ''} onChange={(e) => onSettings({ audioOutputId: e.target.value || undefined })}>
                  <option value="">This computer’s default output</option>
                  {settings?.audioOutputId && devices && !devices.some((d) => d.id === settings.audioOutputId) && <option value={settings.audioOutputId}>A device that isn’t connected</option>}
                  {(devices ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span className="hint">For the audio player and videos, on the audience screen and in the preview.</span>
              </label>
              <label className="pref-field">
                Level
                <span className="pref-range">
                  <input type="range" min={0} max={1} step={0.05} value={settings?.audioLevel ?? 1} onChange={(e) => onSettings({ audioLevel: Number(e.target.value) })} />
                  <span>{Math.round((settings?.audioLevel ?? 1) * 100)}%</span>
                </span>
              </label>
              <label className="pref-field">
                Delay (milliseconds)
                <input
                  inputMode="numeric"
                  value={delay}
                  placeholder="0"
                  onChange={(e) => setDelay(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => {
                    const ms = Math.min(500, Math.max(0, Number(delay) || 0));
                    setDelay(String(ms));
                    if (ms !== (settings?.audioDelayMs ?? 0)) onSettings({ audioDelayMs: ms });
                  }}
                />
                <span className="hint">Holds sound back (up to 500 ms) when the picture reaches the screen late, e.g. through a video switcher.</span>
              </label>
              <h3>Video sound</h3>
              <label className="pref-check">
                <input type="checkbox" checked={settings?.previewSound !== false} onChange={(e) => onSettings({ previewSound: e.target.checked })} />
                Play a video’s sound in the Live preview while the audience output is off
              </label>
              <p className="hint">With the output on, sound plays from the audience screen only, so it’s never heard twice.</p>
              <label className="pref-field">
                Video volume
                <span className="pref-range">
                  <input type="range" min={0} max={1} step={0.05} value={videoSound.volume} onChange={(e) => onVideoSound({ ...videoSound, volume: Number(e.target.value) })} />
                  <span>{Math.round(videoSound.volume * 100)}%</span>
                </span>
              </label>
              <label className="pref-check">
                <input type="checkbox" checked={videoSound.muted} onChange={(e) => onVideoSound({ ...videoSound, muted: e.target.checked })} />
                Mute video sound
              </label>
              <p className="hint">To keep particular videos silent (motion backgrounds), right-click them in the media bin ▸ Always mute this video.</p>
              <h3>Audio</h3>
              <label className="pref-field">
                Audio player volume
                <span className="pref-range">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioVolume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setAudioVolume(v);
                      try {
                        localStorage.setItem('vessel.audioVolume', String(v));
                      } catch {
                        // Not remembered.
                      }
                    }}
                  />
                  <span>{Math.round(audioVolume * 100)}%</span>
                </span>
              </label>
              <p className="hint">Used the next time an audio file starts. The player in the Live panel has its own slider too.</p>
            </>
          )}

          {section === 'stage' && (
            <>
              <h3>Stage display</h3>
              <div className="pref-options">
                {STAGE_PRESETS.map((p) => (
                  <label key={p.id} className="pref-check">
                    <input type="radio" checked={stagePreset?.id === p.id} onChange={() => onStageLayout(p.layout)} />
                    <span>
                      <strong>{p.name}</strong> <span className="muted">· {p.description}</span>
                    </span>
                  </label>
                ))}
                {!stagePreset && <p className="hint">Now: your own layout. Adjust it in the Stage panel (Adjust…).</p>}
              </div>
            </>
          )}

          {section === 'import' && (
            <>
              <h3>Importing PowerPoint, Word and text</h3>
              <p className="hint">The Import window starts with these, and files you drop onto Vessel use them.</p>
              <label className="pref-field">
                PowerPoint slides
                <select value={imports.pptxLook} onChange={(e) => changeImports({ pptxLook: e.target.value as ImportOptions['pptxLook'] })}>
                  <option value="slides">Keep their look</option>
                  <option value="lyrics">Words only, with my default theme</option>
                </select>
              </label>
              <label className="pref-field">
                Lines per slide (lyrics)
                <select value={imports.linesPerSlide} onChange={(e) => changeImports({ linesPerSlide: Number(e.target.value) })}>
                  <option value={0}>Whole verse</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <label className="pref-check">
                <input type="checkbox" checked={imports.removeChords} onChange={(e) => changeImports({ removeChords: e.target.checked })} />
                Leave out chord lines and [G] chords
              </label>
            </>
          )}

          {section === 'ccli' && (
            <>
              <h3>CCLI</h3>
              <label className="pref-field">
                Your church’s CCLI licence number
                <input
                  value={licence}
                  inputMode="numeric"
                  placeholder="Leave empty if you don’t have one"
                  onChange={(e) => setLicence(e.target.value)}
                  onBlur={() => licence.trim() !== (settings?.ccliLicence ?? '') && onSettings({ ccliLicence: licence.trim() })}
                />
              </label>
              <label className="pref-field">
                Copyright line on screen
                <select value={settings?.ccliCopyright ?? 'off'} onChange={(e) => onSettings({ ccliCopyright: e.target.value as CopyrightPosition, ccliLicence: licence.trim() })}>
                  <option value="off">Off</option>
                  <option value="first">On each song’s first slide</option>
                  <option value="last">On each song’s last slide</option>
                  <option value="both">On the first and last slides</option>
                  <option value="all">On every slide</option>
                </select>
              </label>
              <div className="pref-row">
                <button onClick={onOpenCcli}>Open the usage report…</button>
                <button
                  onClick={async () => {
                    if (!confirm('Clear the whole CCLI usage log? Every song shown so far is forgotten. Save the report first if you still need it.')) return;
                    await window.vessel.clearSongUsage();
                  }}
                >
                  Clear the usage log…
                </button>
              </div>
            </>
          )}

          {section === 'remote' && (
            <>
              <h3>Remote control</h3>
              <p>
                Phones and tablets on the same Wi-Fi can run slides: <strong>{remoteEnabled ? 'on' : 'off'}</strong>.
              </p>
              <p className="hint">Turn it on or off, see the address and QR code, and change the PIN in the Remote window.</p>
              <div>
                <button onClick={onOpenRemote}>Remote control…</button>
              </div>
            </>
          )}
        </div>

        <div className="preferences-done">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
