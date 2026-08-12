import type { BoilClock } from '../animation/boilClock';
import { assetLoader } from '../assets/assetLoader';
import { createSoundEffect } from '../audio/soundEffect';
import { createBoilingSprite, type SheetDimensions } from '../renderer/boilingSprite';
import { detectSheetTextAnchor } from '../renderer/textAnchorDetector';
import { setControlDisabled } from './controlDisabled';
import { GameButtonState, type GameButtonVisual } from './gameButtonState';

export interface GameButtonOptions {
  label: string;
  onActivate: () => void;
  upSheet: string;
  betweenSheet: string;
  depressedSheet: string;
  juiceSheet?: string;
  clock: BoilClock;
  depressedSound?: string;
  releasedSound?: string;
}

export interface GameButton {
  element: HTMLButtonElement;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

const DEFAULT_ASPECT_RATIO = 2;
const DEFAULT_JUICE_SHEET = '/interactive-elements/generic-buttons/button-juice-sheet.webp';

export function getButtonFrameAspectRatio(size: SheetDimensions | null): number {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }
  return size.width / size.height;
}

export function createGameButton(options: GameButtonOptions): GameButton {
  const depressedSound = createSoundEffect(options.depressedSound ?? '/audio/button-depressed.mp3');
  const releasedSound = createSoundEffect(options.releasedSound ?? '/audio/button-released.mp3');
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'game-button';
  element.setAttribute('aria-label', options.label);

  const sheets: Record<GameButtonVisual, string> = {
    up: options.upSheet,
    between: options.betweenSheet,
    depressed: options.depressedSheet,
  };
  let frameGeometry: SheetDimensions | null = null;
  const arts = Object.fromEntries(Object.entries(sheets).map(([visual, src]) => {
    const art = createBoilingSprite({
      src,
      clock: options.clock,
      className: `game-button__art game-button__art--${visual}`,
      onFrameSize(size, loadedSrc) {
        if (frameGeometry) {
          if (size.width !== frameGeometry.width || size.height !== frameGeometry.height) {
            console.error(
              `Game button sheet geometry mismatch: expected ${frameGeometry.width}x${frameGeometry.height}, received ${size.width}x${size.height} from ${loadedSrc}.`,
            );
          }
          return;
        }
        frameGeometry = size;
        element.style.aspectRatio = String(getButtonFrameAspectRatio(size));
      },
    });
    art.element.style.visibility = visual === 'up' ? 'visible' : 'hidden';
    return [visual, art];
  })) as Record<GameButtonVisual, ReturnType<typeof createBoilingSprite>>;
  const juice = createBoilingSprite({
    src: options.juiceSheet ?? DEFAULT_JUICE_SHEET,
    clock: options.clock,
    className: 'game-button__juice',
  });
  juice.element.hidden = true;

  const label = document.createElement('span');
  label.className = 'game-button__label';
  label.textContent = options.label;
  element.append(juice.element, ...Object.values(arts).map((art) => art.element), label);
  const artLease = assetLoader.retainUrls(Object.values(sheets));
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
      for (const [visual, art] of Object.entries(arts)) {
        art.element.style.visibility = visual === view.visual ? 'visible' : 'hidden';
      }
      juice.element.hidden = view.juiceOpacity === 0;
      juice.element.style.opacity = String(view.juiceOpacity);
      element.dataset.state = view.visual;
      applyDetectedAnchor(view.visual);
    },
  });

  let activePointer: number | null = null;
  let keyboardHeld = false;
  let requestedDisabled = false;
  let assetsReady = false;
  let destroyed = false;
  const isDisabled = () => requestedDisabled || !assetsReady;
  setControlDisabled(element, true);
  void Promise.all([artLease.ready, ...Object.values(arts).map((art) => art.whenReady())]).then(() => {
    if (destroyed) return;
    assetsReady = true;
    setControlDisabled(element, requestedDisabled);
  }).catch((error) => {
    console.error(`Could not prepare button art for ${options.label}.`, error);
  });

  const isInside = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (isDisabled() || activePointer !== null || event.button !== 0 || !state.press()) return;
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
    if (isDisabled() || (event.key !== ' ' && event.key !== 'Enter') || event.repeat || keyboardHeld) return;
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
    setDisabled(nextDisabled) {
      if (requestedDisabled === nextDisabled) return;
      requestedDisabled = nextDisabled;
      if (requestedDisabled) {
        activePointer = null;
        keyboardHeld = false;
        state.cancel();
      }
      setControlDisabled(element, isDisabled());
    },
    destroy() {
      destroyed = true;
      artLease.release();
      state.destroy();
      depressedSound.destroy();
      releasedSound.destroy();
      for (const art of Object.values(arts)) art.destroy();
      juice.destroy();
      element.remove();
    },
  };
}
