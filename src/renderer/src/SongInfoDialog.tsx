import { useState } from 'react';
import { copyrightLine, type SongInfo } from '../../shared/ccli';

/** A song's CCLI details: shown in the copyright line and the CCLI report, saved in the .pro file. */
export function SongInfoDialog({
  info,
  licence,
  onSave,
  onCancel
}: {
  info: SongInfo;
  licence: string;
  onSave: (info: SongInfo) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<SongInfo>(info);
  const set = (patch: Partial<SongInfo>): void => setDraft((d) => ({ ...d, ...patch }));
  const number = (v: string): number => Number(v.replace(/\D/g, '')) || 0;
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal song-info-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Song info (CCLI)</h2>
        <p className="hint">
          Shown in the copyright line on screen and in the CCLI report. Find the details on the song’s page in SongSelect, or in the songbook it came from.
        </p>
        <label>
          Title
          <input autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          Words and music by
          <input value={draft.authors} placeholder="e.g. A. Writer, B. Writer" onChange={(e) => set({ authors: e.target.value })} />
        </label>
        <div className="song-info-row">
          <label>
            Copyright year
            <input inputMode="numeric" value={draft.year || ''} placeholder="2020" onChange={(e) => set({ year: number(e.target.value) })} />
          </label>
          <label className="grow">
            Publisher (copyright holder)
            <input value={draft.publisher} placeholder="e.g. Example Music" onChange={(e) => set({ publisher: e.target.value })} />
          </label>
        </div>
        <label>
          CCLI song number
          <input inputMode="numeric" value={draft.songNumber || ''} placeholder="e.g. 1234567" onChange={(e) => set({ songNumber: number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.display} onChange={(e) => set({ display: e.target.checked })} />
          Show the copyright line for this song (when it’s switched on in Tools ▸ CCLI)
        </label>
        <p className="song-info-preview" title="How the line reads on screen">
          {copyrightLine(draft, licence)}
        </p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onSave(draft)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
