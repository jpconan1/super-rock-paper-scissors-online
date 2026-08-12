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
    offSheet: '/interactive-elements/toggle-sound-off-sheet.webp',
    betweenSheet: '/interactive-elements/toggle-sound-between-sheet.webp',
    onSheet: '/interactive-elements/toggle-sound-on-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });
  toggle.element.classList.add('toggle-button--baked-label');

  return {
    element: toggle.element,
    destroy() {
      toggle.destroy();
    },
  };
}
