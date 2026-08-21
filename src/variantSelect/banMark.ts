import type { BoilClock } from '../animation/boilClock';
import { AnimationPlayer } from '../animation/animationPlayer';
import { createBoilingSprite } from '../renderer/boilingSprite';

export const BAN_FRAME_MS = 58;
export const BAN_FORWARD_FRAMES = ['frame-1', 'frame-2', 'frame-3', 'frame-4', 'frame-5', 'frame-6', 'frame-7', 'x'] as const;
export const BAN_REVERSE_FRAMES = ['x', 'frame-7', 'frame-6', 'frame-5', 'frame-4', 'frame-3', 'frame-2', 'frame-1'] as const;
const source = (frame: string) => `/visual-elements/ban-animation/${frame}_sheet.webp`;

export interface BanMark {
  readonly element: HTMLElement;
  forward(signal?: AbortSignal): Promise<void>;
  reverse(signal?: AbortSignal): Promise<void>;
  hold(): void;
  destroy(): void;
}

export function createBanMark(clock: BoilClock): BanMark {
  const sprite = createBoilingSprite({ src: source('frame-1'), clock, className: 'variant-ban-mark', alt: 'Banned' });
  const player = new AnimationPlayer<string>({ commit: (frame) => sprite.setSource(source(frame)) });
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let destroyed = false;
  const play = async (frames: readonly string[], signal?: AbortSignal) => {
    if (destroyed || signal?.aborted) return;
    const abort = () => player.cancel();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (reducedMotion) player.commit(frames.at(-1)!);
      else await player.play(frames.map((value) => ({ value, durationMs: BAN_FRAME_MS })));
    } finally { signal?.removeEventListener('abort', abort); }
  };
  return {
    element: sprite.element,
    forward: (signal) => play(BAN_FORWARD_FRAMES, signal),
    reverse: (signal) => play(BAN_REVERSE_FRAMES, signal),
    hold: () => player.commit('x'),
    destroy() { destroyed = true; player.cancel(); sprite.destroy(); },
  };
}
