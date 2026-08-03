import type { BoilClock } from '../animation/boilClock';
import { createSoundEffect } from '../audio/soundEffect';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { detectSheetTextAnchor } from '../renderer/textAnchorDetector';
import { GameButtonState, type GameButtonVisual } from './gameButtonState';

export interface GameButtonOptions {
  label: string;
  onActivate: () => void;
  upSheet: string;
  betweenSheet: string;
  depressedSheet: string;
  juiceSheet: string;
  clock: BoilClock;
  depressedSound?: string;
  releasedSound?: string;
}

export interface GameButton {
  element: HTMLButtonElement;
  destroy(): void;
}

export function createGameButton(options: GameButtonOptions): GameButton {
  const depressedSound = createSoundEffect(options.depressedSound ?? '/audio/button-depressed.wav');
  const releasedSound = createSoundEffect(options.releasedSound ?? '/audio/button-released.wav');
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'game-button';
  element.setAttribute('aria-label', options.label);

  const art = createBoilingSprite({ src: options.upSheet, clock: options.clock, className: 'game-button__art' });
  const juice = createBoilingSprite({ src: options.juiceSheet, clock: options.clock, className: 'game-button__juice' });
  juice.element.hidden = true;

  const label = document.createElement('span');
  label.className = 'game-button__label';
  label.textContent = options.label;
  element.append(juice.element, art.element, label);

  const sheets: Record<GameButtonVisual, string> = {
    up: options.upSheet,
    between: options.betweenSheet,
    depressed: options.depressedSheet,
  };
  let currentVisual: GameButtonVisual = 'up';

  function applyDetectedAnchor(visual: GameButtonVisual): void {
    void detectSheetTextAnchor(sheets[visual]).then((anchor) => {
      if (visual !== currentVisual) return;
      label.style.setProperty('--label-x', `${anchor.xPercent}%`);
      label.style.setProperty('--label-y', `${anchor.yPercent}%`);
      label.style.setProperty('--label-width', `${anchor.widthPercent * 0.86}%`);
    });
  }

  const state = new GameButtonState({
    activate() {
      releasedSound.play();
      options.onActivate();
    },
    render(view) {
      currentVisual = view.visual;
      art.setSource(sheets[view.visual]);
      juice.element.hidden = view.juiceOpacity === 0;
      juice.element.style.opacity = String(view.juiceOpacity);
      element.dataset.state = view.visual;
      applyDetectedAnchor(view.visual);
    },
  });

  let activePointer: number | null = null;
  let keyboardHeld = false;

  const isInside = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (activePointer !== null || event.button !== 0 || !state.press()) return;
    depressedSound.play();
    activePointer = event.pointerId;
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === activePointer && !isInside(event)) state.leave();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    if (!isInside(event)) state.leave();
    activePointer = null;
    state.release();
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    state.cancel();
  };
  const onLostPointerCapture = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    state.cancel();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat || keyboardHeld) return;
    keyboardHeld = state.press();
    if (keyboardHeld) {
      depressedSound.play();
      event.preventDefault();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || !keyboardHeld) return;
    keyboardHeld = false;
    state.release();
    event.preventDefault();
  };
  const onBlur = () => {
    keyboardHeld = false;
    activePointer = null;
    state.cancel();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('lostpointercapture', onLostPointerCapture);
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('keyup', onKeyUp);
  element.addEventListener('blur', onBlur);

  return {
    element,
    destroy() {
      state.destroy();
      depressedSound.destroy();
      releasedSound.destroy();
      art.destroy();
      juice.destroy();
      element.remove();
    },
  };
}
