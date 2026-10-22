import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_LIVE, type LiveState } from '../../shared/types';
import { AudienceView } from './AudienceView';
import './styles.css';

function Output(): React.JSX.Element {
  const [live, setLive] = useState<LiveState>(INITIAL_LIVE);
  useEffect(() => window.vessel.onLive(setLive), []);
  return (
    <div className="output-stage">
      <AudienceView live={live} muted={false} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Output />);
