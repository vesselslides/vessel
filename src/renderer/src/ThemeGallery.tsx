import { useEffect, useMemo, useState } from 'react';
import { themeLayout, type Theme } from '../../shared/theme';
import { GALLERY_TAGS, isInLibrary, mergeGallery, STARTER_GALLERY, type GalleryEntry } from '../../shared/themeGallery';
import { SlideCanvas } from './SlideCanvas';

const SAMPLE = 'Amazing grace how sweet the sound\nThat saved a wretch like me';
const AUTHOR_STORE = 'vessel.vesselAuthor';

function rememberedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_STORE) ?? '';
  } catch {
    return '';
  }
}

/** A theme on its preview backdrop. */
export function GalleryPreview({ theme, backdrop }: { theme: Theme; backdrop: string }): React.JSX.Element {
  return (
    <div className="theme-preview gallery-preview" style={{ background: backdrop }}>
      <SlideCanvas layout={themeLayout(theme, SAMPLE)} />
    </div>
  );
}

/**
 * Themes made by churches for churches: the starter set, and (once Vessel's
 * public repository is set) the community's. Adding one copies it into your
 * themes, where it can be changed like any other.
 */
export function ThemeGallery({ mine, onAdd, onClose }: { mine: Theme[]; onAdd: (theme: Theme) => void; onClose: () => void }): React.JSX.Element {
  const [community, setCommunity] = useState<GalleryEntry[]>([]);
  const [online, setOnline] = useState<{ available: boolean; loading: boolean; error?: string }>({ available: false, loading: true });
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let live = true;
    void window.vessel.onlineGallery().then((r) => {
      if (!live) return;
      setCommunity(r.entries);
      setOnline({ available: r.available, loading: false, error: r.error });
    });
    return () => {
      live = false;
    };
  }, []);

  const entries = useMemo(() => mergeGallery(STARTER_GALLERY, community), [community]);
  const shown = entries.filter(
    (e) => (!tag || e.tags.includes(tag)) && (!q.trim() || `${e.theme.name} ${e.author} ${e.description}`.toLowerCase().includes(q.trim().toLowerCase()))
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal gallery-modal" role="dialog" aria-labelledby="gallery-title" onMouseDown={(e) => e.stopPropagation()}>
        {sharing ? (
          <ShareTheme mine={mine} available={online.available} onBack={() => setSharing(false)} />
        ) : (
          <>
            <h2 id="gallery-title">Theme gallery</h2>
            <p className="hint">
              Themes made by churches for churches. Add one and it’s yours to use and change.{' '}
              {online.loading
                ? 'Looking for community themes…'
                : online.error
                  ? online.error
                  : online.available
                    ? `${community.length} from the community.`
                    : 'Community themes appear here once Vessel’s public website is set up.'}
            </p>
            <div className="gallery-filters">
              <input placeholder="Search themes" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className={`chip ${tag === null ? 'on' : ''}`} onClick={() => setTag(null)}>
                All
              </button>
              {GALLERY_TAGS.map((t) => (
                <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="gallery-grid">
              {shown.map((e) => {
                const have = isInLibrary(e, mine);
                return (
                  <article key={e.theme.id} className="gallery-card">
                    <GalleryPreview theme={e.theme} backdrop={e.backdrop} />
                    <div className="gallery-card-text">
                      <strong>{e.theme.name}</strong>
                      <span className="muted">
                        {e.source === 'starter' ? 'Starter set' : `By ${e.author}`} · {e.theme.font}
                      </span>
                      {e.description && <span className="gallery-description">{e.description}</span>}
                    </div>
                    <button className={have ? '' : 'primary'} disabled={have} onClick={() => onAdd(e.theme)}>
                      {have ? 'In your themes ✓' : 'Add'}
                    </button>
                  </article>
                );
              })}
              {!shown.length && <p className="hint">No themes match.</p>}
            </div>
            <p className="hint">If a theme’s font isn’t on this computer, a similar one is used; pick another in Themes.</p>
            <div className="modal-actions">
              <button onClick={() => setSharing(true)} disabled={!mine.length} title={mine.length ? undefined : 'Make a theme first'}>
                Share one of yours…
              </button>
              <span className="spacer" />
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Propose one of your themes for the gallery (opens a prefilled page), or share it as a Vessel file. */
function ShareTheme({ mine, available, onBack }: { mine: Theme[]; available: boolean; onBack: () => void }): React.JSX.Element {
  const [id, setId] = useState(mine[0]?.id ?? '');
  const [author, setAuthor] = useState(rememberedAuthor);
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const theme = mine.find((t) => t.id === id) ?? mine[0];
  return (
    <>
      <h2 id="gallery-title">Share a theme with the gallery</h2>
      <p className="hint">
        Submitting opens a page on GitHub with your theme filled in (a free GitHub account is needed). Once it’s looked at, it appears in every Vessel’s
        gallery. Only the theme is sent: its font, colours and layout, no songs or pictures.
      </p>
      <label className="pref-field">
        Theme
        <select value={theme?.id} onChange={(e) => setId(e.target.value)}>
          {mine.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {theme && <GalleryPreview theme={theme} backdrop="linear-gradient(135deg, #1d3557, #457b9d 60%, #a8dadc)" />}
      <label className="pref-field">
        Made by
        <input value={author} placeholder="Your church’s name" onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <label className="pref-field">
        What it’s for
        <input value={description} placeholder="e.g. Lyrics over dark motion backgrounds" onChange={(e) => setDescription(e.target.value)} />
      </label>
      {!available && <p className="hint">Submitting opens once Vessel’s public website is set up. Until then, share themes as a Vessel file (File ▸ Share as Vessel File).</p>}
      {sent && <p className="hint">The page opened in your browser: check it and choose Submit new issue there.</p>}
      <div className="modal-actions">
        <button className="import-back" onClick={onBack}>
          ← Back
        </button>
        <span className="grow" />
        <button
          className="primary"
          disabled={!available || !theme}
          onClick={() => {
            try {
              localStorage.setItem(AUTHOR_STORE, author);
            } catch {
              // Not remembered; fine.
            }
            void window.vessel.submitToGallery({ theme, author, description }).then(setSent);
          }}
        >
          Submit…
        </button>
      </div>
    </>
  );
}
