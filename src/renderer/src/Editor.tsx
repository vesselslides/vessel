import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { songInfoOf, withSongInfo } from '../../shared/ccli';
import { SongInfoDialog } from './SongInfoDialog';
import type { Presentation } from '../../shared/gen/presentation_pb';
import {
  addArrangement,
  addGroup,
  addSlide,
  addSlideImage,
  applyLyrics,
  copyElementToAllSlides,
  deleteArrangement,
  deleteGroup,
  moveGroup,
  moveSlide,
  placeSlideElement,
  planLyrics,
  presentationToLyrics,
  removeSlideElement,
  renameArrangement,
  renameGroup,
  renamePresentation,
  selectArrangement,
  setArrangementGroups,
  setGroupColor,
  setSlideBackground,
  setSlideText,
  splitSlide
} from '../../shared/pro/edit';
import { backgroundForPath } from '../../shared/pro/background';
import { IMAGE_PLACEMENTS, placementOf, type ImagePlacement } from '../../shared/pro/graphics';
import { layoutWithText } from '../../shared/pro/presentation';
import { tidyLyrics } from '../../shared/import/lyrics';
import { mediaName } from '../../shared/media';
import type { Deck, GroupView, MediaItem, SlideView } from '../../shared/types';
import { MediaView } from './AudienceView';
import { MEDIA_MIME } from './MediaBin';
import { SlideCanvas } from './SlideCanvas';
import { dropSide, openGroupMenu, openSlideMenu, SLIDE_DRAG, type DropSide } from './slideMenus';

export type Apply = (change: (p: Presentation) => Presentation) => void;

const CHIP_MIME = 'application/x-vessel-chip';

/** A text input that only commits on blur or Enter, so typing isn't one undo step per key. */
function CommitInput({ value, onCommit, className, placeholder }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string }): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}

interface CardProps {
  deck: Deck;
  slide: SlideView;
  index: number;
  group: GroupView;
  apply: Apply;
  media: MediaItem[];
  focus: boolean;
  onFocused: () => void;
}

function SlideCard({ deck, slide, index, group, apply, media, focus, onFocused }: CardProps): React.JSX.Element {
  const [text, setText] = useState(slide.text);
  const [dropHint, setDropHint] = useState<DropSide | 'media' | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => setText(slide.text), [slide.text]);

  // "Edit text…" from Show lands here: scroll into view and put the cursor at the end.
  useEffect(() => {
    if (!focus) return;
    card.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    area.current?.focus();
    area.current?.setSelectionRange(text.length, text.length);
    onFocused();
  }, [focus]); // only when this card becomes the focus target

  const commit = (): void => {
    if (text !== slide.text) apply((p) => setSlideText(p, slide.cueId, text));
  };
  const setBackground = (path: string | null): void => {
    const bg = path ? backgroundForPath(path) : null;
    if (path && !bg) return;
    apply((p) => setSlideBackground(p, slide.cueId, bg));
  };
  const split = (): void => {
    const cursor = area.current?.selectionStart ?? 0;
    if (cursor <= 0 || cursor >= text.length) return;
    apply((p) => splitSlide(p, group.id, slide.cueId, text.slice(0, cursor), text.slice(cursor)));
  };
  const menu = (): void =>
    void openSlideMenu({ deck, slide, media, apply, split: { text, cursor: area.current?.selectionStart ?? 0 } });

  // A background from a .pro file may not be in the media bin; still list it.
  const bgPath = slide.background?.path;
  const visual = media.filter((m) => m.kind !== 'audio');
  const options = bgPath && !visual.some((m) => m.path === bgPath) ? [...visual, { id: 'current', path: bgPath, name: mediaName(bgPath), kind: slide.background!.kind }] : visual;

  const accepts = (e: DragEvent): DropSide | 'media' | null =>
    e.dataTransfer.types.includes(SLIDE_DRAG) ? dropSide(e) : e.dataTransfer.types.includes(MEDIA_MIME) ? 'media' : null;

  return (
    <div
      ref={card}
      className={`edit-card ${dropHint ? `drop-${dropHint}` : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        menu();
      }}
      onDragOver={(e) => {
        const kind = accepts(e);
        if (!kind) return;
        e.preventDefault();
        setDropHint(kind);
      }}
      onDragLeave={() => setDropHint(null)}
      onDrop={(e) => {
        setDropHint(null);
        const path = e.dataTransfer.getData(MEDIA_MIME);
        if (path) {
          e.preventDefault();
          return setBackground(path);
        }
        const raw = e.dataTransfer.getData(SLIDE_DRAG);
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        const drag = JSON.parse(raw) as { groupId: string; cueId: string };
        // The left half of a slide puts it before this one, the right half after.
        if (drag.cueId !== slide.cueId) apply((p) => moveSlide(p, drag.groupId, drag.cueId, group.id, dropSide(e) === 'after' ? index + 1 : index));
      }}
    >
      {/* Drag the picture to move the slide; the text box stays free for selecting text. */}
      <div
        className={`slide-canvas edit-preview ${slide.enabled ? '' : 'disabled'}`}
        draggable
        title="Drag to move this slide"
        onDragStart={(e) => {
          e.dataTransfer.setData(SLIDE_DRAG, JSON.stringify({ groupId: group.id, cueId: slide.cueId }));
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        {slide.background && <MediaView bg={slide.background} muted thumbnail />}
        <SlideCanvas layout={layoutWithText(slide.layout, text)} />
        <span className="edit-number" style={{ background: group.color }}>
          {index + 1}
        </span>
        {!slide.enabled && (
          <span className="off-badge" title="Turned off: Next and Previous skip it. Right-click to turn it back on.">
            Off
          </span>
        )}
      </div>
      <textarea
        ref={area}
        value={text}
        placeholder="Slide text"
        rows={Math.max(3, text.split('\n').length + 1)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.altKey) {
            e.preventDefault();
            split();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
        }}
      />
      {slide.layout.graphics.length > 0 && (
        <div className="graphic-chips">
          {slide.layout.graphics.map((g) => {
            const placement = placementOf(g, slide.layout.width, slide.layout.height);
            return (
              <div key={g.id} className="graphic-chip">
                <span className="graphic-name" title={g.kind === 'image' ? g.path : 'Shape'}>
                  {g.kind === 'image' ? `▣ ${mediaName(g.path)}` : '■ Shape'}
                </span>
                <select
                  title="Where it sits on the slide"
                  value={placement ?? ''}
                  onChange={(e) => e.target.value && apply((p) => placeSlideElement(p, slide.cueId, g.id, e.target.value as ImagePlacement))}
                >
                  {!placement && <option value="">As designed</option>}
                  {IMAGE_PLACEMENTS.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.label}
                    </option>
                  ))}
                </select>
                <button title="Put it on every slide (e.g. a logo)" onClick={() => apply((p) => copyElementToAllSlides(p, slide.cueId, g.id))}>
                  All slides
                </button>
                <button title="Remove from this slide" onClick={() => apply((p) => removeSlideElement(p, slide.cueId, g.id))}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="edit-card-bar">
        <select className="bg-select" title="Slide background" value={bgPath ?? ''} onChange={(e) => setBackground(e.target.value || null)}>
          <option value="">No background</option>
          {options.map((m) => (
            <option key={m.id} value={m.path}>
              {m.kind === 'video' ? '▶ ' : ''}
              {m.name}
            </option>
          ))}
        </select>
        <select
          className="bg-select"
          title="Put a picture (e.g. a logo) on this slide"
          value=""
          onChange={(e) => e.target.value && apply((p) => addSlideImage(p, [slide.cueId], e.target.value, 'top-right'))}
        >
          <option value="">+ Picture</option>
          {media
            .filter((m) => m.kind === 'image')
            .map((m) => (
              <option key={m.id} value={m.path}>
                {m.name}
              </option>
            ))}
        </select>
        <span className="spacer" />
        <button title="Insert a slide after this one" onClick={() => apply((p) => addSlide(p, group.id, '', slide.cueId).presentation)}>
          +
        </button>
        <button title="More: split, duplicate, move, delete…" onClick={menu}>
          ⋯
        </button>
      </div>
    </div>
  );
}

function ArrangementBar({ deck, apply }: { deck: Deck; apply: Apply }): React.JSX.Element {
  const selected = deck.arrangements.find((a) => a.id === deck.selectedArrangementId);
  const groupsById = new Map(deck.groups.map((g) => [g.id, g]));

  const dropChip = (e: DragEvent, toIndex: number): void => {
    if (!selected) return;
    const from = Number(e.dataTransfer.getData(CHIP_MIME));
    if (Number.isNaN(from)) return;
    e.preventDefault();
    const ids = [...selected.groupIds];
    const [moved] = ids.splice(from, 1);
    ids.splice(from < toIndex ? toIndex - 1 : toIndex, 0, moved);
    apply((p) => setArrangementGroups(p, selected.id, ids));
  };

  return (
    <div className="arrangement-bar">
      <div className="arrangement-row">
        <span className="field-label">Arrangement</span>
        <select value={deck.selectedArrangementId ?? ''} onChange={(e) => apply((p) => selectArrangement(p, e.target.value || undefined))}>
          <option value="">All groups, in order</option>
          {deck.arrangements.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || 'Untitled arrangement'}
            </option>
          ))}
        </select>
        {selected && <CommitInput className="arrangement-name" value={selected.name} onCommit={(name) => apply((p) => renameArrangement(p, selected.id, name))} />}
        <button onClick={() => apply((p) => addArrangement(p, `Arrangement ${deck.arrangements.length + 1}`).presentation)}>New</button>
        {selected && (
          <button
            onClick={() => {
              if (confirm(`Delete the arrangement "${selected.name}"? Groups and slides are kept.`)) apply((p) => deleteArrangement(p, selected.id));
            }}
          >
            Delete
          </button>
        )}
      </div>
      {selected && (
        <div className="chips" onDragOver={(e) => e.dataTransfer.types.includes(CHIP_MIME) && e.preventDefault()} onDrop={(e) => dropChip(e, selected.groupIds.length)}>
          {selected.groupIds.map((gid, i) => {
            const g = groupsById.get(gid);
            return (
              <span
                key={`${gid}-${i}`}
                className="chip"
                style={{ background: g?.color }}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(CHIP_MIME, String(i))}
                onDragOver={(e) => e.dataTransfer.types.includes(CHIP_MIME) && e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  dropChip(e, i);
                }}
              >
                {g?.name || 'Group'}
                <button
                  title="Remove from arrangement"
                  onClick={() => apply((p) => setArrangementGroups(p, selected.id, selected.groupIds.filter((_, j) => j !== i)))}
                >
                  ×
                </button>
              </span>
            );
          })}
          <select
            className="chip-add"
            value=""
            onChange={(e) => e.target.value && apply((p) => setArrangementGroups(p, selected.id, [...selected.groupIds, e.target.value]))}
          >
            <option value="">+ Add group</option>
            {deck.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name || 'Untitled group'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

const LINES_PER_SLIDE = [
  { value: 0, label: 'Slides as typed' },
  { value: 2, label: 'Up to 2 lines a slide' },
  { value: 3, label: 'Up to 3 lines a slide' },
  { value: 4, label: 'Up to 4 lines a slide' },
  { value: 6, label: 'Up to 6 lines a slide' }
];

/**
 * The whole song as one text box: "[Group]" headers, blank lines between
 * slides, a bare "[Chorus]" to sing it again. Beside it, the slides it makes.
 */
function LyricsEditor({ presentation, deck, apply, onClose }: { presentation: Presentation; deck: Deck; apply: Apply; onClose: () => void }): React.JSX.Element {
  const original = useMemo(() => presentationToLyrics(presentation), [presentation]);
  const [text, setText] = useState(original);
  const [linesPerSlide, setLinesPerSlide] = useState(0);
  const [note, setNote] = useState('');
  const plan = useMemo(() => planLyrics(text, linesPerSlide), [text, linesPerSlide]);
  const colorOf = useMemo(() => new Map(deck.groups.map((g) => [g.name.trim().toLowerCase(), g.color])), [deck.groups]);
  const slides = plan.groups.reduce((n, g) => n + g.slides.length, 0);
  const longest = Math.max(0, ...plan.groups.flatMap((g) => g.slides.map((s) => s.split('\n').length)));
  const changed = text !== original || linesPerSlide > 0;

  const tidy = (): void => {
    const result = tidyLyrics(text);
    setText(result.text);
    const bits = [
      result.removedChordLines ? `${result.removedChordLines} chord line${result.removedChordLines === 1 ? '' : 's'} taken out` : '',
      result.ccli.songNumber || result.ccli.publisher ? 'copyright lines taken out (add them under Song info)' : ''
    ].filter(Boolean);
    setNote(bits.length ? `Tidied: ${bits.join(', ')}.` : 'Tidied: labels written as [Verse 1], [Chorus] and so on.');
  };

  return (
    <div className="lyrics-editor">
      <p className="hint">
        Blank lines separate slides; a line like <code>[Chorus]</code> starts a group, and <code>[Chorus]</code> on its own again sings it again. Groups with the
        same name keep their colour, styling, backgrounds and pictures. Undo with ⌘Z / Ctrl+Z.
      </p>
      <div className="lyrics-tools">
        <button onClick={tidy} title="Take out chords and copyright lines, and turn labels like “Verse 1:” or “CHORUS” into groups">
          Tidy pasted lyrics
        </button>
        <select value={linesPerSlide} onChange={(e) => setLinesPerSlide(Number(e.target.value))} title="Split long slides into shorter ones">
          {LINES_PER_SLIDE.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {note && <span className="muted">{note}</span>}
      </div>
      <div className="lyrics-columns">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} spellCheck aria-label="Song lyrics" />
        <div className="lyrics-preview" aria-label="Slides this makes">
          <div className="lyrics-summary">
            {plan.groups.length} group{plan.groups.length === 1 ? '' : 's'}, {slides} slide{slides === 1 ? '' : 's'}
            {longest > 6 && <span className="lyrics-warn"> · a slide has {longest} lines; try splitting</span>}
          </div>
          {plan.repeats && (
            <div className="lyrics-order" title="Saved as the “Song order” arrangement">
              Sung order: {plan.order.map((i) => plan.groups[i].name || 'Untitled').join(' → ')}
            </div>
          )}
          {plan.groups.map((g, gi) => (
            <div key={gi} className="lyrics-group">
              <div className="lyrics-group-name" style={{ borderColor: colorOf.get(g.name.trim().toLowerCase()) ?? 'var(--border-strong)' }}>
                {g.name || 'Untitled'}
                {!colorOf.has(g.name.trim().toLowerCase()) && g.name && <span className="token-badge">new</span>}
              </div>
              {g.slides.map((slide, si) => (
                <div key={si} className="lyrics-slide">
                  {slide}
                </div>
              ))}
              {!g.slides.length && <div className="lyrics-slide empty">No slides</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={!changed}
          onClick={() => {
            apply((p) => applyLyrics(p, text, linesPerSlide));
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export function Editor({
  deck,
  presentation,
  apply,
  media,
  focusCue,
  onFocused,
  history,
  ccliLicence
}: {
  deck: Deck;
  presentation: Presentation;
  apply: Apply;
  media: MediaItem[];
  focusCue: string | null;
  onFocused: () => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  /** The church's CCLI licence number, for the copyright line preview. */
  ccliLicence: string;
}): React.JSX.Element {
  const [newGroupName, setNewGroupName] = useState('');
  const [lyricsMode, setLyricsMode] = useState(false);

  const dropAtEnd = (e: DragEvent, toGroupId: string, toIndex: number): void => {
    const raw = e.dataTransfer.getData(SLIDE_DRAG);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    const { groupId, cueId } = JSON.parse(raw) as { groupId: string; cueId: string };
    apply((p) => moveSlide(p, groupId, cueId, toGroupId, toIndex));
  };

  const [showSongInfo, setShowSongInfo] = useState(false);

  return (
    <div className="editor">
      <div className="editor-head">
        <CommitInput className="title-input" value={deck.name} placeholder="Presentation name" onCommit={(name) => apply((p) => renamePresentation(p, name))} />
        <span className="spacer" />
        <button title="Undo (⌘Z / Ctrl+Z)" onClick={history.undo} disabled={!history.canUndo}>
          Undo
        </button>
        <button title="Redo (⇧⌘Z / Ctrl+Y)" onClick={history.redo} disabled={!history.canRedo}>
          Redo
        </button>
        <button onClick={() => setShowSongInfo(true)} title="Title, writers, copyright and CCLI song number">
          Song info (CCLI)…
        </button>
        <button className={lyricsMode ? 'active-toggle' : ''} onClick={() => setLyricsMode((v) => !v)}>
          {lyricsMode ? 'Back to slides' : 'Edit lyrics as text'}
        </button>
      </div>

      {showSongInfo && (
        <SongInfoDialog
          info={songInfoOf(presentation)}
          licence={ccliLicence}
          onCancel={() => setShowSongInfo(false)}
          onSave={(info) => {
            setShowSongInfo(false);
            apply((p) => withSongInfo(p, info));
          }}
        />
      )}
      {lyricsMode ? (
        <LyricsEditor presentation={presentation} deck={deck} apply={apply} onClose={() => setLyricsMode(false)} />
      ) : (
        <>
          <ArrangementBar deck={deck} apply={apply} />

          {deck.groups.map((group, gi) => (
            <section key={group.id} className="edit-group">
              <div
                className="edit-group-header"
                style={{ borderColor: group.color }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void openGroupMenu(deck, group.id, apply);
                }}
              >
                <input type="color" value={group.colorHex} title="Group colour" onChange={(e) => apply((p) => setGroupColor(p, group.id, e.target.value))} />
                <CommitInput className="group-name" value={group.name} placeholder="Group name" onCommit={(name) => apply((p) => renameGroup(p, group.id, name))} />
                {group.hotkey && (
                  <kbd className="hotkey" title={`In Show, press ${group.hotkey} to jump here`}>
                    {group.hotkey}
                  </kbd>
                )}
                <span className="spacer" />
                <button title="Move group up" disabled={gi === 0} onClick={() => apply((p) => moveGroup(p, group.id, gi - 1))}>
                  ↑
                </button>
                <button title="Move group down" disabled={gi === deck.groups.length - 1} onClick={() => apply((p) => moveGroup(p, group.id, gi + 1))}>
                  ↓
                </button>
                <button
                  title="Delete group"
                  onClick={() => {
                    if (confirm(`Delete "${group.name || 'this group'}" and its ${group.slides.length} slide(s)?`)) apply((p) => deleteGroup(p, group.id));
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="slide-grid edit-grid">
                {group.slides.map((slide, i) => (
                  <SlideCard
                    key={slide.cueId}
                    deck={deck}
                    slide={slide}
                    index={i}
                    group={group}
                    apply={apply}
                    media={media}
                    focus={focusCue === slide.cueId}
                    onFocused={onFocused}
                  />
                ))}
                <button
                  className="add-slide"
                  onClick={() => apply((p) => addSlide(p, group.id).presentation)}
                  onDragOver={(e) => e.dataTransfer.types.includes(SLIDE_DRAG) && e.preventDefault()}
                  onDrop={(e) => dropAtEnd(e, group.id, group.slides.length)}
                >
                  + Add slide
                </button>
              </div>
            </section>
          ))}

          <form
            className="add-group"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newGroupName.trim();
              if (!name) return;
              apply((p) => addGroup(p, name).presentation);
              setNewGroupName('');
            }}
          >
            <input value={newGroupName} placeholder="New group name, e.g. Bridge" onChange={(e) => setNewGroupName(e.target.value)} />
            <button type="submit" disabled={!newGroupName.trim()}>
              + Add group
            </button>
          </form>
        </>
      )}
    </div>
  );
}
