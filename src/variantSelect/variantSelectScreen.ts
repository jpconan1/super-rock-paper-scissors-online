import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import type { CurtainWipe } from '../renderer/curtainWipe';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createMenuCanvas, MENU_LAYOUTS } from '../layout/menuLayout';
import { createVariantDetail, type VariantDetail } from './variantDetail';
import { createVariantGrid, type VariantGrid, type VariantGridItemState } from './variantGrid';
import { createGameButton } from '../input/gameButton';

export type VariantSelectMode = 'computer' | 'online-pick' | 'ban' | 'tutorial' | 'showcase';

export interface VariantSelectScreenOptions {
  container: HTMLElement;
  variants: ReadonlyMap<SlotId, ClientVariantDescriptor>;
  clock: BoilClock;
  curtain: CurtainWipe;
  mode?: VariantSelectMode;
  states?: ReadonlyMap<SlotId, VariantGridItemState>;
  onBack: () => void;
  onConfirm: (slot: SlotId) => void;
  showBack?: boolean;
}

export interface VariantSelectScreen {
  element: HTMLElement;
  destroy(): void;
}

export const VARIANT_SELECT_LAYOUTS = MENU_LAYOUTS;

export function mountVariantSelectScreen(options: VariantSelectScreenOptions): VariantSelectScreen {
  const lifecycle = new AbortController();
  const element = document.createElement('section');
  element.className = 'variant-select-screen';
  element.dataset.mode = options.mode ?? 'showcase';
  element.setAttribute('aria-label', 'Choose Variant');
  const canvas = createMenuCanvas(element, 'variant-select-screen');
  const composition = canvas.composition;
  const header = createBoilingSprite({
    src: options.mode === 'ban'
      ? '/visual-elements/variant-screen/ban-variant-header-sheet.webp'
      : '/visual-elements/variant-screen/pick-variant-header-sheet.webp',
    clock: options.clock,
    className: 'variant-select-screen__header',
    alt: options.mode === 'ban' ? 'Ban Variant' : 'Pick Variant',
  });
  const banSprites: ReturnType<typeof createBoilingSprite>[] = [];
  const banTimers: number[] = [];
  const items = [...options.variants].map(([slot, variant]) => {
    const state = options.states?.get(slot);
    if (!state?.banned || state.overlay) return { slot, variant, state };
    const mark = createBoilingSprite({
      src: '/visual-elements/ban-animation/frame-1_sheet.webp', clock: options.clock,
      className: 'variant-ban-mark', alt: 'Banned',
    });
    banSprites.push(mark);
    for (let frame = 2; frame <= 8; frame++) banTimers.push(window.setTimeout(() => {
      mark.setSource(`/visual-elements/ban-animation/${frame === 8 ? 'x' : `frame-${frame}`}_sheet.webp`);
    }, (frame - 1) * 58));
    return { slot, variant, state: { ...state, overlay: mark.element } };
  });
  let selected: SlotId | undefined;
  let detail: VariantDetail | undefined;
  let foregroundCleanup: (() => void) | undefined;
  let selectedPlaceholder: HTMLDivElement | undefined;
  let selectedResizeObserver: ResizeObserver | undefined;
  let selectedPositioner: (() => void) | undefined;
  let confirmed = false;

  const grid: VariantGrid = createVariantGrid(items, options.clock, (slot) => void select(slot));
  const back = createGameButton({
    label: 'Back', onActivate: options.onBack, clock: options.clock,
    upSheet: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp',
  });
  back.element.classList.add('variant-select-screen__back', 'game-button--baked-label');
  back.element.hidden = options.showBack === false;
  composition.append(header.element, grid.element, back.element);
  options.container.replaceChildren(element);

  async function select(slot: SlotId): Promise<void> {
    if (selected || lifecycle.signal.aborted) return;
    if (options.mode === 'ban') { options.onConfirm(slot); return; }
    const descriptor = options.variants.get(slot);
    const source = grid.getButton(slot);
    if (!descriptor || !source) return;
    const selectedButton = source;
    selected = slot;
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
    grid.setLockedDepressed(slot, true);
    const placeholder = document.createElement('div');
    placeholder.className = 'variant-button-placeholder';
    placeholder.style.aspectRatio = getComputedStyle(selectedButton).aspectRatio;
    selectedButton.replaceWith(placeholder);
    selectedPlaceholder = placeholder;
    const foreground = document.createElement('div');
    foreground.className = 'variant-select-foreground';
    foreground.dataset.slot = slot;
    selectedButton.classList.add('variant-select-foreground__button');
    selectedButton.tabIndex = -1;
    const positionSelectedButton = () => {
      const rect = options.curtain.viewportRectToCanvasRect(placeholder.getBoundingClientRect());
      selectedButton.style.left = `${rect.left}px`;
      selectedButton.style.top = `${rect.top}px`;
      selectedButton.style.width = `${rect.width}px`;
      selectedButton.style.height = `${rect.height}px`;
    };
    selectedPositioner = positionSelectedButton;
    positionSelectedButton();
    if (typeof ResizeObserver !== 'undefined') {
      selectedResizeObserver = new ResizeObserver(positionSelectedButton);
      selectedResizeObserver.observe(placeholder);
    }
    globalThis.addEventListener('resize', positionSelectedButton);
    detail = createVariantDetail(descriptor, options.clock, closeDetail, confirm);
    detail.element.hidden = true;
    foreground.append(selectedButton, detail.element);
    foregroundCleanup = options.curtain.mountForeground(foreground);
    try {
      await options.curtain.close(lifecycle.signal);
      if (lifecycle.signal.aborted) return;
      detail.element.hidden = false;
      detail.focus();
    } catch (error) {
      if (!lifecycle.signal.aborted) throw error;
    }

    async function closeDetail(): Promise<void> {
      if (lifecycle.signal.aborted) return;
      detail!.element.hidden = true;
      await options.curtain.open(lifecycle.signal);
      foregroundCleanup?.();
      foregroundCleanup = undefined;
      selectedResizeObserver?.disconnect();
      selectedResizeObserver = undefined;
      globalThis.removeEventListener('resize', positionSelectedButton);
      selectedPositioner = undefined;
      selectedButton.classList.remove('variant-select-foreground__button');
      selectedButton.style.removeProperty('left');
      selectedButton.style.removeProperty('top');
      selectedButton.style.removeProperty('width');
      selectedButton.style.removeProperty('height');
      placeholder.replaceWith(selectedButton);
      selectedPlaceholder = undefined;
      grid.setLockedDepressed(slot, false);
      detail?.destroy();
      detail = undefined;
      selected = undefined;
      element.inert = false;
      element.removeAttribute('aria-hidden');
      grid.focus(slot);
    }

    function confirm(): void {
      if (confirmed || lifecycle.signal.aborted) return;
      confirmed = true;
      options.onConfirm(slot);
    }
  }

  return {
    element,
    destroy() {
      lifecycle.abort();
      canvas.destroy();
      selectedResizeObserver?.disconnect();
      if (selectedPositioner) globalThis.removeEventListener('resize', selectedPositioner);
      foregroundCleanup?.();
      detail?.destroy();
      grid.destroy();
      back.destroy();
      selectedPlaceholder?.remove();
      header.destroy();
      for (const timer of banTimers) window.clearTimeout(timer);
      for (const sprite of banSprites) sprite.destroy();
      element.remove();
    },
  };
}
