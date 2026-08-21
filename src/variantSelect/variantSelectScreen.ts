import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import type { CurtainWipe } from '../renderer/curtainWipe';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createMenuCanvas, MENU_LAYOUTS } from '../layout/menuLayout';
import { createVariantDetail, type VariantDetail } from './variantDetail';
import { createVariantGrid, type VariantGrid, type VariantGridItemState } from './variantGrid';
import { createGameButton } from '../input/gameButton';
import { getLayoutDocument, variantDetailLayoutDocuments } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';
import { createVariantButton } from './variantButton';
import { createReadyPulse, type ReadyPulse } from '../renderer/readyPulse';
import { createBanMark, type BanMark } from './banMark';

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
  onDetailOpened?: () => void;
  onDetailClosed?: () => void;
  onLocalConfirm?: () => void;
  showBack?: boolean;
}

export interface VariantSelectScreen {
  element: HTMLElement;
  update(states: ReadonlyMap<SlotId, VariantGridItemState>): void;
  isDetailOpen(): boolean;
  showConfirmedWaiting(): void;
  playOpponentReady(slot: SlotId, signal?: AbortSignal): Promise<void>;
  cancelTransientCues(): void;
  syncBanState(state: BanViewState, intro?: boolean, animate?: boolean): Promise<void>;
  promoteSurvivor(slot: SlotId): void;
  destroy(): void;
}

export interface BanViewState {
  readonly played: readonly SlotId[];
  readonly own: readonly SlotId[];
  readonly opponent: readonly SlotId[];
  readonly locked: boolean;
}

export const VARIANT_SELECT_LAYOUTS = MENU_LAYOUTS;

export function mountVariantSelectScreen(options: VariantSelectScreenOptions): VariantSelectScreen {
  const layoutDocument = getLayoutDocument('variant-select');
  const config = (id: string) => layoutDocument.elements.find((element) => element.id === id)!;
  let layoutName: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  let detail: VariantDetail | undefined;
  const lifecycle = new AbortController();
  const element = document.createElement('section');
  element.className = 'variant-select-screen';
  element.dataset.mode = options.mode ?? 'showcase';
  element.setAttribute('aria-label', layoutDocument.copy!.heading!);
  const canvas = createMenuCanvas(element, 'variant-select-screen', (name) => {
    layoutName = name;
    applyDocumentLayout(layoutDocument, layoutName, bindings);
    detail?.setLayout(layoutName);
  });
  const composition = canvas.composition;
  const header = createBoilingSprite({
    src: options.mode === 'ban' ? config('header').assets!.depressed! : config('header').assets!.up!,
    clock: options.clock,
    className: 'variant-select-screen__header',
    alt: options.mode === 'ban' ? 'Ban Variant' : 'Pick Variant',
  });
  const curtainLeft = createBoilingSprite({ src: config('curtain-left').assets!.src!, clock: options.clock, className: 'portrait-curtain-piece', alt: '' });
  const curtainRight = createBoilingSprite({ src: config('curtain-right').assets!.src!, clock: options.clock, className: 'portrait-curtain-piece', alt: '' });
  const items = [...options.variants].map(([slot, variant]) => {
    const state = options.states?.get(slot);
    const assets = config(slot).assets;
    return { slot, variant, state, assets };
  });
  let selected: SlotId | undefined;
  let foregroundButton: ReturnType<typeof createVariantButton> | undefined;
  let foregroundCleanup: (() => void) | undefined;
  let selectedResizeObserver: ResizeObserver | undefined;
  let selectedPositioner: (() => void) | undefined;
  let confirmed = false;
  let cueAbort: AbortController | undefined;
  let cuePulse: ReadyPulse | undefined;
  const banMarks = new Map<SlotId, BanMark>();
  const banOwners = new Map<SlotId, NonNullable<VariantGridItemState['banOwner']>>();
  const animatingBans = new Set<SlotId>();
  let survivorCleanup: (() => void) | undefined;

  const grid: VariantGrid = createVariantGrid(items, options.clock, (slot) => void select(slot));
  const backAssets = config('back').assets!;
  const back = createGameButton({
    label: 'Back', onActivate: options.onBack, clock: options.clock,
    upSheet: backAssets.up!, betweenSheet: backAssets.between!, depressedSheet: backAssets.depressed!,
  });
  back.element.classList.add('variant-select-screen__back', 'game-button--baked-label');
  back.element.hidden = options.showBack === false;
  const slotButtons = [...options.variants.keys()].flatMap((slot) => {
    const button = grid.getButton(slot);
    return button ? [button] : [];
  });
  composition.append(header.element, ...slotButtons, back.element, curtainLeft.element, curtainRight.element);
  const banCounter = options.mode === 'ban' ? createBoilingSprite({
    src: '/visual-elements/ban-animation/times3-sheet.webp', clock: options.clock,
    className: 'variant-ban-counter', alt: '3 bans remaining',
  }) : undefined;
  if (banCounter) { banCounter.element.hidden = true; composition.append(banCounter.element); }
  bindings.push(
    { id: 'header', element: header.element },
    { id: 'back', element: back.element },
    { id: 'curtain-left', element: curtainLeft.element },
    { id: 'curtain-right', element: curtainRight.element },
    ...[...options.variants.keys()].flatMap((slot) => {
      const button = grid.getButton(slot);
      return button ? [{ id: slot, element: button }] : [];
    }),
  );
  applyDocumentLayout(layoutDocument, layoutName, bindings);
  options.container.replaceChildren(element);

  async function select(slot: SlotId): Promise<void> {
    if (selected || lifecycle.signal.aborted) return;
    if (options.mode === 'ban') { options.onConfirm(slot); return; }
    const descriptor = options.variants.get(slot);
    const source = grid.getButton(slot);
    if (!descriptor || !source) return;
    const slotAssets = config(slot).assets;
    foregroundButton = createVariantButton({
      variant: descriptor,
      clock: options.clock,
      onActivate: () => {},
      lockedDepressed: true,
      sheets: slotAssets?.up && slotAssets.between && slotAssets.depressed ? {
        upSheet: slotAssets.up,
        betweenSheet: slotAssets.between,
        depressedSheet: slotAssets.depressed,
      } : undefined,
    });
    const selectedButton = foregroundButton.element;
    selected = slot;
    options.onDetailOpened?.();
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
    grid.setLockedDepressed(slot, true);
    const foreground = document.createElement('div');
    foreground.className = 'variant-select-foreground';
    foreground.dataset.slot = slot;
    selectedButton.classList.add('variant-select-foreground__button');
    selectedButton.tabIndex = -1;
    const positionSelectedButton = () => {
      foreground.dataset.layout = options.curtain.getLayout();
      const rect = options.curtain.viewportRectToCanvasRect(source.getBoundingClientRect());
      selectedButton.style.left = `${rect.left}px`;
      selectedButton.style.top = `${rect.top}px`;
      selectedButton.style.width = `${rect.width}px`;
      selectedButton.style.height = `${rect.height}px`;
    };
    selectedPositioner = positionSelectedButton;
    positionSelectedButton();
    if (typeof ResizeObserver !== 'undefined') {
      selectedResizeObserver = new ResizeObserver(positionSelectedButton);
      selectedResizeObserver.observe(source);
    }
    globalThis.addEventListener('resize', positionSelectedButton);
    detail = createVariantDetail(descriptor, options.clock, closeDetail, confirm, {
      layoutDocument, orientation: layoutName,
      contentDocument: variantDetailLayoutDocuments.find((candidate) => {
        const variantDocument = getLayoutDocument(candidate.copy!.variantDocumentId!);
        return variantDocument.copy?.variantId === descriptor.variantId;
      }),
      onlineSelect: options.mode === 'online-pick',
    });
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
      foregroundButton?.destroy();
      foregroundButton = undefined;
      grid.setLockedDepressed(slot, false);
      detail?.destroy();
      detail = undefined;
      selected = undefined;
      element.inert = false;
      element.removeAttribute('aria-hidden');
      grid.focus(slot);
      options.onDetailClosed?.();
    }

    function confirm(): void {
      if (confirmed || lifecycle.signal.aborted) return;
      confirmed = true;
      options.onLocalConfirm?.();
      detail?.showWaiting(lifecycle.signal);
      options.onConfirm(slot);
    }
  }

  return {
    element,
    update(states) { grid.update(states); },
    isDetailOpen: () => selected !== undefined,
    showConfirmedWaiting() { detail?.showWaiting(lifecycle.signal); },
    async playOpponentReady(slot, signal) {
      cueAbort?.abort();
      cuePulse?.destroy();
      const button = grid.getButton(slot);
      if (!button || lifecycle.signal.aborted || signal?.aborted) return;
      const controller = new AbortController();
      cueAbort = controller;
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const overlay = document.createElement('span');
      overlay.className = 'variant-button__overlay variant-button__ready-cue';
      const pulse = createReadyPulse(options.clock);
      cuePulse = pulse;
      overlay.append(pulse.element);
      button.append(overlay);
      try { await pulse.playAndReverse(controller.signal); }
      finally {
        signal?.removeEventListener('abort', abort);
        pulse.destroy(); overlay.remove();
        if (cuePulse === pulse) cuePulse = undefined;
        if (cueAbort === controller) cueAbort = undefined;
      }
    },
    cancelTransientCues() { cueAbort?.abort(); cuePulse?.destroy(); cuePulse = undefined; cueAbort = undefined; },
    async syncBanState(state, intro = false, animate = true) {
      if (options.mode !== 'ban' || lifecycle.signal.aborted) return;
      if (intro) { grid.setAllDisabled(true); if (banCounter) banCounter.element.hidden = true; }
      const target = new Map<SlotId, NonNullable<VariantGridItemState['banOwner']>>([
        ...state.played.map((slot) => [slot, 'played'] as const),
        ...state.own.map((slot) => [slot, 'self'] as const),
        ...state.opponent.map((slot) => [slot, 'opponent'] as const),
      ]);
      const work: Promise<void>[] = [];
      for (const [slot, owner] of banOwners) {
        if (target.has(slot) || owner === 'played') continue;
        const mark = banMarks.get(slot);
        if (!mark) continue;
        animatingBans.add(slot);
        const removal = animate ? mark.reverse(lifecycle.signal) : Promise.resolve();
        work.push(removal.then(() => {
          mark.destroy(); banMarks.delete(slot); banOwners.delete(slot); grid.setOverlay(slot);
          animatingBans.delete(slot);
        }));
      }
      for (const [slot, owner] of target) {
        if (banOwners.has(slot)) continue;
        banOwners.set(slot, owner);
        animatingBans.add(slot);
        const mark = createBanMark(options.clock);
        banMarks.set(slot, mark); grid.setOverlay(slot, mark.element);
        const addition = animate ? mark.forward(lifecycle.signal) : Promise.resolve();
        work.push(addition.then(() => { mark.hold(); animatingBans.delete(slot); }));
      }
      updateBanCounter(banCounter, state.own.length);
      if (intro) { grid.setAllDisabled(true); if (banCounter) banCounter.element.hidden = true; }
      else applyBanControls(grid, options.variants.keys(), banOwners, animatingBans, state.own.length, state.locked);
      await Promise.all(work);
      if (lifecycle.signal.aborted) return;
      applyBanControls(grid, options.variants.keys(), target, animatingBans, state.own.length, state.locked);
      if (banCounter) banCounter.element.hidden = state.own.length >= 3;
    },
    promoteSurvivor(slot) {
      survivorCleanup?.();
      const descriptor = options.variants.get(slot);
      const source = grid.getButton(slot);
      const assets = config(slot).assets;
      if (!descriptor || !source) return;
      const clone = createVariantButton({
        variant: descriptor, clock: options.clock, onActivate: () => {}, lockedDepressed: true,
        sheets: assets?.up && assets.between && assets.depressed ? {
          upSheet: assets.up, betweenSheet: assets.between, depressedSheet: assets.depressed,
        } : undefined,
      });
      const foreground = document.createElement('div');
      foreground.className = 'variant-select-foreground variant-select-survivor';
      foreground.dataset.layout = options.curtain.getLayout();
      clone.element.classList.add('variant-select-foreground__button');
      const position = () => {
        const rect = options.curtain.viewportRectToCanvasRect(source.getBoundingClientRect());
        Object.assign(clone.element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      };
      position(); globalThis.addEventListener('resize', position);
      foreground.append(clone.element);
      const clear = options.curtain.mountForeground(foreground);
      survivorCleanup = () => { globalThis.removeEventListener('resize', position); clear(); clone.destroy(); survivorCleanup = undefined; };
    },
    destroy() {
      lifecycle.abort();
      cueAbort?.abort(); cuePulse?.destroy();
      survivorCleanup?.();
      canvas.destroy();
      selectedResizeObserver?.disconnect();
      if (selectedPositioner) globalThis.removeEventListener('resize', selectedPositioner);
      foregroundCleanup?.();
      foregroundButton?.destroy();
      detail?.destroy();
      grid.destroy();
      back.destroy();
      header.destroy();
      curtainLeft.destroy();
      curtainRight.destroy();
      banCounter?.destroy();
      for (const mark of banMarks.values()) mark.destroy();
      element.remove();
    },
  };
}

function updateBanCounter(counter: ReturnType<typeof createBoilingSprite> | undefined, used: number): void {
  if (!counter) return;
  const remaining = Math.max(0, 3 - used);
  counter.element.setAttribute('aria-label', `${remaining} bans remaining`);
  counter.element.hidden = remaining === 0;
  if (remaining > 0) counter.setSource(`/visual-elements/ban-animation/times${remaining}-sheet.webp`);
}

function applyBanControls(
  grid: VariantGrid,
  slots: Iterable<SlotId>,
  owners: ReadonlyMap<SlotId, NonNullable<VariantGridItemState['banOwner']>>,
  animating: ReadonlySet<SlotId>,
  ownCount: number,
  locked: boolean,
): void {
  grid.update(new Map([...slots].map((slot) => {
    const owner = owners.get(slot);
    return [slot, {
      banOwner: owner,
      banned: Boolean(owner),
      disabled: locked || animating.has(slot) || (owner !== undefined && owner !== 'self') || (!owner && ownCount >= 3),
    }];
  })));
}
