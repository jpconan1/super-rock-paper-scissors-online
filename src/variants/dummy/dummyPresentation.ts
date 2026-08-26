import type { BoilClock } from '../../animation/boilClock';
import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { VariantPresentation } from '../../core/variant';
import type { DummyMove, DummyProjection } from './dummyRules';
import { mountReadyWaiting, type ReadyWaitingController } from '../../renderer/readyWaiting';
import { mountDummyScreen } from './dummyScreen';

export function createDummyPresentation(clock: BoilClock): VariantPresentation<DummyProjection, DummyMove> {
  let cleanup: (() => void) | undefined;
  let ready: ReadyWaitingController | undefined;
  let root: HTMLElement | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const lease = assetLoader.retainUrls([
        '/variants/dummy/scenes/dummy-scene.webp',
        '/variants/dummy/scenes/split-scenes/dummy-scene-p1-rdy.webp',
        '/variants/dummy/scenes/split-scenes/dummy-scene-p2-rdy.webp',
      ]);
      await lease.ready;
      return lease;
    },
    mount({ container, send, openMenu, self }) {
      cleanup = mountDummyScreen(container, clock, () => send('advance'), openMenu, self ?? 'p1');
      root = container.querySelector<HTMLElement>('.dummy-game') ?? undefined;
      const scene = root?.querySelector<HTMLElement>('.game-layout__slot--scene');
      if (scene) ready = mountReadyWaiting(scene, clock);
    },
    render(projection, events, serverTime) {
      if (!projection?.ready || (projection.self !== 'p1' && projection.self !== 'p2')) return;
      const ownReady = projection.ready[projection.self];
      root?.classList.toggle('dummy-game--locked', ownReady);
      for (const button of root?.querySelectorAll<HTMLButtonElement>('.dummy-game__controls button') ?? []) button.disabled = ownReady;
      ready?.render(projection, events, serverTime);
    },
    unmount() { ready?.destroy(); ready = undefined; cleanup?.(); cleanup = undefined; root = undefined; },
  };
}
