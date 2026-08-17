import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { TimedSemanticEvent } from '../../protocol/protocol';
import type { VariantPresentation, VariantPresentationContext } from '../../core/variant';

export function createPlaceholderPresentation(title: string): VariantPresentation<unknown, unknown> {
  let root: HTMLElement | undefined;
  let output: HTMLElement | undefined;
  let context: VariantPresentationContext<unknown> | undefined;
  return {
    preload: async (): Promise<AssetLease> => {
      const lease = assetLoader.retainUrls([]);
      await lease.ready;
      return lease;
    },
    mount(next) {
      context = next;
      root = document.createElement('section');
      root.className = 'shell-screen placeholder-variant';
      root.setAttribute('aria-label', title);
      const heading = document.createElement('h1');
      heading.textContent = title;
      output = document.createElement('output');
      output.textContent = 'Ready';
      const command = document.createElement('button');
      command.type = 'button';
      command.className = 'shell-action';
      command.textContent = 'Test Move';
      command.addEventListener('click', () => context?.send({ type: 'test-move' }));
      root.append(heading, output, command);
      next.container.replaceChildren(root);
    },
    render(projection: unknown, events: readonly TimedSemanticEvent[]) {
      if (!output) return;
      const phase = typeof projection === 'object' && projection && 'phase' in projection
        ? String((projection as { phase: unknown }).phase)
        : 'updated';
      output.textContent = events.length ? `${phase} · ${events[0]!.type}` : phase;
    },
    unmount() { root?.remove(); root = undefined; output = undefined; context = undefined; },
  };
}
