import type { BoilClock } from '../animation/boilClock';
import { createSoundEffect } from '../audio/soundEffect';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { detectSheetTextAnchor } from '../renderer/textAnchorDetector';
import { ToggleButtonState, type ToggleButtonVisual } from './toggleButtonState';

export interface ToggleButtonOptions {
  label: string;
  pressed: boolean;
  onChange(pressed: boolean): boolean | void | Promise<boolean | void>;
  offSheet: string;
  betweenSheet: string;
  onSheet: string;
  juiceSheet: string;
  clock: BoilClock;
  depressedSound?: string;
  releasedSound?: string;
}

export interface ToggleButton {
  element: HTMLButtonElement;
  setPressed(pressed: boolean): void;
  destroy(): void;
}

export function createToggleButton(options: ToggleButtonOptions): ToggleButton {
  const depressedSound = createSoundEffect(options.depressedSound ?? '/audio/button-depressed.mp3');
  const releasedSound = createSoundEffect(options.releasedSound ?? '/audio/button-released.mp3');
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'toggle-button';

  const art = createBoilingSprite({ src: options.pressed ? options.onSheet : options.offSheet, clock: options.clock, className: 'toggle-button__art' });
  const juice = createBoilingSprite({ src: options.juiceSheet, clock: options.clock, className: 'toggle-button__juice' });
  juice.element.hidden = true;
  const label = document.createElement('span');
  label.className = 'toggle-button__label';
  label.textContent = options.label;
  element.append(juice.element, art.element, label);

  const sheets: Record<ToggleButtonVisual, string> = {
    off: options.offSheet,
    between: options.betweenSheet,
    on: options.onSheet,
  };
  let currentVisual: ToggleButtonVisual = options.pressed ? 'on' : 'off';

  function applyAnchor(visual: ToggleButtonVisual): void {
    void detectSheetTextAnchor(sheets[visual], 'colored').then((anchor) => {
      if (currentVisual !== visual) return;
      label.style.setProperty('--label-x', `${anchor.xPercent}%`);
      label.style.setProperty('--label-y', `${anchor.yPercent}%`);
      label.style.setProperty('--label-width', `${anchor.widthPercent * 0.86}%`);
    });
  }

  const state = new ToggleButtonState({
    pressed: options.pressed,
    change(pressed) {
      if (!pressed) releasedSound.play();
      void Promise.resolve(options.onChange(pressed)).then((actual) => {
        if (actual === false && pressed) state.setPressed(false);
        if (pressed && actual !== false) depressedSound.play();
      });
    },
    render(view) {
      currentVisual = view.visual;
      art.setSource(sheets[view.visual]);
      juice.element.hidden = view.juiceOpacity === 0;
      juice.element.style.opacity = String(view.juiceOpacity);
      element.dataset.state = view.visual;
      element.setAttribute('aria-label', `${options.label}: ${view.pressed ? 'on' : 'off'}`);
      element.setAttribute('aria-pressed', String(view.pressed));
      applyAnchor(view.visual);
    },
  });

  let suppressClick = false;
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    suppressClick = true;
    state.toggle();
    event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return;
    state.toggle();
    event.preventDefault();
  };
  const onClick = () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    state.toggle();
  };
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('click', onClick);

  return {
    element,
    setPressed: (pressed) => state.setPressed(pressed),
    destroy() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('click', onClick);
      state.destroy();
      depressedSound.destroy();
      releasedSound.destroy();
      art.destroy();
      juice.destroy();
      element.remove();
    },
  };
}
