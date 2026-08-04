import type { BoilClock } from '../animation/boilClock';
import { setControlDisabled } from '../input/controlDisabled';
import { createBoilingSprite } from '../renderer/boilingSprite';

export interface VolumeSlider {
  element: HTMLDivElement;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

const VOLUME_CURVE_EXPONENT = 2;

export function sliderPositionToGain(position: number): number {
  const clamped = Math.max(0, Math.min(1, position));
  return clamped ** VOLUME_CURVE_EXPONENT;
}

export function gainToSliderPosition(gain: number): number {
  const clamped = Math.max(0, Math.min(1, gain));
  return clamped ** (1 / VOLUME_CURVE_EXPONENT);
}

export function createVolumeSlider(
  kind: 'music' | 'sfx',
  clock: BoilClock,
  initialValue = 1,
  onChange: (value: number) => void = () => {},
): VolumeSlider {
  const element = document.createElement('div');
  element.className = 'title-volume-slider';
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', kind === 'music' ? 'Music Volume' : 'Sound Effects Volume');
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');

  const base = createBoilingSprite({
    src: `/title/${kind}-slider-sheet.webp`,
    clock,
    className: 'title-volume-slider__base',
  });

  const fill = document.createElement('div');
  fill.className = 'title-volume-slider__fill';
  const gradient = createBoilingSprite({
    src: '/title/gradient-slider-sheet.webp',
    clock,
    className: 'title-volume-slider__gradient',
  });
  fill.append(gradient.element);
  element.append(base.element, fill);

  let position = gainToSliderPosition(initialValue);
  let disabled = false;
  let activePointer: number | null = null;

  function setPosition(nextPosition: number): void {
    position = Math.max(0, Math.min(1, nextPosition));
    const percentage = Math.round(position * 100);
    fill.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    element.setAttribute('aria-valuenow', String(percentage));
    onChange(sliderPositionToGain(position));
  }

  function setValueFromPointer(event: PointerEvent): void {
    const bounds = element.getBoundingClientRect();
    if (bounds.width > 0) setPosition((event.clientX - bounds.left) / bounds.width);
  }

  function onPointerDown(event: PointerEvent): void {
    if (disabled || activePointer !== null || event.button !== 0) return;
    activePointer = event.pointerId;
    element.setPointerCapture(event.pointerId);
    setValueFromPointer(event);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId === activePointer) setValueFromPointer(event);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disabled) return;
    const step = event.shiftKey ? 0.1 : 0.05;
    const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key)
      ? -1
      : ['ArrowRight', 'ArrowUp'].includes(event.key)
        ? 1
        : 0;
    if (direction !== 0) {
      event.preventDefault();
      setPosition(position + direction * step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setPosition(event.key === 'Home' ? 0 : 1);
    }
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('keydown', onKeyDown);
  setPosition(position);

  return {
    element,
    setDisabled(nextDisabled) {
      const wasDisabled = disabled;
      disabled = nextDisabled;
      if (disabled && !wasDisabled && activePointer !== null) {
        if (element.hasPointerCapture(activePointer)) element.releasePointerCapture(activePointer);
        activePointer = null;
      }
      setControlDisabled(element, disabled);
    },
    destroy() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('keydown', onKeyDown);
      base.destroy();
      gradient.destroy();
      element.remove();
    },
  };
}
