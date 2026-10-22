import { useState } from 'react';
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from '../../shared/import';

const STORE = 'vessel.importOptions';

function remembered(): ImportOptions {
  try {
    return { ...DEFAULT_IMPORT_OPTIONS, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<ImportOptions>) };
  } catch {
    return DEFAULT_IMPORT_OPTIONS;
  }
}

/** File ▸ Import: how to bring in PowerPoint, Word and text files, then pick them. */
export function ImportDialog({ onImport, onCancel }: { onImport: (opts: ImportOptions) => void; onCancel: () => void }): React.JSX.Element {
  const [opts, setOpts] = useState<ImportOptions>(remembered);
  const change = (patch: Partial<ImportOptions>): void => setOpts((o) => ({ ...o, ...patch }));
  const go = (): void => {
    try {
      localStorage.setItem(STORE, JSON.stringify(opts));
    } catch {
      // Not remembered this time; the import still runs.
    }
    onImport(opts);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Import PowerPoint, Word or text</h2>
        <p className="hint">
          Each file becomes a song in your library. Reads PowerPoint (.pptx; export Google Slides and Keynote as PowerPoint), Word (.docx), OpenDocument (.odt),
          RTF, text and ChordPro files. The original files are never changed.
        </p>

        <section className="import-option">
          <h3>PowerPoint slides</h3>
          <label>
            <input type="radio" name="pptx-look" checked={opts.pptxLook === 'slides'} onChange={() => change({ pptxLook: 'slides' })} />
            <span>
              <strong>Keep their look</strong>: backgrounds, pictures and text where they are on each slide
            </span>
          </label>
          <label>
            <input type="radio" name="pptx-look" checked={opts.pptxLook === 'lyrics'} onChange={() => change({ pptxLook: 'lyrics' })} />
            <span>
              <strong>Words only</strong>: make a song from the text and show it with your default theme
            </span>
          </label>
        </section>

        <section className="import-option">
          <h3>Lyrics (Word, text, and PowerPoint words only)</h3>
          <p className="hint">Blank lines separate verses. Lines like “Verse 1”, “Chorus” or “[Bridge]” start a group, and repeated sections share one group.</p>
          <label className="import-row">
            <span>Lines per slide</span>
            <select value={opts.linesPerSlide} onChange={(e) => change({ linesPerSlide: Number(e.target.value) })}>
              <option value={0}>Whole verse</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={opts.removeChords} onChange={(e) => change({ removeChords: e.target.checked })} />
            <span>Leave out chord lines (“G  D/F#  Em”) and [G] chords</span>
          </label>
        </section>

        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" autoFocus onClick={go}>
            Choose files…
          </button>
        </div>
      </div>
    </div>
  );
}
