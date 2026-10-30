// The presenter view: for the person speaking, on their phone or tablet. Their
// slide on screen and the next one, the notes for it, a clock, and Black, Back
// and Next. Plain HTML/JS like the operator's remote; all text is inserted
// with textContent.
import type { RemoteAssets } from './remoteServer';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f161e">
<title>Vessel Presenter</title>
<link rel="stylesheet" href="/presenter.css">
</head>
<body>
<main id="login" hidden>
  <h1>Vessel Presenter</h1>
  <p>Enter the presenter PIN shown in Vessel under <b>Remote</b>.</p>
  <form id="login-form">
    <input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="PIN" required>
    <button type="submit">Connect</button>
  </form>
  <p id="login-error" class="error"></p>
</main>

<main id="view" hidden>
  <header>
    <div id="title">—</div>
    <span id="badge" class="badge"></span>
  </header>
  <div class="info">
    <span id="position"></span>
    <span id="speaking"></span>
    <span id="clock"></span>
  </div>
  <section class="slides">
    <button id="now" class="slide now" aria-label="Show every slide"><span class="tag" id="now-tag">ON SCREEN</span><img alt=""><span class="words"></span></button>
    <button id="next" class="slide next" aria-label="Show every slide"><span class="tag" id="next-tag">NEXT</span><img alt=""><span class="words"></span></button>
  </section>
  <section class="notes">
    <div class="notes-head">
      <span id="notes-label">Notes</span>
      <span class="size"><button id="smaller" aria-label="Smaller notes">A–</button><button id="bigger" aria-label="Bigger notes">A+</button></span>
    </div>
    <div id="notes-text"></div>
  </section>
  <nav id="strip" class="strip" aria-label="Every slide"></nav>
  <div class="controls">
    <button id="black">Black</button>
    <button id="prev">◀ Back</button>
    <button id="advance" class="primary">Next ▶</button>
  </div>
  <p id="offline" class="error" hidden>Reconnecting…</p>
</main>

<div id="all" class="all" hidden>
  <div class="all-head"><b>Every slide</b><button id="all-close">Done</button></div>
  <div id="all-grid" class="all-grid"></div>
</div>
<script src="/presenter.js"></script>
</body>
</html>`;

const css = `
:root { color-scheme: dark; --bg:#0f161e; --panel:#151f2a; --panel-2:#1c2835; --border:#273443; --border-strong:#3a4a5c; --text:#eef0f2; --muted:#8f9cab; --accent:#d9b97a; --on-accent:#16202b; --live:#e5484d; --notes:19px; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
[hidden] { display: none !important; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 16px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
button { font: inherit; color: inherit; background: var(--panel-2); border: 1px solid var(--border-strong); border-radius: 14px; cursor: pointer; touch-action: manipulation; }
button:active { transform: scale(0.98); }
.error { color: #ff8a8a; }

#login { max-width: 360px; margin: 0 auto; padding: 18vh 20px 20px; text-align: center; }
#login h1 { font-size: 24px; }
#login p { color: var(--muted); }
#login form { display: flex; gap: 8px; margin-top: 20px; }
#login input { flex: 1; min-width: 0; font: 600 22px ui-monospace, Menlo, monospace; letter-spacing: .2em; text-align: center; padding: 12px; border-radius: 12px; border: 1px solid var(--border-strong); background: var(--panel); color: var(--text); }
#login button { padding: 0 18px; background: var(--accent); color: var(--on-accent); border: none; font-weight: 700; }

/* Upright phone: everything in one column, notes taking the space. */
#view { height: 100%; height: 100dvh; display: grid; gap: 10px; padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  grid-template-areas: "header" "info" "slides" "notes" "strip" "controls"; }
header { grid-area: header; display: flex; align-items: center; gap: 8px; }
#title { flex: 1; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 11px; font-weight: 800; letter-spacing: .06em; padding: 3px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted); white-space: nowrap; }
.badge.live { background: var(--live); color: #fff; }
.badge.black { background: #000; color: #fff; border: 1px solid var(--border-strong); }
.info { grid-area: info; display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.info b { color: var(--text); font-weight: 600; }

.slides { grid-area: slides; display: flex; gap: 8px; align-items: flex-start; }
.slide { position: relative; padding: 0; border: none; border-radius: 9px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px rgba(255,255,255,.1); }
.slide img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.slide img:not([src]) { display: none; }
.slide .words { padding: 0 8%; font-weight: 700; font-size: 11px; line-height: 1.25; text-align: center; white-space: pre-line; overflow: hidden; max-height: 100%; }
.slide.pictured .words { display: none; }
.slide.now { flex: 1.6; box-shadow: 0 0 0 2px var(--live); }
.slide.now.off { box-shadow: 0 0 0 1px rgba(255,255,255,.1); }
.slide.next { flex: 1; opacity: .9; }
.slide.next .words { font-size: 8px; }
.slide.empty { color: var(--muted); }
.slide.empty .words { font-weight: 400; font-size: 11px; }
.tag { position: absolute; left: 5px; top: 5px; z-index: 1; font-size: 9px; font-weight: 800; letter-spacing: .06em; padding: 2px 6px; border-radius: 5px; background: rgba(0,0,0,.6); color: #fff; }
.slide.now:not(.off) .tag { background: var(--live); }

.notes { grid-area: notes; min-height: 0; display: flex; flex-direction: column; border-radius: 14px; background: var(--panel); border: 1px solid var(--border); padding: 10px 14px 12px; }
.notes-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.size { display: flex; gap: 6px; }
.size button { font-size: 13px; letter-spacing: 0; padding: 3px 10px; border-radius: 8px; }
#notes-text { flex: 1; overflow-y: auto; font-size: var(--notes); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; -webkit-overflow-scrolling: touch; }
#notes-text.none { color: var(--muted); font-size: 15px; font-style: italic; }

.strip { grid-area: strip; display: none; gap: 8px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none; }
.strip .slide { flex: none; width: 128px; opacity: .75; }
.strip .slide.current { opacity: 1; box-shadow: 0 0 0 2px var(--live); }
.strip .slide.disabled { opacity: .35; }
.strip .slide .words { font-size: 6px; }
.num { position: absolute; right: 5px; bottom: 3px; z-index: 1; font-size: 10px; font-weight: 700; text-shadow: 0 1px 3px #000; }

.controls { grid-area: controls; display: grid; grid-template-columns: .8fr 1fr 1.6fr; gap: 8px; }
.controls button { padding: 16px 0; font-size: 18px; font-weight: 700; }
#black { font-size: 15px; color: #b9c2cc; }
#black.on { background: #000; color: #fff; border-color: #fff; }
.controls .primary { background: var(--accent); color: var(--on-accent); border: none; }
#offline { position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%); background: var(--panel); padding: 6px 12px; border-radius: 999px; margin: 0; }

/* Every slide, to jump to one (phones: tap a slide picture). */
.all { position: fixed; inset: 0; z-index: 5; background: rgba(15,22,30,.97); display: flex; flex-direction: column; padding: max(12px, env(safe-area-inset-top)) 14px 14px; }
.all-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.all-head button { padding: 8px 16px; background: var(--accent); color: var(--on-accent); border: none; font-weight: 700; }
.all-grid { overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.all-grid .slide { width: 100%; }
.all-grid .slide.current { box-shadow: 0 0 0 2px var(--live); }
.all-grid .slide.disabled { opacity: .4; }
.all-grid .slide .words { font-size: 8px; }

/* Sideways phone: slides and buttons on the left, notes on the right. */
@media (orientation: landscape) {
  #view { grid-template-columns: minmax(0, 44%) minmax(0, 1fr);
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    grid-template-areas: "header header" "slides notes" "info notes" ". notes" "controls notes"; }
  .controls { grid-template-columns: .8fr 1fr 1.4fr; }
  .controls button { padding: 12px 0; }
}

/* Tablets: bigger everything, and a strip of every slide to tap. */
@media (min-width: 700px) and (min-height: 600px) {
  :root { --notes: 23px; }
  #view { gap: 14px; padding-left: max(22px, env(safe-area-inset-left)); padding-right: max(22px, env(safe-area-inset-right)); }
  #title { font-size: 19px; }
  .info { font-size: 15px; }
  .strip { display: flex; }
  .slide .words { font-size: 15px; }
  .slide.next .words { font-size: 10px; }
  .controls button { padding: 18px 0; font-size: 20px; }
  .notes { padding: 14px 20px 16px; }
}
@media (min-width: 700px) and (min-height: 600px) and (orientation: landscape) {
  /* The two slides stack (heights .56 + .31 of the column's width) under ~310px
     of header, clock, strip and buttons, so on a short, wide screen (a small
     laptop) the column narrows until both fit, rather than overlapping. */
  #view { grid-template-columns: minmax(0, min(46%, calc((100vh - 310px) * 1.12))) minmax(0, 1fr);
    grid-template-columns: minmax(0, min(46%, calc((100dvh - 310px) * 1.12))) minmax(0, 1fr);
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto auto;
    grid-template-areas: "header header" "info info" "slides notes" "nextrow notes" ". notes" "strip strip" "controls controls"; }
  .slides { display: contents; }
  .slide.now { grid-area: slides; }
  .slide.next { grid-area: nextrow; width: 55%; }
  .controls { grid-template-columns: .6fr 1fr 1.8fr; }
}
`;

const js = `
const $ = (id) => document.getElementById(id);
let state = null;
let offset = 0;           // server clock minus this device's clock
let events = null;

async function api(path, body) {
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Vessel': '1', 'X-Vessel-View': 'presenter' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  if (res.status === 401 && path !== '/api/login') showLogin();
  return res;
}

function showLogin(message) {
  if (events) { events.close(); events = null; }
  $('view').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = message || '';
  $('pin').focus();
}

function connect() {
  $('login').hidden = true;
  $('view').hidden = false;
  events = new EventSource('/api/events?view=presenter');
  events.addEventListener('presenter', (e) => {
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
  if (res.ok) { $('pin').value = ''; connect(); }
  else if (res.status === 429) $('login-error').textContent = 'Too many wrong PINs. Try again in ' + (await res.text()) + ' seconds.';
  else $('login-error').textContent = 'That PIN is not right.';
});

function send(command) {
  if (navigator.vibrate) navigator.vibrate(8);
  api('/api/command', command);
}
$('advance').onclick = () => send({ type: 'next' });
$('prev').onclick = () => send({ type: 'prev' });
$('black').onclick = () => send({ type: 'black' });

// Notes size, remembered on this device.
let notesSize = Number(localStorage.getItem('vessel.notesSize')) || 0;
function applySize() {
  if (notesSize) document.documentElement.style.setProperty('--notes', notesSize + 'px');
}
function resize(by) {
  const now = parseFloat(getComputedStyle($('notes-text')).fontSize) || 19;
  notesSize = Math.max(13, Math.min(44, Math.round(now + by)));
  try { localStorage.setItem('vessel.notesSize', String(notesSize)); } catch {}
  applySize();
}
$('smaller').onclick = () => resize(-2);
$('bigger').onclick = () => resize(2);
applySize();

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function pictureUrl(i) {
  const pics = state && state.pictures;
  return pics && i >= 0 && i < pics.count ? '/api/slides/' + pics.key + '/' + i + '.jpg' : '';
}

/** Fill a slide button: its picture once drawn, its words until then. */
function fill(button, i, slide) {
  const img = button.querySelector('img');
  const url = pictureUrl(i);
  if (url) { if (img.getAttribute('src') !== url) img.src = url; }
  else img.removeAttribute('src');
  button.classList.toggle('pictured', !!url);
  button.querySelector('.words').textContent = slide ? (slide.text || '(no words)') : '';
}

function slideButton(i, slide, current) {
  const b = el('button', 'slide' + (i === current ? ' current' : '') + (slide.enabled ? '' : ' disabled'));
  b.append(el('img'), el('span', 'words'), el('span', 'num', String(i + 1)));
  b.querySelector('img').alt = '';
  fill(b, i, slide);
  b.onclick = () => { send({ type: 'goto', index: i }); $('all').hidden = true; };
  return b;
}

/** The next slide Next would show: turned-off slides are passed over. */
function nextIndex(p) {
  for (let i = (p.liveIndex === null ? -1 : p.liveIndex) + 1; i < p.slides.length; i++) if (p.slides[i].enabled) return i;
  return -1;
}

function render() {
  const p = state.presentation;
  $('title').textContent = p ? p.name || 'Untitled' : 'Waiting for Vessel';
  const live = !!p && p.liveIndex !== null;
  const badge = $('badge');
  badge.textContent = state.blackout ? 'BLACK' : live ? 'LIVE' : 'NOT ON SCREEN';
  badge.className = 'badge' + (state.blackout ? ' black' : live ? ' live' : '');
  $('black').classList.toggle('on', state.blackout);

  const now = $('now'), next = $('next');
  if (!p || !p.slides.length) {
    now.className = 'slide now off empty'; fill(now, -1, null);
    now.querySelector('.words').textContent = 'The operator hasn’t opened your presentation yet.';
    next.className = 'slide next empty'; fill(next, -1, null);
    $('now-tag').textContent = 'ON SCREEN'; $('next-tag').textContent = 'NEXT';
    $('position').textContent = ''; $('notes-label').textContent = 'Notes';
    setNotes('');
    $('strip').replaceChildren();
    $('all-grid').replaceChildren();
    $('prev').disabled = $('advance').disabled = true;
    tick();
    return;
  }
  const n = nextIndex(p);
  // Not on screen yet: show the first slide as what Next will start with.
  if (live) {
    now.className = 'slide now'; fill(now, p.liveIndex, p.slides[p.liveIndex]);
    $('now-tag').textContent = state.blackout ? 'ON SCREEN · BLACK' : 'ON SCREEN';
  } else {
    now.className = 'slide now off empty'; fill(now, -1, null);
    now.querySelector('.words').textContent = 'Not on screen yet. Next starts with the first slide.';
    $('now-tag').textContent = 'ON SCREEN';
  }
  next.className = 'slide next' + (n < 0 ? ' empty' : '');
  fill(next, n, n < 0 ? null : p.slides[n]);
  if (n < 0) next.querySelector('.words').textContent = 'End of your slides';
  $('next-tag').textContent = live ? 'NEXT' : 'FIRST';
  $('position').replaceChildren();
  if (live) $('position').append('Slide ', el('b', '', String(p.liveIndex + 1)), ' of ' + p.slides.length);
  else $('position').append(p.slides.length + ' slides');

  const shown = live ? p.liveIndex : n;
  $('notes-label').textContent = live ? 'Notes' : 'Notes · first slide';
  setNotes(shown >= 0 ? p.slides[shown].notes : '');

  const strip = $('strip'), grid = $('all-grid');
  strip.replaceChildren(...p.slides.map((s, i) => slideButton(i, s, p.liveIndex)));
  grid.replaceChildren(...p.slides.map((s, i) => slideButton(i, s, p.liveIndex)));
  const current = strip.querySelector('.current');
  if (current) current.scrollIntoView({ block: 'nearest', inline: 'center' });
  $('prev').disabled = !live;
  $('advance').disabled = n < 0;
  tick();
}

let shownNotes = null;
function setNotes(text) {
  if (text === shownNotes) return;
  shownNotes = text;
  const box = $('notes-text');
  box.textContent = text || 'No notes for this slide.';
  box.classList.toggle('none', !text);
  box.scrollTop = 0;
}

for (const b of [$('now'), $('next')]) b.onclick = () => { if (state && state.presentation) $('all').hidden = false; };
$('all-close').onclick = () => { $('all').hidden = true; };

function fmt(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
}

function tick() {
  const now = Date.now() + offset;
  $('clock').replaceChildren(el('b', '', new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
  const since = state && state.presentation && state.presentation.speakingSince;
  $('speaking').replaceChildren(...(since ? ['Speaking ', el('b', '', fmt(now - since))] : []));
}
setInterval(tick, 1000);

fetch('/api/session', { credentials: 'same-origin' }).then((r) => (r.ok ? connect() : showLogin())).catch(() => showLogin());
`;

export const PRESENTER_ASSETS: RemoteAssets = { html, js, css };
