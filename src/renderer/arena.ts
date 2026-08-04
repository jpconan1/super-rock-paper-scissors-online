export const ARENA_REGIONS = [
  'title',
  'p1',
  'p2',
  'scene',
  'status',
  'resources',
  'actions',
  'extras',
  'modal',
  'transition',
] as const;

export type ArenaRegion = typeof ARENA_REGIONS[number];

export interface ArenaDescriptor {
  /** Variant-owned class for small visual adjustments, never layout-mode selection. */
  variantClass: string;
  labelId?: string;
  variables?: Readonly<Record<`--${string}`, string>>;
}

export interface Arena {
  /** Full available viewport and container-query boundary. */
  element: HTMLElement;
  /** Semantic grid inside the query boundary. */
  grid: HTMLElement;
  set(region: ArenaRegion, content: HTMLElement | null): void;
  destroy(): void;
}

export function createArena(descriptor: ArenaDescriptor): Arena {
  const element = document.createElement('div');
  element.className = 'arena-viewport';

  const grid = document.createElement('section');
  grid.className = `arena ${descriptor.variantClass}`;
  if (descriptor.labelId) grid.setAttribute('aria-labelledby', descriptor.labelId);
  for (const [name, value] of Object.entries(descriptor.variables ?? {})) {
    grid.style.setProperty(name, value);
  }
  element.append(grid);

  const mounted = new Map<ArenaRegion, HTMLElement>();

  return {
    element,
    grid,
    set(region, content) {
      const previous = mounted.get(region);
      if (previous) {
        previous.classList.remove('arena__slot', `arena__slot--${region}`);
        previous.remove();
        mounted.delete(region);
      }
      if (!content) return;
      content.classList.add('arena__slot', `arena__slot--${region}`);
      mounted.set(region, content);
      grid.append(content);
    },
    destroy() {
      mounted.clear();
      element.remove();
    },
  };
}
