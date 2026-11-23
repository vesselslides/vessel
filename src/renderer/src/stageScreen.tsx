import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_STAGE, type StageState } from '../../shared/types';
import { StageView } from './StageView';
import './styles.css';
import { startVesselFonts } from './fonts';

// Vessel's own fonts and stand-ins for missing ones, in this window too.
startVesselFonts();

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
