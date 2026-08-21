import { AnimationPlayer } from '../animation/animationPlayer';
import type { BoilClock } from '../animation/boilClock';
import { createBoilingSprite } from './boilingSprite';
import type { CoveredSwap } from './wipeTransition';

const STEP_MS = 58;

// These are composite drawings, not a forward/reverse frame sequence. Order and
// layering match the original canvas renderer. Step 5 is fully white.
export const STARBURST_WIPE_STEPS = [
  ['1-w'],
  ['2-w', '1'],
  ['3-w', '1', '2'],
  ['4-w', '2', '3'],
  ['4-w', '3'],
  ['4-w'],
  ['4', '3-w'],
  ['3', '2-w'],
  ['2', '1-w'],
  ['1'],
] as const;

const source = (name: string) => `/wipes/starburst-wipe/${name}-sheet.webp`;

export async function playStarburstWipe(
  host: HTMLElement,
  clock: BoilClock,
  whileCovered: CoveredSwap,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  const layer = document.createElement('div');
  layer.className = 'starburst-wipe';
  const sprites = [0, 1, 2].map((index) => {
    const sprite = createBoilingSprite({ src: source(STARBURST_WIPE_STEPS[0]![0]), clock, className: 'starburst-wipe__sprite' });
    sprite.element.dataset.layer = String(index);
    if (index > 0) sprite.element.hidden = true;
    layer.append(sprite.element);
    return sprite;
  });
  host.append(layer);
  const paint = (step: readonly string[]) => {
    for (const [index, sprite] of sprites.entries()) {
      const name = step[index];
      sprite.element.hidden = name === undefined;
      if (name !== undefined) sprite.setSource(source(name));
    }
  };
  const player = new AnimationPlayer<readonly string[]>({ commit: paint });
  const abort = () => player.cancel();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    await player.play(STARBURST_WIPE_STEPS.slice(0, 6).map((value) => ({ value, durationMs: STEP_MS })));
    if (signal?.aborted) return;
    await whileCovered();
    paint(STARBURST_WIPE_STEPS[5]);
    await player.play(STARBURST_WIPE_STEPS.slice(6).map((value) => ({ value, durationMs: STEP_MS })));
  } finally {
    signal?.removeEventListener('abort', abort);
    player.cancel();
    for (const sprite of sprites) sprite.destroy();
    layer.remove();
  }
}
