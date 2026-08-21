import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import { createGameButton, type GameButton } from '../input/gameButton';

export interface VariantButtonOptions {
  variant: ClientVariantDescriptor;
  clock: BoilClock;
  onActivate: () => void;
  disabled?: boolean;
  lockedDepressed?: boolean;
  overlay?: Node;
  sheets?: VariantButtonSheets;
}

export interface VariantButtonSheets {
  upSheet: string;
  betweenSheet: string;
  depressedSheet: string;
}

export function variantButtonSheets(assetKey: string): VariantButtonSheets {
  const base = `/interactive-elements/variant-buttons/${assetKey}`;
  const separator = assetKey === 'picktwo' ? '_' : '-';
  return {
    upSheet: `${base}${separator}up-sheet.webp`,
    betweenSheet: `${base}${separator}between-sheet.webp`,
    depressedSheet: `${base}${separator}depressed-sheet.webp`,
  } as const;
}

export function resolveVariantButtonSheets(assetKey: string, sheets?: VariantButtonSheets): VariantButtonSheets {
  return sheets ?? variantButtonSheets(assetKey);
}

export function createVariantButton(options: VariantButtonOptions): GameButton {
  const button = createGameButton({
    label: options.variant.title,
    onActivate: options.onActivate,
    clock: options.clock,
    lockedDepressed: options.lockedDepressed,
    activateAtReleaseStart: true,
    ...resolveVariantButtonSheets(options.variant.buttonAssetKey, options.sheets),
  });
  button.element.classList.add('variant-button', 'game-button--baked-label');
  button.element.dataset.variantId = options.variant.variantId;
  button.setDisabled(Boolean(options.disabled));
  if (options.overlay) {
    const overlay = document.createElement('span');
    overlay.className = 'variant-button__overlay';
    overlay.append(options.overlay);
    button.element.append(overlay);
  }
  return button;
}
