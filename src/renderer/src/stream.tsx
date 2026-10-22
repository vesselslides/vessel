import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_STREAM_LOOK, type StreamLook } from '../../shared/stream';
import { INITIAL_LIVE, type LiveState } from '../../shared/types';
import { StreamView } from './StreamView';
import './styles.css';

// The NDI window opens see-through (#see-through), so its first frames are too.
const seeThrough = location.hash === '#see-through';
if (seeThrough) document.documentElement.classList.add('see-through');

function Stream(): React.JSX.Element {
  const [live, setLive] = useState<LiveState>(INITIAL_LIVE);
  const [look, setLook] = useState<StreamLook>(seeThrough ? { ...DEFAULT_STREAM_LOOK, background: 'none' } : DEFAULT_STREAM_LOOK);
  useEffect(() => window.vessel.onLive(setLive), []);
  useEffect(() => window.vessel.onStreamLook(setLook), []);
  // NDI sends a see-through picture: nothing behind the words at all.
  useEffect(() => {
    document.documentElement.classList.toggle('see-through', look.background === 'none');
  }, [look.background]);
  return (
    <div className="output-stage">
      <StreamView live={live} look={look} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Stream />);
