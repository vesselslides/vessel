// NDI® output: the stream picture sent over the network to OBS, vMix, a
// switcher and so on. Vessel doesn't include NDI: it uses the free NDI Runtime
// when the computer has it (it comes with NDI Tools from ndi.video), calling
// its C library through koffi. NDI® is a registered trademark of Vizrt NDI AB.
import { BrowserWindow, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NdiStatus } from '../shared/ndi';

/* eslint-disable @typescript-eslint/no-explicit-any -- koffi's function and struct handles are untyped */
interface NdiLib {
  sendCreate: (settings: unknown) => unknown;
  sendVideo: (instance: unknown, frame: unknown) => void;
  sendDestroy: (instance: unknown) => void;
  connections: (instance: unknown, timeoutMs: number) => number;
}

/** Where the NDI Runtime puts its library on each kind of computer. */
function libraryCandidates(): string[] {
  if (process.platform === 'win32') {
    const dll = process.arch === 'arm64' ? 'Processing.NDI.Lib.arm64.dll' : 'Processing.NDI.Lib.x64.dll';
    const dirs = [process.env.NDI_RUNTIME_DIR_V6, process.env.NDI_RUNTIME_DIR_V5].filter((d): d is string => !!d);
    return [...dirs.map((d) => join(d, dll)), dll];
  }
  if (process.platform === 'darwin') {
    return [process.env.NDI_RUNTIME_DIR_V6, process.env.NDI_RUNTIME_DIR_V5]
      .filter((d): d is string => !!d)
      .map((d) => join(d, 'libndi.dylib'))
      .concat(['/usr/local/lib/libndi.dylib', '/opt/homebrew/lib/libndi.dylib', '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib']);
  }
  return ['libndi.so.6', 'libndi.so.5', 'libndi.so'];
}

let lib: NdiLib | null | undefined;
let loadError = '';

/** Load the NDI Runtime once; null (with the reason in loadError) when it isn't installed. */
function loadNdi(): NdiLib | null {
  if (lib !== undefined) return lib;
  lib = null;
  let koffi: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    koffi = require('koffi');
  } catch (err) {
    loadError = `Vessel couldn’t load its NDI support (${(err as Error).message}).`;
    return null;
  }
  let handle: any = null;
  for (const candidate of libraryCandidates()) {
    // Full paths are tried only where the file is; bare names leave the search to the system.
    if (/[\\/]/.test(candidate) && !existsSync(candidate)) continue;
    try {
      handle = koffi.load(candidate);
      break;
    } catch {
      // Try the next place.
    }
  }
  if (!handle) {
    loadError = 'The NDI Runtime isn’t installed on this computer.';
    return null;
  }
  try {
    // The structs are named so the function signatures below can use them.
    koffi.struct('NDIlib_send_create_t', { p_ndi_name: 'const char *', p_groups: 'const char *', clock_video: 'bool', clock_audio: 'bool' });
    koffi.struct('NDIlib_video_frame_v2_t', {
      xres: 'int',
      yres: 'int',
      FourCC: 'int',
      frame_rate_N: 'int',
      frame_rate_D: 'int',
      picture_aspect_ratio: 'float',
      frame_format_type: 'int',
      timecode: 'int64_t',
      p_data: 'uint8_t *',
      line_stride_in_bytes: 'int',
      p_metadata: 'const char *',
      timestamp: 'int64_t'
    });
    const initialize = handle.func('bool NDIlib_initialize()');
    if (!initialize()) {
      loadError = 'This computer’s processor isn’t supported by NDI.';
      return null;
    }
    lib = {
      sendCreate: handle.func('void *NDIlib_send_create(const NDIlib_send_create_t *p_create_settings)'),
      sendVideo: handle.func('void NDIlib_send_send_video_v2(void *p_instance, const NDIlib_video_frame_v2_t *p_video_data)'),
      sendDestroy: handle.func('void NDIlib_send_destroy(void *p_instance)'),
      connections: handle.func('int NDIlib_send_get_no_connections(void *p_instance, uint32_t timeout_in_ms)')
    };
    return lib;
  } catch (err) {
    loadError = `The NDI Runtime on this computer couldn’t be used (${(err as Error).message}).`;
    lib = null;
    return null;
  }
}

const FOURCC_BGRA = 0x41524742; // 'B' 'G' 'R' 'A'
const PROGRESSIVE = 1;
const TIMECODE_SYNTHESIZE = 9223372036854775807n;
const FPS = 30;

export interface NdiOptions {
  name: string;
  width: number;
  height: number;
  /** The picture has see-through parts: undo Chromium's premultiplied alpha, as NDI expects plain colour. */
  seeThrough: boolean;
  preload: string;
  /** Load the page to send (the stream page) into the off-screen window. */
  load: (win: BrowserWindow) => void;
}

/** Turn premultiplied BGRA into plain BGRA, in place (only partly see-through pixels change). */
export function unpremultiply(data: Uint8Array): void {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a === 0 || a === 255) continue;
    const k = 255 / a;
    data[i - 3] = Math.min(255, Math.round(data[i - 3] * k));
    data[i - 2] = Math.min(255, Math.round(data[i - 2] * k));
    data[i - 1] = Math.min(255, Math.round(data[i - 1] * k));
  }
}

/** Sends one off-screen window's picture as an NDI source. */
export class NdiSender {
  private win: BrowserWindow | null = null;
  private instance: unknown = null;
  private frames = 0;
  private lastFrame: NativeImage | null = null;
  private resend: NodeJS.Timeout | null = null;

  constructor(private readonly opts: NdiOptions) {}

  /** The off-screen window, to send it the live picture. */
  get window(): BrowserWindow | null {
    return this.win;
  }

  start(): NdiStatus {
    const ndi = loadNdi();
    if (!ndi) return { state: 'unavailable', message: loadError };
    this.instance = ndi.sendCreate({ p_ndi_name: this.opts.name, p_groups: null, clock_video: false, clock_audio: false });
    if (!this.instance) return { state: 'error', message: 'NDI couldn’t start a source with that name.' };
    const win = new BrowserWindow({
      width: this.opts.width,
      height: this.opts.height,
      show: false,
      transparent: true,
      frame: false,
      useContentSize: true,
      webPreferences: { offscreen: true, sandbox: false, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false, preload: this.opts.preload }
    });
    this.win = win;
    win.webContents.setFrameRate(FPS);
    win.webContents.setAudioMuted(true);
    // Nothing goes out until the page has loaded, so receivers never see a blank frame.
    let ready = false;
    win.webContents.once('did-finish-load', () => (ready = true));
    win.webContents.on('paint', (_e, _dirty, image) => ready && this.send(image));
    this.opts.load(win);
    // A still picture paints once; receivers still want frames, so the last one is sent again.
    this.resend = setInterval(() => this.lastFrame && this.send(this.lastFrame, true), 1000 / 5);
    return this.status();
  }

  private send(image: NativeImage, again = false): void {
    const ndi = lib;
    if (!ndi || !this.instance) return;
    if (!again) this.lastFrame = image;
    const { width, height } = image.getSize();
    if (!width || !height) return;
    const data = image.toBitmap(); // BGRA, top row first
    if (this.opts.seeThrough) unpremultiply(data);
    ndi.sendVideo(this.instance, {
      xres: width,
      yres: height,
      FourCC: FOURCC_BGRA,
      frame_rate_N: FPS * 1000,
      frame_rate_D: 1000,
      picture_aspect_ratio: width / height,
      frame_format_type: PROGRESSIVE,
      timecode: TIMECODE_SYNTHESIZE,
      p_data: data,
      line_stride_in_bytes: width * 4,
      p_metadata: null,
      timestamp: 0
    });
    this.frames++;
  }

  status(): NdiStatus {
    if (!lib || !this.instance) return { state: 'off' };
    return { state: 'sending', name: this.opts.name, receivers: lib.connections(this.instance, 0), frames: this.frames };
  }

  stop(): void {
    if (this.resend) clearInterval(this.resend);
    this.resend = null;
    this.win?.destroy();
    this.win = null;
    if (lib && this.instance) lib.sendDestroy(this.instance);
    this.instance = null;
    this.lastFrame = null;
  }
}

/** Whether the NDI Runtime can be used here, without sending anything. */
export function ndiAvailable(): { ok: boolean; message: string } {
  return loadNdi() ? { ok: true, message: '' } : { ok: false, message: loadError };
}
