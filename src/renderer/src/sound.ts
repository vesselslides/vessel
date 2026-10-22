// Where Vessel's sound goes (Preferences ▸ Audio and video): the output
// device and a delay, applied to each playing audio or video element.
import { useEffect, type RefObject } from 'react';

export interface SoundRouting {
  /** An audio output device id; '' or undefined is the computer's default. */
  sinkId?: string;
  /** Milliseconds; 0 plays it straight through. */
  delayMs?: number;
}

type SinkElement = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/**
 * A delay needs the element's sound to go through Web Audio, which can only be
 * set up once per element; the graph is kept and adjusted after that.
 */
const graphs = new WeakMap<HTMLMediaElement, { ctx: SinkContext; delay: DelayNode }>();

function graphFor(media: HTMLMediaElement): { ctx: SinkContext; delay: DelayNode } {
  const existing = graphs.get(media);
  if (existing) return existing;
  const ctx = new AudioContext() as SinkContext;
  const delay = ctx.createDelay(1);
  ctx.createMediaElementSource(media).connect(delay).connect(ctx.destination);
  const graph = { ctx, delay };
  graphs.set(media, graph);
  return graph;
}

export function useSoundRouting(ref: RefObject<HTMLMediaElement | null>, { sinkId = '', delayMs = 0 }: SoundRouting, active = true): void {
  useEffect(() => {
    const media = ref.current as SinkElement | null;
    if (!media || !active) return;
    const graph = graphs.get(media) ?? (delayMs > 0 ? graphFor(media) : undefined);
    if (graph) {
      graph.delay.delayTime.value = Math.min(1, Math.max(0, delayMs / 1000));
      void graph.ctx.setSinkId?.(sinkId).catch(() => undefined);
      void graph.ctx.resume().catch(() => undefined);
    } else {
      void media.setSinkId?.(sinkId).catch(() => undefined);
    }
  }, [ref, sinkId, delayMs, active]);

  // The element's audio graph closes with it.
  useEffect(() => {
    const media = ref.current;
    return () => {
      const graph = media && graphs.get(media);
      if (graph) void graph.ctx.close().catch(() => undefined);
    };
  }, [ref]);
}

/** The computer's audio outputs, for the device list in Preferences. */
export async function audioOutputs(): Promise<Array<{ id: string; label: string }>> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Audio output ${i + 1}` }));
  } catch {
    return [];
  }
}
