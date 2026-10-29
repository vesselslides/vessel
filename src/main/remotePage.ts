// The phone/tablet remote page, served by the remote server. Plain HTML/JS so it
// runs in any mobile browser; all slide text is inserted with textContent.
import type { RemoteAssets } from './remoteServer';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f161e">
<title>Vessel Remote</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<main id="login" hidden>
  <h1>Vessel Remote</h1>
  <p>Enter the PIN shown in Vessel under <b>Remote</b>.</p>
  <form id="login-form">
    <input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="PIN" required>
    <button type="submit">Connect</button>
  </form>
  <p id="login-error" class="error"></p>
</main>

<main id="remote" hidden>
  <header>
    <div id="title">—</div>
    <span id="badge" class="badge"></span>
  </header>
  <section class="now">
    <div class="label" id="now-label">On screen</div>
    <div class="slide" id="now-text"></div>
  </section>
  <section class="next">
    <div class="label" id="next-label">Next</div>
    <div class="slide" id="next-text"></div>
  </section>
  <div class="nav">
    <button id="prev" class="big">◀ Back</button>
    <button id="next" class="big primary">Next ▶</button>
  </div>
  <div class="row">
    <button id="clear">Clear</button>
    <button id="clear-all">Clear all</button>
    <button id="black">Black</button>
  </div>
  <nav class="tabs">
    <button data-tab="slides" class="active">Slides</button>
    <button data-tab="service">Service</button>
    <button data-tab="stage">Stage</button>
  </nav>
  <section id="tab-slides" class="tab"></section>
  <section id="tab-service" class="tab" hidden></section>
  <section id="tab-stage" class="tab" hidden>
    <div class="timer" id="timer">0:00</div>
    <div class="row">
      <button id="timer-start" class="primary">Start</button>
      <button id="timer-reset">Reset</button>
    </div>
    <textarea id="message" maxlength="200" placeholder="Message for the stage"></textarea>
    <div class="row">
      <button id="message-show" class="primary">Show message</button>
      <button id="message-hide">Hide</button>
    </div>
  </section>
  <p id="offline" class="error" hidden>Reconnecting…</p>
</main>
<script src="/app.js"></script>
</body>
</html>`;

const css = `
:root { color-scheme: dark; --bg:#0f161e; --panel:#151f2a; --border:#273443; --text:#eef0f2; --muted:#8f9cab; --accent:#d9b97a; --live:#e5484d; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; background:var(--bg); color:var(--text); font:16px -apple-system, system-ui, sans-serif; padding: env(safe-area-inset-top) 12px calc(16px + env(safe-area-inset-bottom)); }
main { max-width: 640px; margin: 0 auto; }
h1 { font-size: 22px; margin: 32px 0 8px; }
button { font: inherit; color: inherit; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px; min-height: 48px; }
button:active { transform: scale(0.98); }
button.primary { background: var(--accent); border-color: var(--accent); color: #16202b; font-weight: 700; }
button.on { background: var(--live); border-color: var(--live); }
input, textarea { font: inherit; color: inherit; background: #0f1013; border: 1px solid var(--border); border-radius: 12px; padding: 12px; width: 100%; }
#login-form { display: flex; gap: 8px; }
#pin { font-size: 24px; letter-spacing: 0.3em; text-align: center; }
.error { color: #ff8a8a; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 0; }
#title { flex: 1; font-weight: 700; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 999px; background: var(--panel); color: var(--muted); }
.badge.live { background: var(--live); color: #fff; }
section.now, section.next { background: #000; border-radius: 12px; padding: 12px; margin-bottom: 8px; }
.label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
.slide { white-space: pre-wrap; text-align: center; font-weight: 600; min-height: 1.3em; }
.now .slide { font-size: 20px; }
.next .slide { font-size: 15px; color: #fcd34d; }
.nav { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; margin: 8px 0; }
.nav .big { min-height: 72px; font-size: 20px; }
.row { display: flex; gap: 8px; margin: 8px 0; }
.row button { flex: 1; }
.tabs { display: flex; gap: 4px; margin: 16px 0 8px; }
.tabs button { flex: 1; min-height: 40px; padding: 8px; }
.tabs button.active { border-color: var(--accent); color: var(--accent); }
.tab { display: flex; flex-direction: column; gap: 6px; }
.tab[hidden], button[hidden] { display: none; }
.item { text-align: left; display: flex; gap: 10px; align-items: center; }
.item .strip { width: 4px; align-self: stretch; border-radius: 2px; background: var(--muted); flex: none; }
.item .text { white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; }
.item .group { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.item.live { border-color: var(--live); box-shadow: inset 0 0 0 1px var(--live); }
.item.current { border-color: var(--accent); }
.header-row { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); padding: 10px 4px 2px; }
.empty { color: var(--muted); text-align: center; padding: 16px; }
.timer { font-size: 56px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; padding: 8px 0; }
.timer.warn { color: #fbbf24; } .timer.over { color: #ff6b6b; } .timer.ok { color: #4ade80; }
textarea { min-height: 72px; resize: vertical; }
`;

const js = `
'use strict';
const $ = (id) => document.getElementById(id);
let state = null;
let offset = 0;           // server clock minus phone clock
let events = null;

async function api(path, body) {
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Vessel': '1' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  if (res.status === 401 && path !== '/api/login') showLogin();
  return res;
}

function showLogin(message) {
  if (events) { events.close(); events = null; }
  $('remote').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = message || '';
  $('pin').focus();
}

function connect() {
  $('login').hidden = true;
  $('remote').hidden = false;
  events = new EventSource('/api/events');
  events.addEventListener('state', (e) => {
    $('offline').hidden = true;
    state = JSON.parse(e.data);
    offset = state.serverTime - Date.now();
    render();
  });
  events.onerror = async () => {
    $('offline').hidden = false;
    const r = await fetch('/api/session', { credentials: 'same-origin' }).catch(() => null);
    if (r && r.status === 401) showLogin('Signed out. Enter the PIN again.');
  };
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await api('/api/login', { pin: $('pin').value });
  if (res.ok) { $('pin').value = ''; start(await res.json()); }
  else if (res.status === 429) $('login-error').textContent = 'Too many wrong PINs. Try again in ' + (await res.text()) + ' seconds.';
  else $('login-error').textContent = 'That PIN is not right.';
});

function send(command) {
  if (navigator.vibrate) navigator.vibrate(8);
  api('/api/command', command);
}

$('next').onclick = () => send({ type: 'next' });
$('prev').onclick = () => send({ type: 'prev' });
$('clear').onclick = () => send({ type: 'clear' });
$('clear-all').onclick = () => send({ type: 'clearAll' });
$('black').onclick = () => send({ type: 'black' });
$('timer-start').onclick = () => send({ type: 'timer', action: state && state.timer.startedAt !== null ? 'pause' : 'start' });
$('timer-reset').onclick = () => send({ type: 'timer', action: 'reset' });
$('message-show').onclick = () => send({ type: 'message', text: $('message').value });
$('message-hide').onclick = () => send({ type: 'message', text: '' });

for (const b of document.querySelectorAll('.tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('active', x === b);
    for (const t of ['slides', 'service', 'stage']) $('tab-' + t).hidden = t !== b.dataset.tab;
  };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function render() {
  const p = state.presentation;
  $('title').textContent = p ? p.name || 'Untitled' : 'No presentation';
  const badge = $('badge');
  badge.textContent = state.live.blackout ? 'BLACK' : state.live.cleared ? 'CLEAR' : 'LIVE';
  badge.className = 'badge' + (!state.live.blackout && !state.live.cleared ? ' live' : '');
  $('now-text').textContent = state.live.cleared ? '' : state.live.text;
  $('next-text').textContent = state.next ? state.next.text : 'End';
  $('next-label').textContent = state.next && state.next.group ? 'Next · ' + state.next.group : 'Next';
  $('black').classList.toggle('on', state.live.blackout);

  const slides = $('tab-slides');
  slides.replaceChildren();
  if (!p || !p.slides.length) slides.append(el('div', 'empty', 'Open a presentation in Vessel or pick a song under Service.'));
  else p.slides.forEach((s, i) => {
    const b = el('button', 'item' + (p.liveIndex === i ? ' live' : ''));
    const strip = el('span', 'strip'); if (s.color) strip.style.background = s.color;
    const body = el('span');
    body.append(el('div', 'group', (i + 1) + (s.group ? ' · ' + s.group : '')), el('div', 'text', s.text || '(blank)'));
    b.append(strip, body);
    b.onclick = () => send({ type: 'goto', index: i });
    slides.append(b);
  });

  const service = $('tab-service');
  service.replaceChildren();
  if (!state.service) service.append(el('div', 'empty', 'No service playlist is open in Vessel.'));
  else state.service.items.forEach((it, row) => {
    if (it.kind === 'header') return service.append(el('div', 'header-row', it.name));
    const b = el('button', 'item' + (it.live ? ' live' : it.current ? ' current' : ''), (it.live ? '● ' : '') + it.name);
    b.onclick = () => send({ type: 'openRow', row });
    service.append(b);
  });

  if (document.activeElement !== $('message')) $('message').value = state.message || '';
  $('timer-start').textContent = state.timer.startedAt !== null ? 'Pause' : state.timer.elapsedMs > 0 ? 'Resume' : 'Start';
  const toTime = state.timer.mode === 'clock';
  $('timer-start').hidden = toTime;
  $('timer-reset').hidden = toTime;
  tick();
}

function fmt(ms, roundUp) {
  const neg = ms < 0, abs = Math.abs(ms);
  const total = neg ? Math.floor(abs / 1000) : roundUp ? Math.ceil(abs / 1000) : Math.floor(abs / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const body = h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
  return neg && total > 0 ? '-' + body : body;
}

function tick() {
  if (!state) return;
  const t = state.timer, now = Date.now() + offset;
  // A countdown to a time of day ("service starts at 10:00") always runs.
  const clock = t.mode === 'clock' && typeof t.targetAt === 'number';
  const down = t.mode !== 'countup';
  const elapsed = t.elapsedMs + (t.startedAt === null ? 0 : Math.max(0, now - t.startedAt));
  const value = clock ? t.targetAt - now : down ? t.durationMs - elapsed : elapsed;
  const el2 = $('timer');
  el2.textContent = fmt(value, down);
  el2.className = 'timer' + (t.startedAt === null && !clock ? '' : down && value < 0 ? ' over' : down && value <= 60000 ? ' warn' : ' ok');
}
setInterval(tick, 250);

// The presenter PIN opens the presenter view instead.
function start(session) {
  if (session && session.role === 'presenter') location.replace('/presenter');
  else connect();
}

fetch('/api/session', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json().then(start) : showLogin())).catch(() => showLogin());
`;

export const REMOTE_ASSETS: RemoteAssets = { html, js, css };
