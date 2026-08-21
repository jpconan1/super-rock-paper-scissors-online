import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import { createVariantButton } from './variantButton';
import type { LayoutAssetSet } from '../layout/layoutDocument';

export interface VariantGridItemState {
  disabled?: boolean;
  pickedByOpponent?: boolean;
  banned?: boolean;
  overlay?: Node;
  banOwner?: 'played' | 'self' | 'opponent';
}

export interface VariantGridItem {
  slot: SlotId;
  variant: ClientVariantDescriptor;
  state?: VariantGridItemState;
  assets?: LayoutAssetSet;
}

export interface VariantGrid {
  element: HTMLDivElement;
  focus(slot: SlotId): void;
  getButton(slot: SlotId): HTMLButtonElement | undefined;
  update(states: ReadonlyMap<SlotId, VariantGridItemState>): void;
  setOverlay(slot: SlotId, overlay?: Node): void;
  setAllDisabled(disabled: boolean): void;
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
      disabled: item.state?.disabled,
      overlay: item.state?.overlay,
      sheets: item.assets?.up && item.assets.between && item.assets.depressed ? {
        upSheet: item.assets.up, betweenSheet: item.assets.between, depressedSheet: item.assets.depressed,
      } : undefined,
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
    update(states) {
      for (const [slot, control] of controls) {
        const state = states.get(slot);
        control.element.classList.toggle('is-opponent-pick', Boolean(state?.pickedByOpponent));
        control.element.classList.toggle('is-banned', Boolean(state?.banned));
        control.setDisabled(Boolean(state?.disabled));
      }
    },
    setOverlay(slot, content) {
      const button = controls.get(slot)?.element;
      if (!button) return;
      button.querySelector('.variant-button__ban-overlay')?.remove();
      if (!content) return;
      const overlay = document.createElement('span');
      overlay.className = 'variant-button__overlay variant-button__ban-overlay';
      overlay.append(content);
      button.append(overlay);
    },
    setAllDisabled(disabled) { for (const control of controls.values()) control.setDisabled(disabled); },
    setLockedDepressed: (slot, locked) => controls.get(slot)?.setLockedDepressed(locked),
    destroy() {
      for (const control of controls.values()) control.destroy();
      element.remove();
    },
  };
}
