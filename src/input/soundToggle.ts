import type { BoilClock } from '../animation/boilClock';
import { isSoundEnabled, setSoundEnabled } from '../audio/soundEffect';
import { createToggleButton } from './toggleButton';

export interface SoundToggle {
  element: HTMLButtonElement;
  destroy(): void;
}

export function createSoundToggle(clock: BoilClock): SoundToggle {
  const toggle = createToggleButton({
    label: 'Toggle Sound',
    pressed: isSoundEnabled(),
    onChange: setSoundEnabled,
    offSheet: '/interactive-elements/generic-buttons/toggle1-off-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/toggle1-between-sheet.webp',
    onSheet: '/interactive-elements/generic-buttons/toggle1-on-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });

  return {
    element: toggle.element,
    destroy() {
      toggle.destroy();
    },
  };
}
