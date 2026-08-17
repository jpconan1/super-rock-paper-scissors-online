import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import { createVariantButton } from './variantButton';

export interface VariantGridItemState {
  disabled?: boolean;
  pickedByOpponent?: boolean;
  banned?: boolean;
  overlay?: Node;
}

export interface VariantGridItem {
  slot: SlotId;
  variant: ClientVariantDescriptor;
  state?: VariantGridItemState;
}

export interface VariantGrid {
  element: HTMLDivElement;
  focus(slot: SlotId): void;
  getButton(slot: SlotId): HTMLButtonElement | undefined;
  setLockedDepressed(slot: SlotId, locked: boolean): void;
  destroy(): void;
}

export function createVariantGrid(items: readonly VariantGridItem[], clock: BoilClock, onSelect: (slot: SlotId) => void): VariantGrid {
  const element = document.createElement('div');
  element.className = 'variant-grid';
  const controls = new Map<SlotId, ReturnType<typeof createVariantButton>>();
  for (const item of items) {
    const control = createVariantButton({
      variant: item.variant,
      clock,
      onActivate: () => onSelect(item.slot),
      disabled: item.state?.disabled || item.state?.banned,
      overlay: item.state?.overlay,
    });
    control.element.dataset.slot = item.slot;
    control.element.classList.toggle('is-opponent-pick', Boolean(item.state?.pickedByOpponent));
    control.element.classList.toggle('is-banned', Boolean(item.state?.banned));
    controls.set(item.slot, control);
    element.append(control.element);
  }
  return {
    element,
    focus: (slot) => controls.get(slot)?.element.focus(),
    getButton: (slot) => controls.get(slot)?.element,
    setLockedDepressed: (slot, locked) => controls.get(slot)?.setLockedDepressed(locked),
    destroy() {
      for (const control of controls.values()) control.destroy();
      element.remove();
    },
  };
}
