// The presenter remote: notes on each slide (from PowerPoint, typed in Edit,
// kept where ProPresenter keeps them), the presenter PIN, and what a
// presenter may do.
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteServer } from '../src/main/remoteServer';
import { DEFAULT_LYRICS_OPTIONS } from '../src/shared/import/lyrics';
import { convertPptx } from '../src/shared/import/pptx';
import { setSlideNotes, setSlideText } from '../src/shared/pro/edit';
import { createPresentation, notesOfCue, parsePresentation, presentationSlideOfCue, presentationToDeck, serializePresentation } from '../src/shared/pro/presentation';
import { rtfToPlainText } from '../src/shared/pro/rtf';
import { presenterMay, type PresenterState, type RemoteCommand, type RemoteRole } from '../src/shared/remote';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const rels = (...r: string[]) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;
const shape = (type: string | null, paragraphs: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${type ? `<p:ph type="${type}"/>` : ''}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6000000" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
const para = (...runs: string[]) => `<a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p>`;

/** Two slides; the first has speaker notes (with the slide picture and page number on the notes page too). */
function pptxWithNotes(): Uint8Array {
  const slide = (text: string) => `<p:sld ${NS}><p:cSld><p:spTree>${shape(null, para(text))}</p:spTree></p:cSld></p:sld>`;
  const notesPage = `<p:notes ${NS}><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
      ${shape('body', para('Start with the story.') + para('Pause on ', '“far country”.') + '<a:p><a:r><a:t>Ask a question</a:t></a:r><a:br/><a:r><a:t>then wait.</a:t></a:r></a:p>')}
      ${shape('sldNum', para('1'))}
    </p:spTree></p:cSld></p:notes>`;
  const files: Record<string, string> = {
    'ppt/presentation.xml': `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(rel('rId2', 'slide', 'slides/slide1.xml'), rel('rId3', 'slide', 'slides/slide2.xml')),
    'ppt/slides/slide1.xml': slide('We all wander'),
    'ppt/slides/_rels/slide1.xml.rels': rels(rel('rId9', 'notesSlide', '../notesSlides/notesSlide1.xml')),
    'ppt/slides/slide2.xml': slide('The Father watches'),
    'ppt/notesSlides/notesSlide1.xml': notesPage
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

describe('slide notes', () => {
  it('brings PowerPoint speaker notes across, one per slide', () => {
    const { presentation, report } = convertPptx(pptxWithNotes(), 'Sermon', { look: 'slides', lyrics: DEFAULT_LYRICS_OPTIONS });
    expect(report.notes).toBe(1);
    const deck = presentationToDeck(presentation, 'd');
    expect(deck.slides.map((s) => s.notes)).toEqual(['Start with the story.\nPause on “far country”.\nAsk a question\nthen wait.', undefined]);
  });

  it('leaves notes out of a PowerPoint imported as words only', () => {
    const { report } = convertPptx(pptxWithNotes(), 'Sermon', { look: 'lyrics', lyrics: DEFAULT_LYRICS_OPTIONS });
    expect(report.notes).toBe(0);
  });

  it('saves notes typed in Edit with the file, where ProPresenter keeps them, and removes blank ones', () => {
    const song = createPresentation('Talk', [{ group: 'Points', slides: ['One', 'Two'] }]);
    const cueId = presentationToDeck(song, 'd').slides[0].cueId;
    const withNotes = parsePresentation(serializePresentation(setSlideNotes(song, cueId, 'Tell the story\nthen ask  \n')));
    const cue = withNotes.cues.find((c) => notesOfCue(c))!;
    // ProPresenter's PresentationSlide.notes: RTF text.
    expect(rtfToPlainText(presentationSlideOfCue(cue)!.notes!.rtfData)).toBe('Tell the story\nthen ask');
    expect(presentationToDeck(withNotes, 'd').slides.map((s) => s.notes)).toEqual(['Tell the story\nthen ask', undefined]);
    // Changing the slide's words keeps its notes; blank notes remove them.
    expect(presentationToDeck(setSlideText(withNotes, cueId, 'One!'), 'd').slides[0].notes).toBe('Tell the story\nthen ask');
    const cleared = setSlideNotes(withNotes, cueId, '   ');
    expect(presentationSlideOfCue(cleared.cues[0])!.notes).toBeUndefined();
    expect(song.cues.every((c) => !presentationSlideOfCue(c)!.notes)).toBe(true); // the original is untouched
  });
});

describe('presenter remote', () => {
  it('lets a presenter move through slides and blank the screen, nothing else', () => {
    const allowed: RemoteCommand[] = [{ type: 'next' }, { type: 'prev' }, { type: 'goto', index: 2 }, { type: 'black' }];
    const refused: RemoteCommand[] = [{ type: 'clear' }, { type: 'clearAll' }, { type: 'openRow', row: 1 }, { type: 'message', text: 'Hi' }, { type: 'timer', action: 'start' }, { type: 'action', action: 'logo' }];
    expect(allowed.every(presenterMay)).toBe(true);
    expect(refused.some(presenterMay)).toBe(false);
  });

  let server: RemoteServer | null = null;
  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  async function start() {
    const commands: Array<[RemoteCommand, RemoteRole]> = [];
    server = new RemoteServer({
      assets: { html: '<html>operator</html>', js: 'js', css: 'css' },
      presenterAssets: { html: '<html>presenter</html>', js: 'pjs', css: 'pcss' },
      pin: () => '111111',
      presenterPin: () => '222222',
      onCommand: (c, role) => commands.push([c, role]),
      picture: (key, i) => (key === 'abcdef1234' && i === 0 ? Buffer.from([0xff, 0xd8, 0xff]) : null)
    });
    const base = `http://127.0.0.1:${await server.start(0, '127.0.0.1')}`;
    const post = (path: string, body: unknown, cookie = '') =>
      fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vessel': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    const login = async (pin: string) => {
      const r = await post('/api/login', { pin });
      return { status: r.status, role: r.ok ? ((await r.json()) as { role: RemoteRole }).role : null, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '' };
    };
    return { base, post, login, commands };
  }

  it('signs in with either PIN, as the operator or the presenter', async () => {
    const { base, login } = await start();
    expect((await login('111111')).role).toBe('operator');
    const p = await login('222222');
    expect(p.role).toBe('presenter');
    expect(await (await fetch(base + '/api/session', { headers: { Cookie: p.cookie } })).json()).toEqual({ role: 'presenter' });
    expect(await (await fetch(base + '/presenter')).text()).toBe('<html>presenter</html>');
    expect((await login('333333')).status).toBe(401);
  });

  it('refuses a presenter anything but their slides and Black, and marks what they send', async () => {
    const { post, login, commands } = await start();
    const { cookie } = await login('222222');
    expect((await post('/api/command', { type: 'next' }, cookie)).status).toBe(204);
    expect((await post('/api/command', { type: 'black' }, cookie)).status).toBe(204);
    expect((await post('/api/command', { type: 'clearAll' }, cookie)).status).toBe(403);
    expect((await post('/api/command', { type: 'openRow', row: 0 }, cookie)).status).toBe(403);
    const operator = await login('111111');
    expect((await post('/api/command', { type: 'clearAll' }, operator.cookie)).status).toBe(204);
    expect(commands).toEqual([
      [{ type: 'next' }, 'presenter'],
      [{ type: 'black' }, 'presenter'],
      [{ type: 'clearAll' }, 'operator']
    ]);
  });

  it('keeps Stream Deck and Companion to the operator PIN', async () => {
    const { base } = await start();
    expect((await fetch(base + '/api/control/next?pin=222222')).status).toBe(401);
    expect((await fetch(base + '/api/control/next?pin=111111')).status).toBe(204);
  });

  it('streams the presenter view and serves slide pictures to signed-in devices only', async () => {
    const { base, login } = await start();
    const state: PresenterState = {
      presentation: { id: 'd', name: 'Sermon', slides: [{ text: 'One', notes: 'Say hello', group: '', enabled: true }], liveIndex: 0, speakingSince: 5 },
      blackout: false,
      pictures: { key: 'abcdef1234', count: 1 }
    };
    server!.setPresenterState(state);
    expect((await fetch(base + '/api/slides/abcdef1234/0.jpg')).status).toBe(401);
    const { cookie } = await login('222222');
    const picture = await fetch(base + '/api/slides/abcdef1234/0.jpg', { headers: { Cookie: cookie } });
    expect(picture.headers.get('content-type')).toBe('image/jpeg');
    expect([...new Uint8Array(await picture.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff]);
    expect((await fetch(base + '/api/slides/abcdef1234/1.jpg', { headers: { Cookie: cookie } })).status).toBe(404);

    const controller = new AbortController();
    const res = await fetch(base + '/api/events', { headers: { Cookie: cookie }, signal: controller.signal });
    const reader = res.body!.getReader();
    let text = '';
    while (!text.includes('event: presenter')) text += new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(/data: (.*)\n/.exec(text)![1]).presentation.slides[0].notes).toBe('Say hello');
    expect(server!.presenterCount).toBe(1);
    controller.abort();
  });

  it('signs out only the presenters when their PIN changes', async () => {
    const { post, login } = await start();
    const presenter = await login('222222');
    const operator = await login('111111');
    server!.signOutRole('presenter');
    expect((await post('/api/command', { type: 'next' }, presenter.cookie)).status).toBe(401);
    expect((await post('/api/command', { type: 'next' }, operator.cookie)).status).toBe(204);
  });
});
