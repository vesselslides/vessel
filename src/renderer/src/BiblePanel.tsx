import { useEffect, useMemo, useState } from 'react';
import { FREE_BIBLES } from '../../shared/bible/catalog';
import type { Bible } from '../../shared/bible/formats';
import { lookUp, searchBible, type Passage } from '../../shared/bible/reference';
import { DEFAULT_SCRIPTURE_OPTIONS, passageToPresentation, type ScriptureOptions } from '../../shared/bible/slides';
import type { Presentation } from '../../shared/gen/presentation_pb';
import { presentationToDeck } from '../../shared/pro/presentation';
import { allThemes, findTheme, type Theme, type ThemeLibrary } from '../../shared/theme';
import type { BibleInfo } from '../../shared/types';
import { SlideCanvas } from './SlideCanvas';

const STORE = 'vessel.bible';

interface Remembered extends ScriptureOptions {
  bibleId?: string;
  themeId: string;
}

function remembered(): Remembered {
  try {
    return { ...DEFAULT_SCRIPTURE_OPTIONS, themeId: 'scripture', ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Remembered>) };
  } catch {
    return { ...DEFAULT_SCRIPTURE_OPTIONS, themeId: 'scripture' };
  }
}

export interface ScriptureAction {
  presentation: Presentation;
  name: string;
}

const RESTART = 'Restart Vessel to use the Bible. (It was updated while it was running.)';

function slidesFor(bible: Bible, info: BibleInfo, passage: Passage, theme: Theme, opts: ScriptureOptions, size?: { width: number; height: number }): Presentation {
  return passageToPresentation(
    passage,
    { abbreviation: info.abbreviation, bookNames: (b) => bible.books[b].name, oneChapter: (b) => bible.books[b].chapters.length === 1 },
    theme,
    opts,
    size
  );
}

/**
 * The Bible, in the middle of the window: find a passage (or words), click a
 * verse to put it on screen, or keep the passage in a presentation or the service.
 */
export function BiblePanel({
  themes,
  slideSize,
  refresh,
  hasService,
  live,
  onShowSlide,
  onAddToPresentation,
  onAddToService,
  onSave,
  onStatus,
  onClose
}: {
  themes: ThemeLibrary;
  /** Slide size for passages (Preferences ▸ Screens). */
  slideSize?: { width: number; height: number };
  /** Changes when Bibles were added elsewhere (a dropped file), to reload the list. */
  refresh: number;
  hasService: boolean;
  /** The passage slide on screen, if it's one shown from here. */
  live: { name: string; index: number } | null;
  onShowSlide: (presentation: Presentation, index: number) => void;
  onAddToPresentation: (a: ScriptureAction) => void;
  onAddToService: (a: ScriptureAction) => void;
  onSave: (a: ScriptureAction) => void;
  onStatus: (message: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [opts, setOpts] = useState<Remembered>(remembered);
  const [bibles, setBibles] = useState<BibleInfo[] | null>(null);
  const [bible, setBible] = useState<Bible | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<{ id: string; received: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showGet, setShowGet] = useState(false);
  const info = bibles?.find((b) => b.id === opts.bibleId) ?? bibles?.[0];

  const change = (patch: Partial<Remembered>): void =>
    setOpts((o) => {
      const next = { ...o, ...patch };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // Not remembered; the choice still applies now.
      }
      return next;
    });

  // A window opened before Vessel was updated has no Bible support behind it; say so instead of waiting.
  useEffect(() => {
    if (typeof window.vessel.listBibles !== 'function') return setProblem(RESTART);
    if (typeof window.vessel.onBibleProgress === 'function') return window.vessel.onBibleProgress((p) => setDownload(p));
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window.vessel.listBibles !== 'function') return;
    window.vessel.listBibles().then((list) => {
      setBibles(list);
      // A Bible just added by dropping its file becomes the one shown.
      if (refresh && list.length) setOpts((o) => ({ ...o, bibleId: list[list.length - 1].id }));
    }, () => setProblem(RESTART));
  }, [refresh]);

  useEffect(() => {
    setBible(null);
    if (!info) return;
    window.vessel.getBible(info.id).then(
      (b) => (b ? setBible(b) : setProblem(`${info.name} couldn’t be opened. Remove it and add it again.`)),
      () => setProblem(RESTART)
    );
  }, [info?.id]);

  const downloadBible = async (id: string): Promise<void> => {
    if (typeof window.vessel.downloadBible !== 'function') return setProblem(RESTART);
    setDownload({ id, received: 0, total: (FREE_BIBLES.find((f) => f.id === id)?.sizeMb ?? 3) * 1024 * 1024 });
    try {
      const result = await window.vessel.downloadBible(id);
      setBibles(result.list);
      if (result.added) {
        change({ bibleId: result.added.id });
        setShowGet(false);
        onStatus(`Added ${result.added.name} (${result.added.abbreviation}): ${result.added.books} books, ${result.added.verses.toLocaleString()} verses. It works offline from now on.`);
      } else if (result.error) onStatus(`Could not download it: ${result.error}`);
    } finally {
      setDownload(null);
    }
  };

  const addFromFile = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.vessel.addBibles();
      setBibles(result.list);
      if (result.added.length) {
        change({ bibleId: result.added[result.added.length - 1].id });
        setShowGet(false);
      }
      const notes = result.added.map((b) => `Added ${b.name} (${b.abbreviation}): ${b.books} books, ${b.verses.toLocaleString()} verses.`);
      onStatus([...notes, ...result.errors.map((e) => `Could not add ${e}`)].join('  ·  '));
    } finally {
      setBusy(false);
    }
  };

  const removeBible = async (): Promise<void> => {
    if (!info || !confirm(`Remove ${info.name} (${info.abbreviation}) from Vessel? The file you downloaded is not touched.`)) return;
    const list = await window.vessel.removeBible(info.id);
    setBibles(list);
    change({ bibleId: list[0]?.id });
  };

  const theme = findTheme(themes, opts.themeId);
  const found = useMemo(() => (bible && query.trim() ? lookUp(bible, query) : null), [bible, query]);
  const passage: Passage | null = found && !('error' in found) ? found : null;
  const search = useMemo(() => (bible && !found && query.trim().length >= 3 ? searchBible(bible, query, 60) : null), [bible, found, query]);
  const result = useMemo(() => {
    if (!passage || !bible || !info) return null;
    const presentation = slidesFor(bible, info, passage, theme, opts, slideSize);
    return { presentation, name: presentation.name, deck: presentationToDeck(presentation, 'bible-preview') };
  }, [passage, bible, info, theme, opts, slideSize]);

  const act = (fn: (a: ScriptureAction) => void): void => {
    if (result) fn({ presentation: result.presentation, name: result.name });
  };

  /** A search result: open its verse and put it on screen straight away. */
  const showHit = (label: string): void => {
    setQuery(label);
    if (!bible || !info) return;
    const hit = lookUp(bible, label);
    if (hit && !('error' in hit)) onShowSlide(slidesFor(bible, info, hit, theme, opts, slideSize), 0);
  };

  const getView = bibles && (bibles.length === 0 || showGet);

  return (
    <section className="bible-panel">
      <div className="bible-head">
        <h2>Bible</h2>
        {bibles && bibles.length > 0 && (
          <select value={info?.id} onChange={(e) => change({ bibleId: e.target.value })} title="Translation">
            {bibles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.abbreviation} · {b.name}
              </option>
            ))}
          </select>
        )}
        {bibles && bibles.length > 0 && <button onClick={() => setShowGet((v) => !v)}>{showGet ? 'Back to verses' : 'Add a Bible…'}</button>}
        {info && !getView && (
          <button onClick={() => void removeBible()} title="Remove this translation from Vessel">
            Remove
          </button>
        )}
        <button className="bible-close" onClick={onClose} title="Close the Bible (Esc)">
          ×
        </button>
      </div>

      {problem ? (
        <p className="error">{problem}</p>
      ) : bibles === null ? (
        <p className="hint">Loading…</p>
      ) : getView ? (
        <div className="bible-get">
          {bibles.length === 0 && <p>Add a Bible to get started.</p>}
          <h3>Free Bibles</h3>
          <ul className="bible-free">
            {FREE_BIBLES.map((f) => {
              const have = bibles.some((b) => b.abbreviation === f.abbreviation && b.name === f.name);
              const mine = download?.id === f.id ? download : null;
              const pct = mine ? Math.min(100, Math.round((mine.received / mine.total) * 100)) : 0;
              return (
                <li key={f.id}>
                  <div>
                    <strong>
                      {f.name} ({f.abbreviation}){have && <span className="bible-have"> · added</span>}
                    </strong>
                    <span className="hint">{f.note}</span>
                    {mine && (
                      <span className="bible-progress">
                        <span className="bible-progress-bar">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                        {mine.received >= mine.total ? 'Reading the Bible…' : `${(mine.received / 1048576).toFixed(1)} of ${(mine.total / 1048576).toFixed(1)} MB · ${pct}%`}
                      </span>
                    )}
                  </div>
                  <button className={have ? '' : 'primary'} disabled={!!download} onClick={() => void downloadBible(f.id)}>
                    {mine ? 'Downloading…' : have ? 'Download again' : `Download (${f.sizeMb} MB)`}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint">Downloaded once from ebible.org (it can take a minute), then kept on this computer, so it works without internet.</p>
          <h3>From a file</h3>
          <div className="bible-file">
            <span className="hint">
              A Bible you’ve downloaded as XML or zipped XML: Zefania, OSIS, USFX, OpenSong or “Holy Bible XML”. Other translations are copyrighted, so use them only if your church is licensed to.
            </span>
            <button onClick={() => void addFromFile()} disabled={busy}>
              {busy ? 'Reading…' : 'Choose a file…'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            autoFocus
            className="bible-query"
            placeholder="John 3:16-18, Ps 23, Rom 8:28, 31-39 — or words like “living water”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && result) onShowSlide(result.presentation, 0);
              if (e.key === 'Escape') onClose();
            }}
          />
          <div className="bible-options">
            <label>
              Verses per slide
              <select value={opts.versesPerSlide} onChange={(e) => change({ versesPerSlide: Number(e.target.value) })}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={0}>Fill each slide</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={opts.verseNumbers} onChange={(e) => change({ verseNumbers: e.target.checked })} /> Verse numbers
            </label>
            <label>
              Reference
              <select value={opts.reference} onChange={(e) => change({ reference: e.target.value as ScriptureOptions['reference'] })}>
                <option value="every">On every slide</option>
                <option value="last">On the last slide</option>
                <option value="none">Off</option>
              </select>
            </label>
            <label>
              Theme
              <select value={theme.id} onChange={(e) => change({ themeId: e.target.value })}>
                {allThemes(themes).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="bible-results">
            {!bible && <p className="hint">Opening {info?.name ?? 'the Bible'}…</p>}
            {found && 'error' in found && <p className="error">{found.error}</p>}
            {result && (
              <>
                <div className="bible-actions">
                  <span className="bible-label">
                    {result.name} · {result.deck.slides.length} slide{result.deck.slides.length === 1 ? '' : 's'} · click a slide to show it
                  </span>
                  <button onClick={() => act(onAddToPresentation)} title="Put these slides at the end of a presentation or song (you choose which)">
                    Add to presentation ▾
                  </button>
                  <button onClick={() => act(onAddToService)} title={hasService ? 'Add to the end of a service playlist (you choose which)' : 'Add to a service playlist, or start a new one'}>
                    Add to service ▾
                  </button>
                  <button onClick={() => act(onSave)} title="Keep it as a presentation in your library">
                    Save to library
                  </button>
                </div>
                <div className="bible-preview">
                  {result.deck.slides.map((s, i) => (
                    <button
                      key={s.id}
                      className={`slide-canvas bible-slide ${live?.name === result.name && live.index === i ? 'live' : ''}`}
                      onClick={() => onShowSlide(result.presentation, i)}
                      title="Show this on screen"
                    >
                      <SlideCanvas layout={s.layout} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {search && (
              <ul className="bible-hits">
                {search.hits.length === 0 && <li className="hint">No verses have all of those words.</li>}
                {search.hits.map((h) => (
                  <li key={`${h.book}.${h.chapter}.${h.verse}`}>
                    <button onClick={() => showHit(h.label)} title="Show this verse on screen">
                      <strong>{h.label}</strong> {h.text}
                    </button>
                  </li>
                ))}
                {search.more && <li className="hint">More verses match. Add another word to narrow it down.</li>}
              </ul>
            )}
            {!query.trim() && bible && <p className="hint">Type a reference to see it as slides, or a few words to find a verse. Click a slide (or press Enter) to put it on screen.</p>}
          </div>
        </>
      )}
    </section>
  );
}
