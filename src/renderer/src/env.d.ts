/// <reference types="vite/client" />
import type { VesselApi } from '../../shared/types';

declare global {
  interface Window {
    vessel: VesselApi;
  }
}
