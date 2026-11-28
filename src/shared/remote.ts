// What a phone or tablet sees and can do through the remote control.
import type { TimerState } from './timer';
import { isControlAction, type ControlAction } from './control';

export interface RemoteSlide {
  text: string;
  group: string;
  color?: string;
}

/** Everything the remote page shows; pushed to phones whenever it changes. */
export interface RemoteState {
  presentation: { name: string; slides: RemoteSlide[]; liveIndex: number | null } | null;
  service: { name: string; items: Array<{ name: string; kind: 'header' | 'presentation'; current: boolean; live: boolean }> } | null;
  live: { text: string; cleared: boolean; blackout: boolean };
  next: RemoteSlide | null;
  timer: TimerState;
  message: string;
}

/** Who signed in: the operator (everything) or the person speaking (the presenter view). */
export type RemoteRole = 'operator' | 'presenter';

export interface PresenterSlide {
  text: string;
  notes: string;
  group: string;
  color?: string;
  /** Turned-off slides are passed over by Next and Back. */
  enabled: boolean;
  /** The words as a chord sheet, in the key it's played in, when the slide has chords. */
  chordLines?: Array<{ chords: string; words: string }>;
  /** Slideshows: clicks the slide takes before the next slide. */
  steps?: number;
}

/** What the presenter view shows: the presentation on screen (or about to be), with its notes. */
export interface PresenterState {
  presentation: {
    id: string;
    name: string;
    slides: PresenterSlide[];
    liveIndex: number | null;
    /** When this presentation first went on screen (ms since 1970), for "Speaking 12:48". */
    speakingSince: number | null;
    /** The key it's played in, when it has chords ("A", "B♭m"). */
    key?: string;
    /** Slideshows: clicks made on the live slide, and where each slide's pictures start (one per click). */
    build?: number;
    frames?: number[];
  } | null;
  blackout: boolean;
  /**
   * Why the presenter's buttons wait: the operator locked the remote, none of
   * their items is on screen, or the operator cleared or blacked out the
   * screen. Their slides and notes still show.
   */
  hold?: { reason: 'locked' | 'waiting' | 'cleared' | 'black'; message: string };
  /** Pictures of the slides once drawn, at /api/slides/<key>/<index>.jpg. */
  pictures?: { key: string; count: number };
}

export type RemoteCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'clear' }
  | { type: 'clearAll' }
  | { type: 'black' }
  | { type: 'goto'; index: number }
  | { type: 'openRow'; row: number }
  | { type: 'timer'; action: 'start' | 'pause' | 'reset' }
  | { type: 'message'; text: string }
  /** Anything else a Stream Deck, Companion or MIDI can do. */
  | { type: 'action'; action: ControlAction };

export const MAX_MESSAGE_LENGTH = 200;

/** A presenter can move through their own slides and blank the screen, nothing else. */
export function presenterMay(command: RemoteCommand): boolean {
  return command.type === 'next' || command.type === 'prev' || command.type === 'goto' || command.type === 'black';
}

/** Check untrusted input from the network; returns a clean command or null. */
export function parseRemoteCommand(input: unknown): RemoteCommand | null {
  if (!input || typeof input !== 'object') return null;
  const c = input as Record<string, unknown>;
  const index = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 10_000 ? v : null);
  switch (c.type) {
    case 'next':
    case 'prev':
    case 'clear':
    case 'clearAll':
    case 'black':
      return { type: c.type };
    case 'goto': {
      const i = index(c.index);
      return i === null ? null : { type: 'goto', index: i };
    }
    case 'openRow': {
      const i = index(c.row);
      return i === null ? null : { type: 'openRow', row: i };
    }
    case 'timer':
      return c.action === 'start' || c.action === 'pause' || c.action === 'reset' ? { type: 'timer', action: c.action } : null;
    case 'message':
      return typeof c.text === 'string' ? { type: 'message', text: c.text.slice(0, MAX_MESSAGE_LENGTH) } : null;
    case 'action':
      return isControlAction(c.action) ? { type: 'action', action: c.action } : null;
    default:
      return null;
  }
}

/** Status of the remote server, for the operator's Remote window. */
export interface RemoteStatus {
  enabled: boolean;
  pin: string;
  /** The presenter view's own PIN. */
  presenterPin: string;
  port: number | null;
  /** Addresses to open, the likeliest first (the QR code uses the first). */
  urls: string[];
  /** The same addresses with the network each is on ("Wi-Fi", "vEthernet (WSL)"). */
  links?: RemoteLink[];
  /** Windows only: whether Windows Firewall lets phones reach Vessel. */
  firewall?: FirewallState;
  clients: number;
  /** Of those, how many are presenters. */
  presenters: number;
  error?: string;
}

/** An address a phone can open, and the network it's on. */
export interface RemoteLink {
  url: string;
  network: string;
}

/**
 * What Windows Firewall does with phones reaching Vessel: `allowed`,
 * `blocked` (a block rule, often left by a dismissed "allow access?" prompt),
 * `missing` (no rule yet, so Windows may block it without asking), or `unknown`.
 */
export type FirewallState = 'checking' | 'allowed' | 'blocked' | 'missing' | 'unknown';

/** Adapters a phone on the Wi-Fi can't reach: virtual machines, WSL, VPNs, tunnels. */
const VIRTUAL_NETWORK =
  /vethernet|wsl|hyper-?v|default switch|virtualbox|vbox|vmware|vmnet|docker|tailscale|zerotier|hamachi|wireguard|openvpn|nordlynx|\bvpn|\btap\b|tap-|\btun|utun|bridge|llw|awdl|loopback|bluetooth|npcap|parallels|vnic/i;

const isPrivateLan = (ip: string): boolean => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

type Interfaces = Record<string, Array<{ address: string; family: string | number; internal: boolean }> | undefined>;

/**
 * The IPv4 addresses a phone on the same network might open, likeliest first:
 * real Wi-Fi and Ethernet on a home or church network before virtual adapters
 * and VPNs. Self-assigned (169.254) addresses are left out: that adapter has
 * no network.
 */
export function rankAddresses(interfaces: Interfaces): Array<{ address: string; network: string }> {
  const found: Array<{ address: string; network: string; score: number; order: number }> = [];
  for (const [network, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || a.address.startsWith('169.254.')) continue;
      let score = 0;
      if (VIRTUAL_NETWORK.test(network)) score -= 100;
      if (isPrivateLan(a.address)) score += 10;
      if (/wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d/i.test(network)) score += 5;
      found.push({ address: a.address, network, score, order: found.length });
    }
  }
  return found.sort((a, b) => b.score - a.score || a.order - b.order).map(({ address, network }) => ({ address, network }));
}
