import { describe, expect, it } from 'vitest';
import { shouldInstallSamples } from '../src/shared/samples';

describe('setting up the samples at start-up', () => {
  it('happens on a brand-new install', () => {
    expect(shouldInstallSamples({ freshInstall: true, songs: 0, playlists: 0 })).toBe(true);
  });
  it('happens when an earlier run left settings but never set them up, and nothing is here yet', () => {
    expect(shouldInstallSamples({ freshInstall: false, samplesInstalled: undefined, songs: 0, playlists: 0 })).toBe(true);
  });
  it('never touches a library with songs or playlists in it', () => {
    expect(shouldInstallSamples({ freshInstall: false, songs: 12, playlists: 0 })).toBe(false);
    expect(shouldInstallSamples({ freshInstall: false, songs: 0, playlists: 2 })).toBe(false);
  });
  it('never comes back once set up, even if the samples were deleted', () => {
    expect(shouldInstallSamples({ freshInstall: false, samplesInstalled: true, songs: 0, playlists: 0 })).toBe(false);
  });
});
