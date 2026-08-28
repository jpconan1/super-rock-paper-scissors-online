import type { BoilClock } from '../animation/boilClock';
import { AnimationPlayer } from '../animation/animationPlayer';
import { catalogSound } from '../audio/soundCatalog';
import { createBoilingSprite } from './boilingSprite';

const STEP_MS = 58;
const REVERSE_HOLD_MS = 750;
const FORWARD = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
const REVERSE = ['6', '5', '4', '3', '2', '1'] as const;
const source = (frame: string) => `/visual-elements/ready-waiting/${frame}_sheet.webp`;

export interface ReadyPulse {
  readonly element: HTMLElement;
  playAndHold(signal?: AbortSignal): Promise<void>;
  playAndReverse(signal?: AbortSignal): Promise<void>;
  destroy(): void;
}

export function createReadyPulse(clock: BoilClock, className = ''): ReadyPulse {
  const sprite = createBoilingSprite({ src: source('1'), clock, className: `ready-pulse__art ${className}`.trim(), alt: 'Ready' });
  const sound = catalogSound('ready');
  const player = new AnimationPlayer<string>({ commit: (frame) => sprite.setSource(source(frame)) });
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let destroyed = false;

  const play = async (reverse: boolean, signal?: AbortSignal) => {
    if (destroyed || signal?.aborted) return;
    const abort = () => player.cancel();
    signal?.addEventListener('abort', abort, { once: true });
    sound.play();
    try {
      if (reducedMotion) {
        player.commit('rdy');
        if (reverse) await wait(REVERSE_HOLD_MS, signal);
        return;
      }
      await player.play(FORWARD.map((value) => ({ value, durationMs: STEP_MS })));
      if (reverse && !signal?.aborted) {
        await wait(REVERSE_HOLD_MS, signal);
        if (!signal?.aborted) await player.play(REVERSE.map((value) => ({ value, durationMs: STEP_MS })));
      }
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };

  return {
    element: sprite.element,
    playAndHold: (signal) => play(false, signal),
    playAndReverse: (signal) => play(true, signal),
    destroy() { destroyed = true; player.cancel(); sound.destroy(); sprite.destroy(); },
  };
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, milliseconds);
    signal?.addEventListener('abort', done, { once: true });
    function done() { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
  });
}
