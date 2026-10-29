// The remote control server: a tiny web app for phones on the same network.
// Plain node:http with Server-Sent Events for updates, so it needs no
// dependencies and has nothing to do with Electron (tests run it directly).
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CONTROL_ACTIONS, isControlAction } from '../shared/control';
import { parseRemoteCommand, presenterMay, type PresenterState, type RemoteCommand, type RemoteRole, type RemoteState } from '../shared/remote';

export interface RemoteAssets {
  html: string;
  js: string;
  css: string;
}

export interface RemoteServerOptions {
  assets: RemoteAssets;
  /** The presenter view's page, at /presenter. */
  presenterAssets?: RemoteAssets;
  /** The operator's PIN: full control, and the only one Stream Deck and Companion can use. */
  pin: () => string;
  /** The presenter's PIN: their slides, notes, next, back and black. */
  presenterPin?: () => string;
  onCommand: (command: RemoteCommand, role: RemoteRole) => void;
  onClientsChanged?: (count: number, presenters: number) => void;
  /** A picture of a slide for the presenter view (JPEG), or null if there isn't one. */
  picture?: (key: string, index: number) => Buffer | null;
  /** Wrong PINs allowed per address before a lockout. */
  maxAttempts?: number;
  lockoutMs?: number;
  now?: () => number;
}

const COOKIE = 'vessel_session';
const MAX_BODY = 4096;

export const newPin = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

function samePin(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

export class RemoteServer {
  private server: Server | null = null;
  private sessions = new Map<string, RemoteRole>();
  private clients = new Map<ServerResponse, RemoteRole>();
  private failures = new Map<string, { count: number; until: number }>();
  private state: RemoteState | null = null;
  private presenterState: PresenterState | null = null;
  private keepAlive: NodeJS.Timeout | null = null;

  constructor(private readonly opts: RemoteServerOptions) {}

  get port(): number | null {
    const address = this.server?.address() as AddressInfo | null | undefined;
    return address?.port ?? null;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  get presenterCount(): number {
    return [...this.clients.values()].filter((r) => r === 'presenter').length;
  }

  /** Listen on all interfaces, trying a few ports from `port` upwards. Returns the port used. */
  async start(port: number, host = '0.0.0.0'): Promise<number> {
    if (this.server) return this.port!;
    for (let p = port; p < port + 10; p++) {
      const server = createServer((req, res) => void this.handle(req, res));
      const ok = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(p, host, () => resolve(true));
      });
      if (ok) {
        this.server = server;
        this.keepAlive = setInterval(() => this.clients.forEach((_role, c) => c.write(': keep-alive\n\n')), 20_000);
        return this.port!;
      }
      server.close();
    }
    throw new Error(`No free port between ${port} and ${port + 9}`);
  }

  async stop(): Promise<void> {
    this.signOutAll();
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Forget every phone's login (after a PIN change or turning the remote off). */
  signOutAll(): void {
    this.sessions.clear();
    for (const c of this.clients.keys()) c.end();
    this.clients.clear();
    this.clientsChanged();
  }

  /** Sign out everyone who signed in as `role` (after that PIN changes). */
  signOutRole(role: RemoteRole): void {
    for (const [token, r] of this.sessions) if (r === role) this.sessions.delete(token);
    for (const [c, r] of this.clients)
      if (r === role) {
        c.end();
        this.clients.delete(c);
      }
    this.clientsChanged();
  }

  private clientsChanged(): void {
    this.opts.onClientsChanged?.(this.clients.size, this.presenterCount);
  }

  setState(state: RemoteState): void {
    this.state = state;
    this.broadcast('operator');
  }

  setPresenterState(state: PresenterState): void {
    this.presenterState = state;
    this.broadcast('presenter');
  }

  private broadcast(role: RemoteRole): void {
    const data = this.event(role);
    if (!data) return;
    for (const [c, r] of this.clients) if (r === role) c.write(data);
  }

  /** The latest state for a role as a Server-Sent Event, or null before there is one. */
  private event(role: RemoteRole): string | null {
    const state = role === 'operator' ? this.state : this.presenterState;
    if (!state) return null;
    return `event: ${role === 'operator' ? 'state' : 'presenter'}\ndata: ${JSON.stringify({ ...state, serverTime: (this.opts.now ?? Date.now)() })}\n\n`;
  }

  /** The signed-in role for this request, or null. */
  private session(req: IncomingMessage): RemoteRole | null {
    const token = this.token(req);
    return token ? (this.sessions.get(token) ?? null) : null;
  }

  private token(req: IncomingMessage): string | null {
    const cookie = req.headers.cookie ?? '';
    const token = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(cookie)?.[1];
    return token && this.sessions.has(token) ? token : null;
  }

  private send(res: ServerResponse, status: number, body = '', type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}): void {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, ...extra });
    res.end(body);
  }

  private async body(req: IncomingMessage): Promise<unknown> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new Error('too large');
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://remote');
    const route = `${req.method} ${url.pathname}`;
    try {
      const page = { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" };
      if (route === 'GET /' || route === 'GET /index.html') return this.send(res, 200, this.opts.assets.html, 'text/html; charset=utf-8', page);
      if (route === 'GET /app.js') return this.send(res, 200, this.opts.assets.js, 'text/javascript; charset=utf-8');
      if (route === 'GET /app.css') return this.send(res, 200, this.opts.assets.css, 'text/css; charset=utf-8');
      const presenter = this.opts.presenterAssets;
      if (presenter && route === 'GET /presenter') return this.send(res, 200, presenter.html, 'text/html; charset=utf-8', page);
      if (presenter && route === 'GET /presenter.js') return this.send(res, 200, presenter.js, 'text/javascript; charset=utf-8');
      if (presenter && route === 'GET /presenter.css') return this.send(res, 200, presenter.css, 'text/css; charset=utf-8');

      // Stream Deck, Companion and similar: /api/control/<action>, with the PIN in an
      // X-Vessel-Pin header (or ?pin= for tools that can only open a web address).
      if (url.pathname === '/api/control' || url.pathname.startsWith('/api/control/')) return this.control(req, res, url);

      // State-changing requests must come from our page: other sites can't set this header.
      if (req.method === 'POST' && req.headers['x-vessel'] !== '1') return this.send(res, 403, 'Forbidden');

      if (route === 'POST /api/login') return this.login(req, res);
      const role = this.session(req);
      if (route === 'GET /api/session') return role ? this.send(res, 200, JSON.stringify({ role }), 'application/json') : this.send(res, 401);

      if (!role) return this.send(res, 401, 'Sign in with the PIN');

      if (route === 'GET /api/events') {
        // The presenter page asks for the presenter view; an operator may open it too.
        const view: RemoteRole = role === 'presenter' || url.searchParams.get('view') === 'presenter' ? 'presenter' : 'operator';
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write('retry: 2000\n\n');
        const first = this.event(view);
        if (first) res.write(first);
        this.clients.set(res, view);
        this.clientsChanged();
        req.on('close', () => {
          this.clients.delete(res);
          this.clientsChanged();
        });
        return;
      }
      if (route === 'POST /api/command') {
        const command = parseRemoteCommand(await this.body(req));
        if (!command) return this.send(res, 400, 'Unknown command');
        if (role === 'presenter' && !presenterMay(command)) return this.send(res, 403, 'Presenters can only move through their slides');
        // Anything sent from the presenter page acts on the presenter's own slides.
        this.opts.onCommand(command, role === 'presenter' || req.headers['x-vessel-view'] === 'presenter' ? 'presenter' : 'operator');
        return this.send(res, 204);
      }
      const picture = /^\/api\/slides\/([a-f0-9]{8,64})\/(\d{1,4})\.jpg$/.exec(url.pathname);
      if (req.method === 'GET' && picture) {
        const jpeg = this.opts.picture?.(picture[1], Number(picture[2]));
        if (!jpeg) return this.send(res, 404, 'Not found');
        // The key changes whenever the slides do, so a picture can be kept.
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
        return void res.end(jpeg);
      }
      if (route === 'POST /api/logout') {
        const token = this.token(req);
        if (token) this.sessions.delete(token);
        return this.send(res, 204, '', 'text/plain', { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict` });
      }
      return this.send(res, 404, 'Not found');
    } catch {
      return this.send(res, 400, 'Bad request');
    }
  }

  /** Seconds this address must wait after too many wrong PINs, or 0. */
  private lockedFor(req: IncomingMessage): number {
    const record = this.failures.get(req.socket.remoteAddress ?? 'unknown');
    const now = (this.opts.now ?? Date.now)();
    return record && record.until > now ? Math.ceil((record.until - now) / 1000) : 0;
  }

  /**
   * Check a PIN, counting wrong ones; on the last allowed one, lock this address out and start counting again after.
   * Returns who it signs in as, or null.
   */
  private checkPin(req: IncomingMessage, pin: string, operatorOnly = false): RemoteRole | null {
    const who = req.socket.remoteAddress ?? 'unknown';
    const presenterPin = operatorOnly ? '' : (this.opts.presenterPin?.() ?? '');
    const role: RemoteRole | null = samePin(pin, this.opts.pin()) ? 'operator' : presenterPin && samePin(pin, presenterPin) ? 'presenter' : null;
    if (role) {
      this.failures.delete(who);
      return role;
    }
    const count = (this.failures.get(who)?.count ?? 0) + 1;
    const locked = count >= (this.opts.maxAttempts ?? 5);
    this.failures.set(who, locked ? { count: 0, until: (this.opts.now ?? Date.now)() + (this.opts.lockoutMs ?? 60_000) } : { count, until: 0 });
    return null;
  }

  private tooMany(res: ServerResponse, seconds: number): void {
    this.send(res, 429, String(seconds), 'text/plain', { 'Retry-After': String(seconds) });
  }

  private control(req: IncomingMessage, res: ServerResponse, url: URL): void {
    if (req.method !== 'GET' && req.method !== 'POST') return this.send(res, 405, 'Use GET or POST');
    const wait = this.lockedFor(req);
    if (wait) return this.tooMany(res, wait);
    const header = req.headers['x-vessel-pin'];
    const pin = (typeof header === 'string' ? header : (url.searchParams.get('pin') ?? '')).trim();
    if (!this.checkPin(req, pin, true)) return this.send(res, 401, 'Wrong PIN');
    const name = decodeURIComponent(url.pathname.slice('/api/control/'.length));
    // The list of actions, for setting up buttons.
    if (url.pathname === '/api/control' || !name) return this.send(res, 200, JSON.stringify(CONTROL_ACTIONS.map((a) => ({ action: a.id, label: a.label }))), 'application/json');
    if (!isControlAction(name)) return this.send(res, 404, `No action called ${name}`);
    this.opts.onCommand({ type: 'action', action: name }, 'operator');
    return this.send(res, 204);
  }

  private async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const wait = this.lockedFor(req);
    if (wait) return this.tooMany(res, wait);
    const body = (await this.body(req)) as { pin?: unknown } | null;
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    const role = this.checkPin(req, pin);
    if (!role) return this.send(res, 401, 'Wrong PIN');
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, role);
    return this.send(res, 200, JSON.stringify({ role }), 'application/json', { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict` });
  }
}
