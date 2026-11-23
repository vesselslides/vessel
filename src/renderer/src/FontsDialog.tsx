import { useEffect, useMemo, useState } from 'react';
import { lookAlikeFor } from '../../shared/fontSuggestions';
import type { Presentation } from '../../shared/gen/presentation_pb';
import { replaceFont } from '../../shared/pro/edit';
import type { Deck, SlideLayout } from '../../shared/types';
import { fontAvailable, missingFonts, useFontsVersion, vesselFamilies, vesselFontState } from './fonts';
import { CheckIcon, DocumentIcon, DownloadIcon, FontIcon } from './Icons';
import { SlideCanvas } from './SlideCanvas';
import { useFontList } from './ThemeDialog';

type Apply = (change: (p: Presentation) => Presentation) => void;

/** Where a replacement goes: this computer only (the song stays as it is), or into the song. */
type Scope = 'computer' | 'song';

/** The first slide using `font`, drawn with `use` instead when given. */
function previewLayout(deck: Deck, font: string, use?: string): SlideLayout | null {
  const key = font.toLowerCase();
  const slide = deck.slides.find((s) => s.layout.boxes.some((b) => b.font.trim().toLowerCase() === key && b.text.trim()));
  if (!slide) return null;
  if (!use) return slide.layout;
  return { ...slide.layout, boxes: slide.layout.boxes.map((b) => (b.font.trim().toLowerCase() === key ? { ...b, font: use } : b)) };
}

function Preview({ layout, label }: { layout: SlideLayout | null; label: string }): React.JSX.Element {
  return (
    <figure className="font-preview">
      <div className="slide-canvas">{layout && <SlideCanvas layout={layout} />}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/**
 * Fonts a presentation uses that this computer doesn't have, and what to do
 * about each: use the copy the file carried (automatic), download it free,
 * add the church's own font file, or draw it with another font, on this
 * computer only or written into the song.
 */
export function FontsDialog({ deck, apply, onClose }: { deck: Deck; apply: Apply; onClose: () => void }): React.JSX.Element {
  useFontsVersion();
  const installedList = useFontList();
  const missing = missingFonts(deck);
  // What the file carried, now in Vessel's fonts: shown so it's clear why they look right.
  const usedFonts = useMemo(() => new Set(deck.slides.flatMap((s) => s.layout.boxes.map((b) => b.font.trim().toLowerCase()))), [deck]);
  const carried = [...new Set(vesselFontState().fonts.filter((f) => f.source === 'embedded' && usedFonts.has(f.family.toLowerCase())).map((f) => f.family))];
  const [free, setFree] = useState<Record<string, boolean | 'checking'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<Scope>('computer');

  // Ask once per font whether it's free to download.
  const missingKey = missing.map((m) => m.font).join('|');
  useEffect(() => {
    for (const m of missing) {
      if (free[m.font] !== undefined) continue;
      setFree((f) => ({ ...f, [m.font]: 'checking' }));
      void window.vessel
        .isFreeFont(m.font)
        .then((yes) => setFree((f) => ({ ...f, [m.font]: yes })))
        .catch(() => setFree((f) => ({ ...f, [m.font]: false })));
    }
  }, [missingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (err: unknown): void => setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err));
  const run = async (font: string, job: () => Promise<unknown>): Promise<void> => {
    setBusy(font);
    setError(null);
    try {
      await job();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  /** Fonts to choose from: this computer's and Vessel's own, with the look-alike first. */
  const options = useMemo(() => [...new Set([...vesselFamilies(), ...installedList])].sort((a, b) => a.localeCompare(b)), [installedList, missingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = async (): Promise<void> => {
    const chosen = missing.filter((m) => choice[m.font] && choice[m.font] !== m.substitute);
    setBusy('done');
    setError(null);
    try {
      for (const m of chosen) {
        const use = choice[m.font];
        // A free look-alike that isn't here yet is downloaded first.
        if (fontAvailable(use) === false && (await window.vessel.isFreeFont(use))) await window.vessel.downloadFreeFont(use);
        if (scope === 'computer') await window.vessel.setFontSubstitute(m.font, use);
        else apply((p) => replaceFont(p, m.font, use));
      }
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal fonts-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Fonts for “{deck.name}”</h2>
        <p className="hint">
          {missing.length
            ? `This computer doesn’t have ${missing.length === 1 ? 'a font' : `${missing.length} fonts`} this presentation uses, so ${missing.length === 1 ? 'it’s' : 'they’re'} drawn with another font and may not fit or look as designed.`
            : 'Every font this presentation uses is here.'}
        </p>

        {carried.map((family) => (
          <div key={family} className="font-row">
            <div className="font-row-head">
              <FontIcon size={16} />
              <b>{family}</b>
              <span className="spacer" />
              <span className="font-tag ok">
                <CheckIcon size={12} /> Came with the file
              </span>
            </div>
            <p className="hint">The PowerPoint carries this font, so Vessel uses it wherever this computer doesn’t have it.</p>
          </div>
        ))}

        {missing.map((m) => {
          const suggestion = lookAlikeFor(m.font);
          const picked = choice[m.font] ?? m.substitute ?? '';
          const isFree = free[m.font];
          return (
            <div key={m.font} className="font-row">
              <div className="font-row-head">
                <FontIcon size={16} />
                <b>{m.font}</b>
                <span className="muted">
                  {m.boxes} text box{m.boxes === 1 ? '' : 'es'} · {m.slides} slide{m.slides === 1 ? '' : 's'}
                </span>
                <span className="spacer" />
                <span className="font-tag warn">{m.substitute ? `Drawn with ${m.substitute} here` : 'Missing'}</span>
              </div>
              <div className="font-actions">
                {isFree === true && (
                  <button className="primary" disabled={!!busy} onClick={() => void run(m.font, () => window.vessel.downloadFreeFont(m.font))}>
                    <DownloadIcon size={14} /> {busy === m.font ? 'Downloading…' : 'Download (free)'}
                  </button>
                )}
                <button disabled={!!busy} onClick={() => void run(m.font, () => window.vessel.addFontFiles(m.font))} title="Use a font file you have (.ttf or .otf); Vessel keeps a copy">
                  <DocumentIcon size={14} /> Choose font file…
                </button>
                <label className="font-instead">
                  Use instead
                  <select value={picked} onChange={(e) => setChoice((c) => ({ ...c, [m.font]: e.target.value }))}>
                    <option value="">Choose a font…</option>
                    {suggestion && (
                      <option value={suggestion}>
                        {suggestion} (closest{fontAvailable(suggestion) === false ? ', free download' : ''})
                      </option>
                    )}
                    {options
                      .filter((f) => f !== suggestion)
                      .map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                  </select>
                </label>
                {isFree === 'checking' && <span className="muted">Checking for a free copy…</span>}
              </div>
              {picked && (
                <div className="font-previews">
                  <Preview layout={previewLayout(deck, m.font)} label="Now" />
                  <Preview layout={previewLayout(deck, m.font, picked)} label={`With ${picked}`} />
                </div>
              )}
            </div>
          );
        })}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          {missing.length > 0 && (
            <span className="segmented small" role="group" aria-label="Where a replacement goes">
              <button className={scope === 'computer' ? 'active' : ''} onClick={() => setScope('computer')} title="The song stays as it is: a computer with the real font still uses it">
                Just on this computer
              </button>
              <button className={scope === 'song' ? 'active' : ''} onClick={() => setScope('song')} title="The song uses the new font from now on, on every computer">
                Change it in the song
              </button>
            </span>
          )}
          <span className="spacer" />
          {missing.length > 0 && <button onClick={onClose}>Later</button>}
          <button className="primary" disabled={busy === 'done'} onClick={() => void done()}>
            {busy === 'done' ? 'Working…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
