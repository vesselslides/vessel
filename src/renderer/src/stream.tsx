import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_STREAM_LOOK, type StreamLook } from '../../shared/stream';
import { INITIAL_LIVE, type LiveState } from '../../shared/types';
import { StreamView } from './StreamView';
import './styles.css';

function Stream(): React.JSX.Element {
  const [live, setLive] = useState<LiveState>(INITIAL_LIVE);
  const [look, setLook] = useState<StreamLook>(DEFAULT_STREAM_LOOK);
  useEffect(() => window.vessel.onLive(setLive), []);
  useEffect(() => window.vessel.onStreamLook(setLook), []);
  return (
    <div className="output-stage">
      <StreamView live={live} look={look} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Stream />);
