import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../shared/media';
import { LoopIcon, MusicIcon, PauseIcon, PlayIcon, StopIcon } from './Icons';
import { useSoundRouting, type SoundRouting } from './sound';

export interface AudioTrack {
  path: string;
  name: string;
  /** Changes each time the track is (re)started, so playing the same file again starts it over. */
  key: string;
}

const time = (s: number): string => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');

const VOLUME_STORE = 'vessel.audioVolume';

/**
 * Audio from the media bin, in the Live panel. It plays through this
 * computer's sound output and carries on while slides change.
 */
export function AudioPlayer({
  track,
  onStop,
  level = 1,
  routing = {}
}: {
  track: AudioTrack;
  onStop: () => void;
  /** Overall level for all of Vessel's sound (Preferences). */
  level?: number;
  routing?: SoundRouting;
}): React.JSX.Element {
  const audio = useRef<HTMLAudioElement>(null);
  useSoundRouting(audio, routing);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [loop, setLoop] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => {
    try {
      return Number(localStorage.getItem(VOLUME_STORE) ?? 1);
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    setProblem(null);
    setPosition(0);
    a.currentTime = 0;
    a.play().catch(() => setProblem('This file couldn’t be played.'));
  }, [track.key]);

  useEffect(() => {
    if (audio.current) audio.current.volume = Math.min(1, Math.max(0, volume * level));
    try {
      localStorage.setItem(VOLUME_STORE, String(volume));
    } catch {
      // Not remembered; it still applies now.
    }
  }, [volume, level]);

  const toggle = (): void => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  return (
    <div className={`audio-player ${playing ? 'playing' : ''}`}>
      <audio
        ref={audio}
        src={mediaUrl(track.path)}
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        onError={() => setProblem('This file couldn’t be played.')}
      />
      <div className="audio-title" title={track.path}>
        <MusicIcon size={14} /> {track.name}
      </div>
      {problem ? (
        <p className="error">{problem}</p>
      ) : (
        <div className="audio-seek">
          <span>{time(position)}</span>
          <input
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step={0.1}
            value={position}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value);
            }}
            aria-label="Position"
          />
          <span>{time(duration)}</span>
        </div>
      )}
      <div className="audio-controls">
        <button className="icon-button" onClick={toggle} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} disabled={!!problem}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className={`icon-button ${loop ? 'active-toggle' : ''}`}
          onClick={() => setLoop((v) => !v)}
          title={loop ? 'Looping: click to play once' : 'Loop: play it again and again'}
          aria-label="Loop"
          aria-pressed={loop}
        >
          <LoopIcon />
        </button>
        <input type="range" className="audio-volume" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} title="Volume" aria-label="Volume" />
        <button className="icon-button" onClick={onStop} title="Stop and close the player" aria-label="Stop">
          <StopIcon />
        </button>
      </div>
    </div>
  );
}
