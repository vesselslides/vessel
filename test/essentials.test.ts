import { afterEach, describe, expect, it } from 'vitest';
import { showsCopyright } from '../src/shared/ccli';
import { cleanGroup, DEFAULT_GROUPS, groupDefinitionFor, setGroupDefinitions } from '../src/shared/groups';
import { groupKey } from '../src/shared/hotkeys';
import { backgroundForPath, setBackgroundDefaults } from '../src/shared/pro/background';
import { colorToHex, createPresentation, parseLyrics, presentationToDeck } from '../src/shared/pro/presentation';

afterEach(() => {
  setGroupDefinitions(undefined);
  setBackgroundDefaults({});
});

describe('groups', () => {
  it('matches names the way songs write them: exact names first, numbers only their own', () => {
    expect(groupDefinitionFor('Verse 2')?.name).toBe('Verse 2');
    expect(groupDefinitionFor('verse2')?.name).toBe('Verse 2');
    expect(groupDefinitionFor('Verse 10')?.name).toBe('Verse');
    expect(groupDefinitionFor('Verse 7')?.name).toBe('Verse');
    expect(groupDefinitionFor('PRE CHORUS')?.name).toBe('Pre-Chorus');
    expect(groupDefinitionFor('Pre-Chorus 2')?.name).toBe('Pre-Chorus 2');
    expect(groupDefinitionFor('Chorus')?.name).toBe('Chorus');
    expect(groupDefinitionFor('Bridge 4')?.name).toBe('Bridge 4');
    expect(groupDefinitionFor('Spoken word')).toBeUndefined();
  });

  it('has numbered verses, choruses and bridges like ProPresenter, shaded within a family', () => {
    const names = DEFAULT_GROUPS.map((g) => g.name);
    for (const n of ['Verse 1', 'Verse 6', 'Pre-Chorus 3', 'Chorus 4', 'Bridge 1', 'Bridge 4', 'Tag', 'Vamp']) expect(names).toContain(n);
    const verses = DEFAULT_GROUPS.filter((g) => g.name.startsWith('Verse'));
    expect(new Set(verses.map((g) => g.key))).toEqual(new Set(['V']));
    const numbered = verses.filter((g) => /\d$/.test(g.name));
    expect(new Set(numbered.map((g) => g.color)).size).toBe(numbered.length);
    expect(numbered[0].color).toBe('#216ed9');
  });

  it('keeps today’s colours and keys by default', () => {
    expect(groupKey('Verse 1')).toBe('V');
    expect(groupKey('Pre-chorus')).toBe('P');
    expect(groupKey('Spoken word')).toBe('S');
    const deck = presentationToDeck(createPresentation('S', parseLyrics('[Chorus]\nOne')), 'd');
    expect(deck.groups[0].colorHex.toLowerCase()).toBe(DEFAULT_GROUPS.find((g) => g.name === 'Chorus')!.color);
  });

  it('uses a church’s own list for new songs and jump keys', () => {
    setGroupDefinitions([
      { name: 'Coro', color: '#112233', key: 'K' },
      { name: 'Verso', color: '#445566' }
    ]);
    const p = createPresentation('S', parseLyrics('[Coro]\nOne\n\n[Verso 2]\nTwo'));
    expect(p.cueGroups.map((g) => colorToHex(g.group?.color).toLowerCase())).toEqual(['#112233', '#445566']);
    expect(groupKey('Coro')).toBe('K');
    expect(groupKey('Verso 2')).toBeUndefined();
    // ProPresenter's own stored key still wins.
    expect(groupKey('Coro', 3)).toBe('C');
  });

  it('cleans stored entries', () => {
    expect(cleanGroup({ name: '  Hook ', color: 'red', key: 'hx' })).toEqual({ name: 'Hook', color: '#737380', key: 'H' });
    expect(cleanGroup({ name: '' })).toBeNull();
    setGroupDefinitions([{ name: '', color: '#000000' }]);
    expect(groupDefinitionFor('Verse')?.name).toBeUndefined();
  });
});

describe('copyright on every slide', () => {
  it('shows on all of them', () => {
    expect([0, 1, 2].map((i) => showsCopyright('all', i, 3))).toEqual([true, true, true]);
  });
});

describe('new background defaults', () => {
  it('follow Preferences ▸ Media', () => {
    expect(backgroundForPath('a.mp4')).toMatchObject({ scale: 'fill', loop: true });
    setBackgroundDefaults({ scale: 'fit', videoLoop: false });
    expect(backgroundForPath('a.mp4')).toMatchObject({ scale: 'fit', loop: false });
    expect(backgroundForPath('a.png')).toMatchObject({ scale: 'fit', loop: false });
  });
});
