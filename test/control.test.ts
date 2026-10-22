import { afterEach, describe, expect, it } from 'vitest';
import { RemoteServer } from '../src/main/remoteServer';
import { actionForTrigger, bindTrigger, describeTrigger, DEFAULT_MIDI, midiTriggerOf, normalizeMidi } from '../src/shared/control';
import { tidyLyrics } from '../src/shared/import/lyrics';
import { applyLyrics, planLyrics, presentationToLyrics, SONG_ORDER } from '../src/shared/pro/edit';
import { createPresentation, parseLyrics, presentationToDeck } from '../src/shared/pro/presentation';
import { parseRemoteCommand, type RemoteCommand } from '../src/shared/remote';
import { normalizeStreamLook, normalizeStreamTarget } from '../src/shared/stream';

describe('song text: repeats and splitting', () => {
  const song = () => createPresentation('Song', parseLyrics('[Verse 1]\nV1a\n\n[Chorus]\nC1\n\n[Verse 2]\nV2'));

  it('reads a bare repeated heading as singing that group again', () => {
    const plan = planLyrics('[Verse 1]\nV1\n\n[Chorus]\nC1\n\n[Verse 2]\nV2\n\n[Chorus]\n\n[Chorus]\nC1');
    expect(plan.groups.map((g) => g.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(plan.order).toEqual([0, 1, 2, 1, 1]);
    expect(plan.repeats).toBe(true);
    // A chorus typed with different words is a group of its own.
    expect(planLyrics('[Chorus]\nA\n\n[Chorus]\nB').groups).toHaveLength(2);
  });

  it('splits long slides by lines', () => {
    expect(planLyrics('[Verse]\n1\n2\n3\n4\n5', 2).groups[0].slides).toEqual(['1\n2', '3\n4', '5']);
    expect(planLyrics('[Verse]\n1\n2\n3', 0).groups[0].slides).toEqual(['1\n2\n3']);
  });

  it('keeps the sung order as the "Song order" arrangement, and updates it next time', () => {
    let p = applyLyrics(song(), '[Verse 1]\nV1a\n\n[Chorus]\nC1\n\n[Verse 2]\nV2\n\n[Chorus]');
    const deck = () => presentationToDeck(p, 'd');
    expect(deck().arrangements.map((a) => a.name)).toEqual([SONG_ORDER]);
    expect(deck().slides.map((s) => s.text)).toEqual(['V1a', 'C1', 'V2', 'C1']);
    p = applyLyrics(p, '[Verse 1]\nV1a\n\n[Chorus]\nC1\n\n[Chorus]\n\n[Verse 2]\nV2');
    expect(deck().arrangements).toHaveLength(1);
    expect(deck().slides.map((s) => s.text)).toEqual(['V1a', 'C1', 'C1', 'V2']);
    // Groups still appear once in the text, so editing it again changes nothing.
    expect(presentationToLyrics(p)).toBe('[Verse 1]\nV1a\n\n[Chorus]\nC1\n\n[Verse 2]\nV2');
  });

  it('leaves arrangements alone when nothing repeats', () => {
    const p = applyLyrics(song(), '[Verse 1]\nV1a edited\n\n[Chorus]\nC1\n\n[Verse 2]\nV2', 0);
    expect(presentationToDeck(p, 'd').arrangements).toHaveLength(0);
  });

  it('tidies pasted lyrics with chords and labels', () => {
    const pasted = 'Verse 1:\nG        D\nAmazing grace\nHow [Em]sweet the sound\n\nCHORUS\nMy chains are gone\n\nVerse 2\nT’was grace\n\nChorus\n\nCCLI Song # 4768151';
    const tidy = tidyLyrics(pasted);
    expect(tidy.text).toBe('[Verse 1]\nAmazing grace\nHow sweet the sound\n\n[Chorus]\nMy chains are gone\n\n[Verse 2]\nT’was grace\n\n[Chorus]');
    expect(tidy.removedChordLines).toBe(1);
    expect(tidy.ccli.songNumber).toBe(4768151);
  });
});

describe('MIDI control', () => {
  it('reads notes, controllers and program changes', () => {
    const held = new Map<string, boolean>();
    expect(midiTriggerOf([0x90, 60, 100], held)).toEqual({ kind: 'note', channel: 0, number: 60 });
    expect(midiTriggerOf([0x90, 60, 0], held)).toBeNull(); // note off sent as velocity 0
    expect(midiTriggerOf([0x80, 60, 0], held)).toBeNull();
    expect(midiTriggerOf([0xc9, 4], held)).toEqual({ kind: 'program', channel: 9, number: 4 });
    // A controller button fires once on the way up.
    expect(midiTriggerOf([0xb0, 20, 127], held)).toEqual({ kind: 'cc', channel: 0, number: 20 });
    expect(midiTriggerOf([0xb0, 20, 127], held)).toBeNull();
    expect(midiTriggerOf([0xb0, 20, 0], held)).toBeNull();
    expect(midiTriggerOf([0xb0, 20, 90], held)).not.toBeNull();
    expect(describeTrigger({ kind: 'note', channel: 0, number: 60 })).toBe('Note C4, channel 1');
    expect(describeTrigger({ kind: 'program', channel: 9, number: 4 })).toBe('Program 5, channel 10');
  });

  it('binds each trigger to one action', () => {
    const note = { kind: 'note' as const, channel: 0, number: 60 };
    let m = bindTrigger(DEFAULT_MIDI, 'next', note);
    expect(actionForTrigger(m.bindings, note)).toBe('next');
    m = bindTrigger(m, 'black', note);
    expect(m.bindings).toEqual({ black: note });
    expect(actionForTrigger(bindTrigger(m, 'black', null).bindings, note)).toBeNull();
    expect(normalizeMidi({ enabled: 1, bindings: { next: note, nope: note, prev: { kind: 'note', channel: 16, number: 1 } } })).toEqual({ enabled: true, input: '', bindings: { next: note } });
  });
});

describe('Stream Deck and Companion', () => {
  let server: RemoteServer | null = null;
  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it('runs actions with the PIN in a header or the address, and locks out wrong PINs', async () => {
    const commands: RemoteCommand[] = [];
    server = new RemoteServer({ assets: { html: '', js: '', css: '' }, pin: () => '123456', onCommand: (c) => commands.push(c), maxAttempts: 3 });
    const base = `http://127.0.0.1:${await server.start(0, '127.0.0.1')}`;
    expect((await fetch(`${base}/api/control/next`, { method: 'POST', headers: { 'X-Vessel-Pin': '123456' } })).status).toBe(204);
    expect((await fetch(`${base}/api/control/black?pin=123456`)).status).toBe(204);
    expect(commands).toEqual([
      { type: 'action', action: 'next' },
      { type: 'action', action: 'black' }
    ]);
    const list = await (await fetch(`${base}/api/control?pin=123456`)).json();
    expect(list.map((a: { action: string }) => a.action)).toContain('hide-lower-third');
    expect((await fetch(`${base}/api/control/format-disk?pin=123456`)).status).toBe(404);
    expect((await fetch(`${base}/api/control/next`)).status).toBe(401);
    expect((await fetch(`${base}/api/control/next?pin=000000`)).status).toBe(401);
    expect((await fetch(`${base}/api/control/next?pin=111111`)).status).toBe(401);
    // Third wrong PIN in a row: locked out, even with the right one.
    expect((await fetch(`${base}/api/control/next?pin=123456`)).status).toBe(429);
    expect(commands).toHaveLength(2);
    expect(parseRemoteCommand({ type: 'action', action: 'logo' })).toEqual({ type: 'action', action: 'logo' });
    expect(parseRemoteCommand({ type: 'action', action: 'quit' })).toBeNull();
  });
});

describe('stream output settings', () => {
  it('fills in a missing or broken look', () => {
    expect(normalizeStreamLook(undefined)).toEqual({ background: 'green', style: 'lower', media: false, overlays: true });
    expect(normalizeStreamLook({ background: 'pink', style: 'slide', media: 1, overlays: false })).toEqual({ background: 'green', style: 'slide', media: true, overlays: false });
    expect(normalizeStreamTarget('window')).toBe('window');
    expect(normalizeStreamTarget(42)).toBe(42);
    expect(normalizeStreamTarget('42')).toBeNull();
  });
});
