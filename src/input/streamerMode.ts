import type { BoilClock } from '../animation/boilClock';
import { createToggleButton } from './toggleButton';

const STORAGE_KEY = 'super-rps:streamer-mode';

export interface StreamerModeToggle {
  element: HTMLButtonElement;
  destroy(): void;
}

export function isStreamerModeEnabled(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStreamerModeEnabled(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The current screen still reflects the choice when browser storage is unavailable.
  }
}

export function createStreamerModeToggle(clock: BoilClock, onChange: (enabled: boolean) => void = () => {}): StreamerModeToggle {
  const toggle = createToggleButton({
    label: 'No Communication Mode',
    pressed: isStreamerModeEnabled(),
    onChange: (enabled) => { setStreamerModeEnabled(enabled); onChange(enabled); },
    offSheet: '/interactive-elements/no-communication-toggle-off-sheet.webp',
    betweenSheet: '/interactive-elements/no-communication-toggle-between-sheet.webp',
    onSheet: '/interactive-elements/no-communication-toggle-on-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });
  toggle.element.classList.add('toggle-button--baked-label');
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
