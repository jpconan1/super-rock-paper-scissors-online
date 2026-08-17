import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor } from '../core/variant';
import { createGameButton } from '../input/gameButton';

export interface VariantDetail {
  element: HTMLElement;
  focus(): void;
  destroy(): void;
}

export function createVariantDetail(variant: ClientVariantDescriptor, clock: BoilClock, onBack: () => void, onPlay: () => void): VariantDetail {
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
    upSheet: '/interactive-elements/generic-buttons/generic2-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/generic2-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/generic2-sheet.webp' });
  const play = createGameButton({ label: 'Play', onActivate: onPlay, clock,
    upSheet: '/interactive-elements/generic-buttons/generic3-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/generic3-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/generic3-depressed-sheet.webp' });
  actions.append(back.element, play.element);
  panel.append(copy, actions);
  element.append(panel);
  return {
    element,
    focus: () => back.element.focus(),
    destroy() { back.destroy(); play.destroy(); element.remove(); },
  };
}
