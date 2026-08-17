import { AnimationPlayer } from '../animation/animationPlayer';
import type { BoilClock } from '../animation/boilClock';
import { createBoilingSprite } from './boilingSprite';
import type { CoveredSwap } from './wipeTransition';

const FRAME_MS = 72;
const COVER = [1, 2, 3, 4].map((frame) => `/wipes/starburst-wipe/${frame}-sheet.webp`);
const REVEAL = [4, 3, 2, 1].map((frame) => `/wipes/starburst-wipe/${frame}-w-sheet.webp`);

export async function playStarburstWipe(
  host: HTMLElement,
  clock: BoilClock,
  whileCovered: CoveredSwap,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  const layer = document.createElement('div');
  layer.className = 'starburst-wipe';
  const sprite = createBoilingSprite({ src: COVER[0]!, clock, className: 'starburst-wipe__sprite' });
  layer.append(sprite.element);
  host.append(layer);
  const player = new AnimationPlayer<string>({ commit: (src) => sprite.setSource(src) });
  const abort = () => player.cancel();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    await player.play(COVER.map((value) => ({ value, durationMs: FRAME_MS })));
    if (signal?.aborted) return;
    await whileCovered();
    await player.play(REVEAL.map((value) => ({ value, durationMs: FRAME_MS })));
  } finally {
    signal?.removeEventListener('abort', abort);
    player.cancel();
    sprite.destroy();
    layer.remove();
  }
}
