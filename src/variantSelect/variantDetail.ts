import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import { createGameButton } from '../input/gameButton';
import type { LayoutDocument, LayoutOrientation } from '../layout/layoutDocument';
import { applyConfiguredElement } from '../layout/layoutRuntime';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createReadyPulse, type ReadyPulse } from '../renderer/readyPulse';

export interface VariantDetail {
  element: HTMLElement;
  panel: HTMLElement;
  focus(): void;
  showWaiting(signal?: AbortSignal): void;
  setLayout(orientation: LayoutOrientation): void;
  destroy(): void;
}

export interface VariantDetailOptions {
  layoutDocument?: LayoutDocument;
  orientation?: LayoutOrientation;
  interactive?: boolean;
  showActions?: boolean;
  contentDocument?: LayoutDocument;
  onlineSelect?: boolean;
}

export function createVariantDetail(
  variant: Pick<ClientVariantDescriptor, 'title' | 'rulesCopy'>,
  clock: BoilClock,
  onBack: () => void,
  onPlay: () => void,
  options: VariantDetailOptions = {},
): VariantDetail {
  const element = document.createElement('section');
  element.className = 'variant-detail';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', `${variant.title} rules`);
  const panel = document.createElement('div');
  panel.className = 'alert-box variant-detail__panel';
  const copy = document.createElement('div');
  copy.className = 'variant-detail__copy';
  for (const [index, line] of variant.rulesCopy.entries()) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    if (index === 0) paragraph.className = 'variant-detail__lead';
    copy.append(paragraph);
  }
  const actions = document.createElement('div');
  actions.className = 'variant-detail__actions';
  const back = createGameButton({ label: 'Back', onActivate: onBack, clock,
    upSheet: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp' });
  back.element.classList.add('game-button--baked-label');
  const play = createGameButton({ label: options.onlineSelect ? 'Select' : 'Play', onActivate: onPlay, clock,
    upSheet: options.onlineSelect ? '/new-buttons/select-button-up-sheet.webp' : '/interactive-elements/menu-buttons/variant-play-button-up-sheet.webp',
    betweenSheet: options.onlineSelect ? '/new-buttons/select-button-between-sheet.webp' : '/interactive-elements/menu-buttons/variant-play-button-between-sheet.webp',
    depressedSheet: options.onlineSelect ? '/new-buttons/select-button-depressed-sheet.webp' : '/interactive-elements/menu-buttons/variant-play-button-depressed-sheet.webp' });
  play.element.classList.add('game-button--baked-label');
  actions.append(back.element, play.element);
  actions.hidden = options.showActions === false;
  if (options.interactive === false) {
    back.setDisabled(true);
    play.setDisabled(true);
    back.element.tabIndex = -1;
    play.element.tabIndex = -1;
  }
  const contentCleanups: (() => void)[] = [];
  let readyPulse: ReadyPulse | undefined;
  const contentBindings: { config: LayoutDocument['elements'][number]; element: HTMLElement }[] = [];
  if (options.contentDocument) {
    panel.className = 'variant-detail__custom-content';
    for (const config of options.contentDocument.elements) {
      if (config.binding === 'selected-variant-button') continue;
      let content: HTMLElement;
      if (config.binding === 'variant-rules') {
        content = copy;
        content.classList.add('alert-box');
      } else if ((config.type === 'sprite' || config.type === 'decoration') && config.assets?.src) {
        const sprite = createBoilingSprite({ src: config.assets.src, alt: config.alt ?? '', clock });
        content = sprite.element;
        contentCleanups.push(() => sprite.destroy());
      } else {
        content = document.createElement('div');
        content.textContent = config.label ?? '';
      }
      content.classList.add('variant-detail__content-item');
      panel.append(content);
      contentBindings.push({ config, element: content });
    }
    element.classList.add('variant-detail--custom');
    element.append(panel, actions);
  } else {
    panel.append(copy, actions);
    element.append(panel);
  }
  const setLayout = (orientation: LayoutOrientation) => {
    if (options.contentDocument) {
      for (const binding of contentBindings) applyConfiguredElement(binding.element, binding.config, orientation);
      return;
    }
    const config = options.layoutDocument?.elements.find((candidate) => candidate.id === 'rules-panel');
    if (config) {
      applyConfiguredElement(panel, config, orientation);
      const height = config.layouts[orientation].height;
      panel.style.minHeight = `${height}px`;
      panel.style.maxHeight = `${height}px`;
    }
  };
  if (options.orientation) setLayout(options.orientation);
  return {
    element,
    panel,
    focus: () => back.element.focus(),
    showWaiting(signal) {
      if (readyPulse) return;
      back.element.style.visibility = 'hidden';
      back.element.tabIndex = -1;
      play.element.hidden = true;
      const waiting = document.createElement('div');
      waiting.className = 'alert-box variant-detail__waiting';
      waiting.textContent = 'Waiting for opponent';
      const readySlot = document.createElement('div');
      readySlot.className = 'variant-detail__ready-slot';
      readyPulse = createReadyPulse(clock);
      readySlot.append(readyPulse.element);
      actions.append(readySlot);
      element.append(waiting);
      void readyPulse.playAndHold(signal);
    },
    setLayout,
    destroy() { readyPulse?.destroy(); back.destroy(); play.destroy(); contentCleanups.forEach((cleanup) => cleanup()); element.remove(); },
  };
}
