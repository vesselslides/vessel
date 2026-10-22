import { afterEach, describe, expect, it } from 'vitest';
import { RemoteServer } from '../src/main/remoteServer';
import { parseRemoteCommand, type RemoteCommand, type RemoteState } from '../src/shared/remote';
import { INITIAL_TIMER } from '../src/shared/timer';

const STATE: RemoteState = {
  presentation: { name: 'Song', slides: [{ text: 'One', group: 'Verse' }], liveIndex: 0 },
  service: null,
  live: { text: 'One', cleared: false, blackout: false },
  next: null,
  timer: INITIAL_TIMER,
  message: ''
};

describe('remote commands', () => {
  it('accepts only well-formed commands', () => {
    expect(parseRemoteCommand({ type: 'next' })).toEqual({ type: 'next' });
    expect(parseRemoteCommand({ type: 'goto', index: 3 })).toEqual({ type: 'goto', index: 3 });
    expect(parseRemoteCommand({ type: 'timer', action: 'start' })).toEqual({ type: 'timer', action: 'start' });
    expect(parseRemoteCommand({ type: 'message', text: 'x'.repeat(500) })).toEqual({ type: 'message', text: 'x'.repeat(200) });
    for (const bad of [null, 'next', { type: 'goto', index: -1 }, { type: 'goto', index: 1.5 }, { type: 'goto' }, { type: 'timer', action: 'explode' }, { type: 'message', text: 5 }, { type: 'rm -rf' }])
      expect(parseRemoteCommand(bad)).toBeNull();
  });
});

describe('remote server', () => {
  let server: RemoteServer | null = null;
  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  async function start(opts: { clock?: { t: number } } = {}) {
    const commands: RemoteCommand[] = [];
    let pin = '123456';
    server = new RemoteServer({
      assets: { html: '<html>remote</html>', js: 'js', css: 'css' },
      pin: () => pin,
      onCommand: (c) => commands.push(c),
      maxAttempts: 3,
      lockoutMs: 60_000,
      now: opts.clock ? () => opts.clock!.t : undefined
    });
    const port = await server.start(0, '127.0.0.1');
    const base = `http://127.0.0.1:${port}`;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vessel': '1', ...headers }, body: JSON.stringify(body) });
    const login = async (p: string) => {
      const r = await post('/api/login', { pin: p });
      return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '' };
    };
    return { base, post, login, commands, setPin: (p: string) => (pin = p) };
  }

  it('serves the page with a strict content security policy', async () => {
    const { base } = await start();
    const r = await fetch(base + '/');
    expect(await r.text()).toBe('<html>remote</html>');
    expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(r.headers.get('x-frame-options')).toBe('DENY');
  });

  it('requires the PIN before commands or updates', async () => {
    const { base, post, login, commands } = await start();
    expect((await post('/api/command', { type: 'next' })).status).toBe(401);
    expect((await fetch(base + '/api/events')).status).toBe(401);
    expect((await login('000000')).status).toBe(401);
    const ok = await login('123456');
    expect(ok.status).toBe(204);
    expect(ok.cookie).toMatch(/^vessel_session=[a-f0-9]{64}$/);
    expect((await post('/api/command', { type: 'next' }, { Cookie: ok.cookie })).status).toBe(204);
    expect((await post('/api/command', { type: 'nonsense' }, { Cookie: ok.cookie })).status).toBe(400);
    expect(commands).toEqual([{ type: 'next' }]);
  });

  it('rejects posts without the X-Vessel header (cross-site requests)', async () => {
    const { base, login, commands } = await start();
    const { cookie } = await login('123456');
    const r = await fetch(base + '/api/command', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{"type":"next"}' });
    expect(r.status).toBe(403);
    expect(commands).toEqual([]);
  });

  it('locks out an address after too many wrong PINs', async () => {
    const clock = { t: 1_000 };
    const { login } = await start({ clock });
    for (let i = 0; i < 3; i++) expect((await login('999999')).status).toBe(401);
    expect((await login('123456')).status).toBe(429); // even the right PIN, while locked
    clock.t += 61_000;
    expect((await login('123456')).status).toBe(204);
  });

  it('streams state to signed-in phones and signs everyone out on demand', async () => {
    const { base, login, post } = await start();
    const { cookie } = await login('123456');
    server!.setState(STATE);
    const controller = new AbortController();
    const res = await fetch(base + '/api/events', { headers: { Cookie: cookie }, signal: controller.signal });
    const reader = res.body!.getReader();
    let text = '';
    while (!text.includes('event: state')) text += new TextDecoder().decode((await reader.read()).value);
    const data = JSON.parse(/data: (.*)\n/.exec(text)![1]);
    expect(data.presentation.name).toBe('Song');
    expect(typeof data.serverTime).toBe('number');
    expect(server!.clientCount).toBe(1);
    server!.signOutAll();
    expect((await post('/api/command', { type: 'next' }, { Cookie: cookie })).status).toBe(401);
    controller.abort();
  });

  it('rejects oversized bodies', async () => {
    const { post, login } = await start();
    const { cookie } = await login('123456');
    expect((await post('/api/command', { type: 'message', text: 'x'.repeat(10_000) }, { Cookie: cookie })).status).toBe(400);
  });
});
