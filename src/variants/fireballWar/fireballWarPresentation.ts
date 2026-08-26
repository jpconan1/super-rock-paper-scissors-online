import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { VariantPresentation } from '../../core/variant';
import type { BoilClock } from '../../animation/boilClock';
import { mountFireballWarScreen } from './fireballWarScreen';

export function createFireballWarPresentation(clock: BoilClock): VariantPresentation<unknown, unknown> {
  let cleanup: (() => void) | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const lease = assetLoader.preloadBundle('variant:fireball-war');
      await lease.ready;
      return lease;
    },
    mount({ container, send, openMenu, self }) {
      cleanup = mountFireballWarScreen(container, clock, (move) => send({ type: 'move', move }), openMenu, self ?? 'p1');
    },
    render() {},
    unmount() { cleanup?.(); cleanup = undefined; },
  };
}
