import { useEffect, useRef, useState, type ReactNode } from 'react';
import { normalizeNdi } from '../../shared/ndi';
import { normalizeStreamTarget, type StreamTarget } from '../../shared/stream';
import type { DisplayInfo, Settings } from '../../shared/types';
import { ScreensIcon } from './Icons';

const MAC = navigator.platform.startsWith('Mac');

/** "⌘N" on a Mac, "Ctrl+N" elsewhere, from "Mod+N". */
export const shortcut = (keys: string): string => (MAC ? keys.replace('Mod+', '⌘').replace('Shift+', '⇧') : keys.replace('Mod+', 'Ctrl+'));

/**
 * An icon-only toolbar button. Its name (and shortcut) shows straight away on
 * hover or keyboard focus, and screen readers hear the name.
 */
export function ToolButton({
  label,
  keys,
  icon,
  onClick,
  disabled,
  active,
  badge,
  dot,
  align
}: {
  label: string;
  /** e.g. "Mod+N". */
  keys?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Pressed, e.g. the Bible while it's open. */
  active?: boolean;
  /** A small number in the corner (phones connected). */
  badge?: number;
  /** A coloured dot in the corner: on, unsaved, or off. */
  dot?: 'on' | 'unsaved' | 'off';
  /** Keep the tooltip inside the window at the right-hand edge. */
  align?: 'end';
}): React.JSX.Element {
  return (
    <button
      className={`tool-button ${active ? 'active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      data-keys={keys ? shortcut(keys) : undefined}
      data-align={align}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {dot && <span className={`tool-dot ${dot}`} aria-hidden="true" />}
      {!!badge && <span className="tool-badge" aria-hidden="true">{badge}</span>}
    </button>
  );
}

const displayName = (d: DisplayInfo, i: number): string => `${d.label || `Display ${i + 1}`} · ${d.bounds.width}×${d.bounds.height}${d.primary ? ' (main)' : ''}`;

/** One button for everything about screens: where the audience, stage and stream outputs show, and the fade. */
export function ScreensButton({
  displays,
  outputDisplay,
  stageDisplay,
  settings,
  transitionMs,
  onOutput,
  onStageOutput,
  onStreamOutput,
  onTransition,
  onOpenSettings,
  openRequest = 0
}: {
  displays: DisplayInfo[];
  outputDisplay: number | null;
  stageDisplay: number | null;
  settings: Settings | null;
  transitionMs: number;
  /** '' turns it off. */
  onOutput: (displayId: string) => void;
  onStageOutput: (displayId: string) => void;
  onStreamOutput: (target: StreamTarget) => void;
  onTransition: (ms: number) => void;
  onOpenSettings: () => void;
  /** Bumped to open the panel from elsewhere ("Choose a screen…" under the Live preview). */
  openRequest?: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);
  const root = useRef<HTMLDivElement>(null);
  const stream = normalizeStreamTarget(settings?.streamOutput);
  const ndi = normalizeNdi(settings?.ndi);

  // Close on a click elsewhere, or Esc.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const nameOf = (id: number | null): string => {
    const i = displays.findIndex((d) => d.id === id);
    return i >= 0 ? displays[i].label || `Display ${i + 1}` : 'off';
  };
  const summary = `Screens · Audience ${nameOf(outputDisplay)}${stageDisplay !== null ? ` · Stage ${nameOf(stageDisplay)}` : ''}`;
  const used = (id: number, own: number | 'window' | null): boolean => (id === outputDisplay || id === stageDisplay || id === stream) && id !== own;

  return (
    <div className="screens-button" ref={root}>
      <ToolButton
        label={open ? 'Screens' : summary}
        icon={<ScreensIcon size={18} />}
        onClick={() => setOpen((v) => !v)}
        active={open}
        dot={outputDisplay !== null ? 'on' : 'off'}
        align="end"
      />
      {open && (
        <div className="screens-panel" role="dialog" aria-label="Screens">
          <label>
            <span>Audience</span>
            <select value={outputDisplay ?? ''} onChange={(e) => onOutput(e.target.value)} autoFocus>
              <option value="">Off</option>
              {displays.map((d, i) => (
                <option key={d.id} value={d.id} disabled={used(d.id, outputDisplay)}>
                  {displayName(d, i)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Stage</span>
            <select value={stageDisplay ?? ''} onChange={(e) => onStageOutput(e.target.value)}>
              <option value="">Off</option>
              {displays.map((d, i) => (
                <option key={d.id} value={d.id} disabled={used(d.id, stageDisplay)}>
                  {displayName(d, i)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Stream</span>
            <select value={String(stream ?? '')} onChange={(e) => onStreamOutput(e.target.value === '' ? null : e.target.value === 'window' ? 'window' : Number(e.target.value))}>
              <option value="">Off</option>
              <option value="window">In a window (OBS, vMix)</option>
              {displays.map((d, i) => (
                <option key={d.id} value={d.id} disabled={used(d.id, stream)}>
                  {displayName(d, i)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fade</span>
            <select value={transitionMs} onChange={(e) => onTransition(Number(e.target.value))}>
              <option value={0}>Cut</option>
              <option value={250}>0.25 s</option>
              <option value={500}>0.5 s</option>
              <option value={1000}>1 s</option>
              <option value={2000}>2 s</option>
            </select>
          </label>
          <div className="screens-foot">
            <span className="muted">NDI® {ndi.enabled ? 'on' : 'off'}</span>
            <button
              className="link-button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              More screen settings…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Show / Edit as one sliding switch: a glass "thumb" glides under the chosen
 * side with a little spring, like the switches on an iPhone.
 */
export function ModeSwitch({ mode, canEdit, onChange }: { mode: 'show' | 'edit'; canEdit: boolean; onChange: (mode: 'show' | 'edit') => void }): React.JSX.Element {
  return (
    <div className={`mode-switch ${mode}`} role="radiogroup" aria-label="Mode">
      <span className="mode-thumb" aria-hidden="true" />
      <button role="radio" aria-checked={mode === 'show'} className={mode === 'show' ? 'on' : ''} onClick={() => onChange('show')} title={`Run the service (${shortcut('Mod+1')})`}>
        Show
      </button>
      <button
        role="radio"
        aria-checked={mode === 'edit'}
        className={mode === 'edit' ? 'on' : ''}
        onClick={() => onChange('edit')}
        disabled={!canEdit}
        title={canEdit ? `Edit this presentation (${shortcut('Mod+2')})` : 'Choose a presentation to edit'}
      >
        Edit
      </button>
    </div>
  );
}
