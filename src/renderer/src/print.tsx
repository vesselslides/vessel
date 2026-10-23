// The hidden print page: draws slides and lyrics sheets for File ▸ Export.
// The main process hands it a job with window.__vesselPrint(job) and waits for
// the promise (pictures loaded, fonts ready, text fitted) before printing to
// PDF; for pictures it shows one slide at a time with window.__vesselShow().
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { orderIsWorthShowing, orderLine, type ExportJob, type ExportSong } from '../../shared/exports';
import { mediaUrl } from '../../shared/media';
import type { Background, SlideView } from '../../shared/types';
import { SlideCanvas } from './SlideCanvas';
import './styles.css';

declare global {
  interface Window {
    __vesselPrint: (job: ExportJob) => Promise<void>;
    __vesselShow: (song: number, slide: number) => Promise<void>;
  }
}

/** Loads still waiting to finish before the page is ready. */
const pending = new Set<Promise<void>>();
const track = (p: Promise<void>): void => {
  // Never wait on one picture for ever.
  const settled = Promise.race([p, new Promise<void>((r) => setTimeout(r, 15_000))]);
  pending.add(settled);
  void settled.finally(() => pending.delete(settled));
};

async function settled(): Promise<void> {
  const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
  await frame();
  await document.fonts.ready;
  while (pending.size) await Promise.all([...pending]);
  // Text boxes shrink to fit after layout; give them a few frames.
  for (let i = 0; i < 4; i++) await frame();
}

/** The page's two calls, available as soon as the script loads; they wait for React's first render. */
interface PrintApi {
  print: (job: ExportJob) => Promise<void>;
  show: (song: number, slide: number) => Promise<void>;
}
let mounted!: (api: PrintApi) => void;
const api = new Promise<PrintApi>((resolve) => (mounted = resolve));
window.__vesselPrint = async (job) => (await api).print(job);
window.__vesselShow = async (song, slide) => (await api).show(song, slide);

const FIT: Record<Background['scale'], 'contain' | 'cover' | 'fill'> = { fit: 'contain', fill: 'cover', stretch: 'fill' };

/** A background as a still: a picture, or one frame of a video drawn on a canvas (videos don't print). */
function Still({ bg }: { bg: Background }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img] = useState(() => {
    if (bg.kind !== 'image') return null;
    const i = new Image();
    i.src = mediaUrl(bg.path);
    track(i.decode().catch(() => undefined));
    return i.src;
  });
  useEffect(() => {
    if (bg.kind !== 'video') return;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = mediaUrl(bg.path);
    track(
      new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, (video.duration || 2) / 4);
        };
        video.onseeked = () => {
          const c = canvas.current;
          if (c) {
            c.width = video.videoWidth;
            c.height = video.videoHeight;
            c.getContext('2d')?.drawImage(video, 0, 0);
          }
          resolve();
        };
        video.onerror = () => resolve();
      })
    );
    return () => video.removeAttribute('src');
  }, [bg.kind, bg.path]);
  const style = { objectFit: FIT[bg.scale] };
  return img ? <img className="media" src={img} style={style} alt="" /> : <canvas ref={canvas} className="media" style={style} />;
}

function Slide({ slide, job }: { slide: SlideView; job: ExportJob }): React.JSX.Element {
  return (
    <div className="print-slide" style={{ aspectRatio: `${job.width} / ${job.height}` }}>
      {job.options.backgrounds && slide.background && <Still bg={slide.background} />}
      <SlideCanvas layout={slide.layout} />
    </div>
  );
}

/** Slides PDF: a heading per song, then pages of slides in a grid. */
function SlidesDocument({ job }: { job: ExportJob }): React.JSX.Element {
  const per = job.options.perPage;
  const songs = job.entries.length;
  return (
    <div className={`print-slides per-${per}`}>
      {job.entries.map((e, ei) =>
        e.kind === 'header' ? (
          per > 1 && <h2 key={ei} className="print-header">{e.name}</h2>
        ) : (
          <section key={ei} className="print-song">
            {per > 1 && <h1>{e.name}</h1>}
            <div className="print-grid">
              {e.slides.map((s, i) => (
                <figure key={s.id}>
                  <Slide slide={s} job={job} />
                  {job.options.captions && (
                    <figcaption>
                      <span className="print-swatch" style={{ background: s.groupColor }} />
                      {i + 1}. {s.groupName || s.label}
                      {per === 1 && songs > 1 ? `  ·  ${e.name}` : ''}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function Lyrics({ song, job }: { song: ExportSong; job: ExportJob }): React.JSX.Element {
  return (
    <section className={`print-lyrics-song ${job.options.songPerPage ? 'new-page' : ''}`}>
      <h1>{song.name}</h1>
      {job.options.order && orderIsWorthShowing(song) && <p className="print-order">{orderLine(song.order)}</p>}
      <div className={`print-sections columns-${job.options.columns}`}>
        {song.sections.map((s, i) => (
          <div key={i} className="print-section">
            <h3>
              <span className="print-swatch" style={{ background: s.color }} />
              {s.name}
            </h3>
            {s.slides.map((t, j) => (
              <p key={j}>{t}</p>
            ))}
          </div>
        ))}
      </div>
      {job.options.copyright && song.copyright && <p className="print-copyright">{song.copyright}</p>}
    </section>
  );
}

/** Lyrics sheet: words by group, for the band or an order of service. */
function LyricsDocument({ job }: { job: ExportJob }): React.JSX.Element {
  const songs = job.entries.filter((e) => e.kind === 'song').length;
  return (
    <div className="print-lyrics">
      {(songs > 1 || job.entries.some((e) => e.kind === 'header')) && <h1 className="print-title">{job.title}</h1>}
      {job.entries.map((e, i) => (e.kind === 'header' ? <h2 key={i} className="print-header">{e.name}</h2> : <Lyrics key={i} song={e} job={job} />))}
    </div>
  );
}

function Print(): React.JSX.Element | null {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [shown, setShown] = useState<SlideView | null>(null);
  const done = useRef<(() => void) | null>(null);
  const jobRef = useRef<ExportJob | null>(null);

  useEffect(
    () =>
      mounted({
        print: (next) =>
          new Promise<void>((resolve) => {
            done.current = resolve;
            jobRef.current = next;
            setJob(next);
          }),
        show: (song, slide) =>
          new Promise<void>((resolve) => {
            const songs = jobRef.current?.entries.filter((e): e is ExportSong => e.kind === 'song') ?? [];
            done.current = resolve;
            setShown(songs[song]?.slides[slide] ?? null);
          })
      }),
    []
  );

  // After each render: wait for pictures and fitting, then tell the main process.
  useEffect(() => {
    if (!done.current) return;
    const resolve = done.current;
    done.current = null;
    void settled().then(resolve);
  }, [job, shown]);

  if (!job) return null;
  if (job.format === 'images') return shown ? <div className="print-one">
        <Slide slide={shown} job={job} />
      </div> : null;
  return (
    <>
      <style>{`@page { size: ${job.options.paper === 'letter' ? 'letter' : 'A4'} ${job.format === 'pdf-slides' && job.options.perPage === 1 ? 'landscape' : 'portrait'}; margin: 14mm; }`}</style>
      <div className="print-pdf">{job.format === 'pdf-slides' ? <SlidesDocument job={job} /> : <LyricsDocument job={job} />}</div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Print />);
