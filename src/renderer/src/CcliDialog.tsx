import { useEffect, useMemo, useState } from 'react';
import { copyrightLine, localDate, reportCsv, reportTsv, usageReport, type CopyrightPosition, type ReportRow, type UsageEntry } from '../../shared/ccli';
import type { Settings } from '../../shared/types';

const monthsAgo = (n: number): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return localDate(d);
};

/** Tools ▸ CCLI: the licence number, the copyright line on screen, and the usage report. */
export function CcliDialog({
  settings,
  onSettings,
  onOpenSong,
  onStatus,
  onClose
}: {
  settings: Settings | null;
  onSettings: (patch: Partial<Settings>) => void;
  /** Open a song (to fill in its CCLI number in Edit). */
  onOpenSong: (path: string) => void;
  onStatus: (message: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [log, setLog] = useState<UsageEntry[] | null>(null);
  const [from, setFrom] = useState(monthsAgo(6));
  const [to, setTo] = useState(localDate());
  const [licence, setLicence] = useState(settings?.ccliLicence ?? '');
  const position: CopyrightPosition = settings?.ccliCopyright ?? 'off';

  useEffect(() => {
    void window.vessel.songUsage().then(setLog);
  }, []);

  const report = useMemo(() => (log ? usageReport(log, from, to) : null), [log, from, to]);
  const pathOf = (row: ReportRow): string | undefined => [...(log ?? [])].reverse().find((e) => e.title === row.title && e.path)?.path;
  const example = copyrightLine({ title: 'Song Title', authors: 'A. Writer', publisher: 'Example Music', year: 2020, songNumber: 1234567, display: true }, licence);

  const copy = async (): Promise<void> => {
    if (!report) return;
    await navigator.clipboard.writeText(reportTsv(report.songs));
    onStatus(`Copied ${report.songs.length} songs. Paste into a spreadsheet, or use the numbers in CCLI’s reporting.`);
  };
  const clearLog = async (): Promise<void> => {
    if (!confirm('Clear the whole CCLI usage log? Every song shown so far is forgotten. Save a CSV first if you still need it.')) return;
    await window.vessel.clearSongUsage();
    setLog([]);
    onStatus('The CCLI usage log is empty.');
  };

  const save = async (): Promise<void> => {
    if (!report) return;
    const path = await window.vessel.saveReport(reportCsv([...report.songs, ...report.missingNumbers], from, to, licence), `CCLI report ${from} to ${to}`);
    if (path) onStatus(`Saved the CCLI report to ${path}`);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal ccli-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>CCLI</h2>

        <section className="ccli-settings">
          <label>
            Your church’s CCLI licence number
            <input
              value={licence}
              inputMode="numeric"
              placeholder="Leave empty if you don’t have one"
              onChange={(e) => setLicence(e.target.value)}
              onBlur={() => licence !== (settings?.ccliLicence ?? '') && onSettings({ ccliLicence: licence.trim() })}
            />
          </label>
          <label>
            Show the copyright line on screen
            <select value={position} onChange={(e) => onSettings({ ccliCopyright: e.target.value as CopyrightPosition, ccliLicence: licence.trim() })}>
              <option value="off">Off</option>
              <option value="first">On each song’s first slide</option>
              <option value="last">On each song’s last slide</option>
              <option value="both">On the first and last slides</option>
              <option value="all">On every slide</option>
            </select>
          </label>
          <p className="ccli-example" title="Filled in from each song’s Song info (CCLI); songs can opt out there">
            {example}
          </p>
          <p className="hint">
            Drawn along the bottom of the audience screen; your slides aren’t changed. Each song’s details come from Edit ▸ Song info (CCLI), where a song can also opt out.
          </p>
        </section>

        <section className="ccli-report">
          <div className="ccli-report-head">
            <h3>Songs used</h3>
            <label>
              From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              to <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <span className="spacer" />
            <button onClick={() => void copy()} disabled={!report?.songs.length}>
              Copy
            </button>
            <button onClick={() => void save()} disabled={!report || !(report.songs.length + report.missingNumbers.length)}>
              Save as CSV…
            </button>
            <button onClick={() => void clearLog()} disabled={!log?.length} title="Empty the usage log, e.g. after reporting to CCLI">
              Clear the log…
            </button>
          </div>
          <p className="hint">
            A song counts once a day when it was on screen with the audience output on (rehearsing with the output off isn’t counted). Bible passages aren’t included.
          </p>
          {!report ? (
            <p className="hint">Loading…</p>
          ) : report.songs.length + report.missingNumbers.length === 0 ? (
            <p className="empty">No songs were shown with the audience output on between these dates.</p>
          ) : (
            <div className="ccli-table-wrap">
              <table className="ccli-table">
                <thead>
                  <tr>
                    <th>CCLI #</th>
                    <th>Song</th>
                    <th>Words and music</th>
                    <th className="num">Times</th>
                    <th>Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {report.songs.map((r) => (
                    <tr key={`#${r.songNumber}`}>
                      <td>{r.songNumber}</td>
                      <td>{r.title}</td>
                      <td>{r.authors}</td>
                      <td className="num">{r.uses}</td>
                      <td>{r.lastUsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.missingNumbers.length > 0 && (
                <>
                  <h3 className="ccli-missing-title">Shown without a CCLI number ({report.missingNumbers.length})</h3>
                  <p className="hint">Add the number in Edit ▸ Song info (CCLI) so they can be reported. Your own notices or songs that aren’t under copyright can be left as they are.</p>
                  <ul className="ccli-missing">
                    {report.missingNumbers.map((r) => {
                      const path = pathOf(r);
                      return (
                        <li key={r.title}>
                          <span>
                            {r.title} <span className="muted">· {r.uses}×, last {r.lastUsed}</span>
                          </span>
                          {path && (
                            <button
                              onClick={() => {
                                onOpenSong(path);
                                onClose();
                              }}
                            >
                              Open to add it
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
