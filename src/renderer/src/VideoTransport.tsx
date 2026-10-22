import { useEffect, useState } from 'react';
import { mediaUrl } from '../../shared/media';
import { formatDuration } from '../../shared/timer';
import type { Background } from '../../shared/types';
import { clockPosition, hasEnded, pauseClock, playClock, positionIn, seekClock, type VideoClock } from '../../shared/videoClock';
import { PauseIcon, PlayIcon, RestartIcon } from './Icons';
import { useNow } from './StageView';

/** A video's length in seconds, read from the file; NaN until known. */
function useDuration(path: string): number {
  const [duration, setDuration] = useState(NaN);
  useEffect(() => {
    setDuration(NaN);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.onloadedmetadata = () => setDuration(probe.duration);
    probe.src = mediaUrl(path);
    return () => {
      probe.onloadedmetadata = null;
      probe.removeAttribute('src');
      probe.load();
    };
  }, [path]);
  return duration;
}

/** Play, pause, restart and scrub the live background video, with the time gone and left. */
export function VideoTransport({ video, clock, onClock }: { video: Background; clock: VideoClock; onClock: (c: VideoClock) => void }): React.JSX.Element {
  const now = useNow(250);
  const duration = useDuration(video.path);
  const known = Number.isFinite(duration) && duration > 0;
  const at = positionIn(clock, now, duration, video.loop);
  const ended = hasEnded(clock, now, duration, video.loop);
  const playing = clock.playing && !ended;
  // While dragging, the slider shows where it's being dragged to.
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? at;
  const seek = (seconds: number): void => onClock(seekClock(clock, seconds, Date.now(), duration));

  return (
    <div className="video-transport">
      <button
        className="icon-button"
        aria-label="Start the video again"
        title="Start the video again"
        disabled={clockPosition(clock, now) < 0.5 && playing}
        onClick={() => onClock({ ...clock, playing: true, position: 0, at: Date.now() })}
      >
        <RestartIcon size={14} />
      </button>
      <button
        className={`icon-button ${playing ? '' : 'active-toggle'}`}
        aria-label={playing ? 'Pause the video' : 'Play the video'}
        title={playing ? 'Pause the video (the picture holds on screen)' : ended ? 'Play again from the start' : 'Play the video'}
        onClick={() => onClock(playing ? pauseClock(clock, Date.now(), duration, video.loop) : playClock(clock, Date.now(), duration, video.loop))}
      >
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </button>
      <span className="video-time">{formatDuration(shown * 1000)}</span>
      <input
        type="range"
        min={0}
        max={known ? duration : 1}
        step={0.1}
        value={known ? Math.min(shown, duration) : 0}
        disabled={!known}
        aria-label="Position in the video"
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={(e) => {
          seek(Number((e.target as HTMLInputElement).value));
          setDragging(null);
        }}
        onKeyUp={(e) => {
          seek(Number((e.target as HTMLInputElement).value));
          setDragging(null);
        }}
      />
      <span className="video-time" title={video.loop ? 'Loops when it reaches the end' : 'Plays once'}>
        {known ? `-${formatDuration(Math.max(0, duration - shown) * 1000, true)}` : '–:––'}
      </span>
    </div>
  );
}
