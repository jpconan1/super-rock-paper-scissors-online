import type { BoilClock } from '../../animation/boilClock';
import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { VariantPresentation } from '../../core/variant';
import type { MatchProjection } from '../../protocol/protocol';
import { mountFireballWarScreen } from '../fireballWar/fireballWarScreen';
import type { DummyMove } from './dummyRules';
import { mountReadyWaiting, type ReadyWaitingController } from '../../renderer/readyWaiting';

export function createDummyPresentation(clock: BoilClock): VariantPresentation<MatchProjection, DummyMove> {
  let cleanup: (() => void) | undefined;
  let ready: ReadyWaitingController | undefined;
  let root: HTMLElement | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const lease = assetLoader.preloadBundle('variant:fireball-war');
      await lease.ready;
      return lease;
    },
    mount({ container, send }) {
      cleanup = mountFireballWarScreen(container, clock, send);
      root = container.querySelector<HTMLElement>('.fireball-war') ?? undefined;
      if (root) ready = mountReadyWaiting(root, clock);
    },
    render(projection, events, serverTime) {
      const ownReady = projection.ready[projection.self];
      root?.classList.toggle('dummy-game--locked', ownReady);
      for (const button of root?.querySelectorAll<HTMLButtonElement>('.fireball-war__controls button') ?? []) button.disabled = ownReady;
      ready?.render(projection, events, serverTime);
    },
    unmount() { ready?.destroy(); ready = undefined; cleanup?.(); cleanup = undefined; root = undefined; },
  };
}
