import { useEffect, useState } from 'react';
import { allThemes, duplicateTheme, findTheme, themeLayout, type Theme, type ThemeLibrary } from '../../shared/theme';
import type { Background } from '../../shared/types';
import { MediaView } from './AudienceView';
import { SlideCanvas } from './SlideCanvas';

const COMMON_FONTS = [
  'Helvetica Neue', 'Helvetica', 'Arial', 'Arial Black', 'Avenir Next', 'Futura', 'Gill Sans', 'Montserrat',
  'Open Sans', 'Segoe UI', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Palatino', 'Baskerville'
];

const SAMPLE = 'Amazing grace how sweet the sound\nThat saved a wretch like me';

/** System fonts where the browser allows listing them, else a common set. */
function useFontList(): string[] {
  const [fonts, setFonts] = useState(COMMON_FONTS);
  useEffect(() => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts;
    if (!query) return;
    query()
      .then((list) => {
        const families = [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
        if (families.length) setFonts(families);
      })
      .catch(() => undefined);
  }, []);
  return fonts;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="theme-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const pct = (v: number): number => Math.round(v * 100);

export function ThemeDialog({
  library,
  onLibraryChange,
  presentationName,
  background,
  onApply,
  onClose
}: {
  library: ThemeLibrary;
  onLibraryChange: (lib: ThemeLibrary) => void;
  presentationName?: string;
  background: Background | null;
  onApply: (theme: Theme) => void;
  onClose: () => void;
}): React.JSX.Element {
  const fonts = useFontList();
  const [selectedId, setSelectedId] = useState(library.defaultId);
  const theme = findTheme(library, selectedId);
  const editable = !theme.builtIn;

  const update = (patch: Partial<Theme>): void => {
    if (!editable) return;
    onLibraryChange({ ...library, custom: library.custom.map((t) => (t.id === theme.id ? { ...t, ...patch } : t)) });
  };
  const updateBox = (key: keyof Theme['box'], value: number): void => update({ box: { ...theme.box, [key]: value / 100 } });

  const duplicate = (): void => {
    const copy = duplicateTheme(theme);
    onLibraryChange({ ...library, custom: [...library.custom, copy] });
    setSelectedId(copy.id);
  };
  const remove = (): void => {
    if (!editable || !confirm(`Delete the theme "${theme.name}"?`)) return;
    const custom = library.custom.filter((t) => t.id !== theme.id);
    onLibraryChange({ custom, defaultId: library.defaultId === theme.id ? 'classic' : library.defaultId });
    setSelectedId('classic');
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal theme-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Themes</h2>
        <div className="theme-layout">
          <div className="theme-list">
            {allThemes(library).map((t) => (
              <button key={t.id} className={`list-item ${t.id === theme.id ? 'selected' : ''}`} onClick={() => setSelectedId(t.id)}>
                {t.name}
                {t.id === library.defaultId ? ' ★' : ''}
                {t.builtIn ? <span className="muted"> · built-in</span> : null}
              </button>
            ))}
            <div className="theme-list-actions">
              <button onClick={duplicate}>Duplicate</button>
              <button onClick={remove} disabled={!editable}>
                Delete
              </button>
            </div>
          </div>

          <div className="theme-editor">
            <div className="theme-preview">
              {background && <MediaView bg={background} muted thumbnail />}
              <SlideCanvas layout={themeLayout(theme, SAMPLE)} />
            </div>
            {!editable && <p className="hint">Built-in themes can't be changed. Duplicate one to make your own.</p>}
            <fieldset disabled={!editable} className="theme-fields">
              <Field label="Name">
                <input value={theme.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Font">
                <input list="theme-fonts" value={theme.font} onChange={(e) => update({ font: e.target.value })} />
                <datalist id="theme-fonts">
                  {fonts.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </Field>
              <Field label="Size">
                <input type="number" min={12} max={300} value={theme.sizePt} onChange={(e) => update({ sizePt: Number(e.target.value) || theme.sizePt })} />
              </Field>
              <Field label="Colour">
                <input type="color" value={theme.color} onChange={(e) => update({ color: e.target.value })} />
              </Field>
              <Field label="Style">
                <span className="theme-toggles">
                  <label>
                    <input type="checkbox" checked={theme.bold} onChange={(e) => update({ bold: e.target.checked })} /> Bold
                  </label>
                  <label>
                    <input type="checkbox" checked={theme.italic} onChange={(e) => update({ italic: e.target.checked })} /> Italic
                  </label>
                  <label>
                    <input type="checkbox" checked={theme.uppercase} onChange={(e) => update({ uppercase: e.target.checked })} /> All caps
                  </label>
                  <label>
                    <input type="checkbox" checked={theme.shadow} onChange={(e) => update({ shadow: e.target.checked })} /> Shadow
                  </label>
                </span>
              </Field>
              <Field label="Outline">
                <span className="theme-toggles">
                  <input type="number" min={0} max={20} value={theme.outlineWidth} onChange={(e) => update({ outlineWidth: Math.max(0, Number(e.target.value)) })} />
                  <input type="color" value={theme.outlineColor} onChange={(e) => update({ outlineColor: e.target.value })} />
                </span>
              </Field>
              <Field label="Bar">
                <span className="theme-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!theme.bar}
                      onChange={(e) => update({ bar: e.target.checked ? { color: '#000000', opacity: 0.6 } : null })}
                    />{' '}
                    Behind text
                  </label>
                  {theme.bar && (
                    <>
                      <input type="color" value={theme.bar.color} onChange={(e) => update({ bar: { ...theme.bar!, color: e.target.value } })} />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        title="Opacity %"
                        value={Math.round(theme.bar.opacity * 100)}
                        onChange={(e) => update({ bar: { ...theme.bar!, opacity: Math.max(0, Math.min(100, Number(e.target.value))) / 100 } })}
                      />
                      %
                    </>
                  )}
                </span>
              </Field>
              <Field label="Align">
                <select value={theme.align} onChange={(e) => update({ align: e.target.value as Theme['align'] })}>
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </Field>
              <Field label="Position">
                <select value={theme.valign} onChange={(e) => update({ valign: e.target.value as Theme['valign'] })}>
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </Field>
              <Field label="Text box %">
                <span className="theme-box">
                  {(['x', 'y', 'width', 'height'] as const).map((k) => (
                    <label key={k}>
                      {k === 'width' ? 'W' : k === 'height' ? 'H' : k.toUpperCase()}
                      <input type="number" min={0} max={100} value={pct(theme.box[k])} onChange={(e) => updateBox(k, Number(e.target.value))} />
                    </label>
                  ))}
                </span>
              </Field>
            </fieldset>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={() => onLibraryChange({ ...library, defaultId: theme.id })} disabled={library.defaultId === theme.id}>
            {library.defaultId === theme.id ? 'Default for new songs ★' : 'Use for new songs'}
          </button>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
          <button className="primary" disabled={!presentationName} onClick={() => onApply(theme)}>
            {presentationName ? `Apply to “${presentationName}”` : 'Open a presentation to apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
