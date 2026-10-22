import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_STAGE, type StageState } from '../../shared/types';
import { StageView } from './StageView';
import './styles.css';

function StageScreen(): React.JSX.Element {
  const [state, setState] = useState<StageState>(INITIAL_STAGE);
  useEffect(() => window.vessel.onStage(setState), []);
  return (
    <div className="stage-screen">
      <StageView state={state} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StageScreen />);
