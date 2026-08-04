import type { BoilClock } from '../animation/boilClock';
import { createToggleButton } from './toggleButton';

const STORAGE_KEY = 'super-rps:boil-enabled';

export interface BoilToggle {
  element: HTMLButtonElement;
  destroy(): void;
}

export function isBoilEnabled(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  return storage?.getItem(STORAGE_KEY) !== 'false';
}

export function setBoilEnabled(
  enabled: boolean,
  clock: BoilClock,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  clock.setEnabled(enabled);
  try {
    storage?.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Animation still changes when browser storage is unavailable.
  }
}

export function createBoilToggle(clock: BoilClock): BoilToggle {
  const toggle = createToggleButton({
    label: 'Toggle Boil Animation',
    pressed: clock.isEnabled(),
    onChange: (enabled) => setBoilEnabled(enabled, clock),
    offSheet: '/interactive-elements/generic-buttons/toggle2-off-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/toggle2-between-sheet.webp',
    onSheet: '/interactive-elements/generic-buttons/toggle2-on-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });

  return { element: toggle.element, destroy: toggle.destroy };
}

function safeStorage(): Storage | undefined {
  try {
    const storage = globalThis.localStorage;
    return typeof storage?.getItem === 'function' && typeof storage.setItem === 'function'
      ? storage
      : undefined;
  } catch {
    return undefined;
  }
}
