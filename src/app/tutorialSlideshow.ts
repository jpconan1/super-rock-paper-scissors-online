import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { applyLayoutGeometry, type LayoutDocument } from '../layout/layoutDocument';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import {
  applyAlertGeometry,
  createFixedAlertCanvas,
  type AlertOrientation,
  type ResponsiveAlertGeometry,
} from '../ui/fixedAlertCanvas';

export type TutorialTextStyle = 'heading' | 'subheading' | 'body';
export type TutorialCompletionTrigger = 'move';
export interface TutorialTextBlock { text: string; style: TutorialTextStyle }
export interface TutorialSlide {
  id: string;
  ariaLabel: string;
  content: readonly TutorialTextBlock[];
  layoutDocumentId?: string;
  panel: ResponsiveAlertGeometry;
  highlight?: ResponsiveAlertGeometry;
  completeOn?: TutorialCompletionTrigger;
  back?: boolean;
  next?: boolean;
  nextLabel?: string;
}

export interface TutorialSlideshow {
  element: HTMLElement;
  complete(trigger: TutorialCompletionTrigger): boolean;
  destroy(): void;
}

const NAVIGATION_ART = {
  back: '/tutorial/previous-slide-button-sheet.webp',
} as const;

const NEXT_BUTTON_SHEETS = {
  upSheet: '/variants/abm/next-button-up-sheet.webp',
  betweenSheet: '/variants/abm/next-button-between-sheet.webp',
  depressedSheet: '/variants/abm/next-button-depressed-sheet.webp',
} as const;

export function mountTutorialSlideshow(
  container: HTMLElement,
  background: HTMLElement,
  clock: BoilClock,
  slides: readonly TutorialSlide[],
  onComplete: () => void,
): TutorialSlideshow {
  if (!slides.length) throw new Error('Tutorial slideshow requires at least one slide.');
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const backgroundWasInert = background.inert;
  const panel = document.createElement('section');
  panel.className = 'textbox tutorial-slideshow__panel';
  const highlight = document.createElement('div');
  highlight.className = 'tutorial-slideshow__highlight';
  let orientation: AlertOrientation = 'landscape';
  let index = 0;
  let layoutDocument: LayoutDocument | undefined;
  let layoutNodes = new Map<string, HTMLElement>();
  const canvas = createFixedAlertCanvas(container, 'tutorial-slideshow', (nextOrientation) => {
    orientation = nextOrientation;
    const slide = slides[index];
    if (!slide) return;
    applyAlertGeometry(panel, slide.panel, orientation);
    if (slide.highlight) applyAlertGeometry(highlight, slide.highlight, orientation);
    if (layoutDocument) for (const config of layoutDocument.elements) {
      const node = layoutNodes.get(config.id); if (node) applyLayoutGeometry(node, config.layouts[orientation]);
    }
  });
  const overlay = canvas.element;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = -1;
  const shade = document.createElement('div');
  shade.className = 'tutorial-slideshow__shade';
  const copy = document.createElement('div');
  copy.className = 'tutorial-slideshow__copy';
  const actions = document.createElement('nav');
  actions.className = 'tutorial-slideshow__actions';
  actions.setAttribute('aria-label', 'Tutorial navigation');
  canvas.content.append(shade, highlight, panel);
  background.inert = true;

  let destroyed = false;
  let sprites: BoilingSprite[] = [];
  let gameButtons: GameButton[] = [];
  let visualLayer: HTMLElement | undefined;

  const backButton = (label: string, activate: () => void) => {
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'tutorial-slideshow__button tutorial-slideshow__button--back';
    element.setAttribute('aria-label', label);
    const sprite = createBoilingSprite({ src: NAVIGATION_ART.back, clock, alt: '' });
    sprite.element.setAttribute('aria-hidden', 'true'); sprites.push(sprite); element.append(sprite.element);
    element.addEventListener('click', activate);
    return element;
  };
  const nextButton = (activate: () => void, label = 'Next') => {
    if (label !== 'Next') {
      const element = document.createElement('button');
      element.type = 'button'; element.className = 'tutorial-slideshow__button tutorial-slideshow__button--finish';
      element.textContent = label; element.addEventListener('click', activate);
      return element;
    }
    const button = createGameButton({ label: 'Next', clock, onActivate: activate, ...NEXT_BUTTON_SHEETS });
    button.element.classList.add('tutorial-slideshow__button', 'tutorial-slideshow__button--next', 'game-button--baked-label');
    gameButtons.push(button);
    return button.element;
  };
  const finish = () => { destroy(); onComplete(); };
  const render = () => {
    sprites.forEach((sprite) => sprite.destroy()); sprites = [];
    gameButtons.forEach((button) => button.destroy()); gameButtons = [];
    visualLayer?.remove(); visualLayer = undefined; layoutNodes = new Map(); layoutDocument = undefined;
    const slide = slides[index]!;
    const interactive = slide.completeOn !== undefined;
    overlay.dataset.slideId = slide.id;
    overlay.classList.toggle('tutorial-slideshow--interactive', interactive);
    overlay.setAttribute('aria-modal', String(!interactive));
    background.inert = !interactive;
    panel.classList.toggle('tutorial-slideshow__panel--layout', Boolean(slide.layoutDocumentId));
    panel.setAttribute('aria-label', slide.ariaLabel);
    copy.replaceChildren(...slide.content.map((block) => {
      const node = document.createElement(block.style === 'heading' ? 'h1' : block.style === 'subheading' ? 'h2' : 'p');
      node.className = `tutorial-slideshow__text tutorial-slideshow__text--${block.style}`;
      node.textContent = block.text;
      return node;
    }));
    actions.replaceChildren();
    const advance = () => { if (index === slides.length - 1) finish(); else { index++; render(); } };
    if (slide.layoutDocumentId) {
      layoutDocument = getLayoutDocument(slide.layoutDocumentId);
      visualLayer = document.createElement('div'); visualLayer.className = 'tutorial-slideshow__layout';
      for (const config of [...layoutDocument.elements].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))) {
        let node: HTMLElement;
        if (config.type === 'button' && config.assets?.up && config.assets.between && config.assets.depressed) {
          const button = createGameButton({ label: config.label ?? config.id, clock, onActivate: advance,
            upSheet: config.assets.up, betweenSheet: config.assets.between, depressedSheet: config.assets.depressed });
          button.element.classList.add('tutorial-slideshow__button', 'tutorial-slideshow__button--next', 'tutorial-slideshow__layout-element', 'game-button--baked-label');
          gameButtons.push(button); node = button.element; actions.append(node);
        } else if ((config.type === 'sprite' || config.type === 'decoration') && config.assets?.src) {
          const sprite = createBoilingSprite({ src: config.assets.src, clock, alt: config.alt ?? '',
            className: `tutorial-slideshow__layout-element ${config.className ?? ''}`.trim() });
          if (config.type === 'decoration') sprite.element.setAttribute('aria-hidden', 'true');
          sprites.push(sprite); node = sprite.element; visualLayer.append(node);
        } else {
          node = document.createElement('div');
          node.className = `tutorial-slideshow__layout-element ${config.className ?? ''}`.trim();
          const text = document.createElement('span'); text.textContent = config.label ?? ''; node.append(text);
          visualLayer.append(node);
        }
        node.dataset.layoutId = config.id; layoutNodes.set(config.id, node);
        applyLayoutGeometry(node, config.layouts[orientation]); node.style.zIndex = String(config.layer ?? 0);
      }
      canvas.content.append(visualLayer, actions); panel.replaceChildren(copy);
    } else {
      if (index > 0 && slide.back !== false) actions.append(backButton('Previous', () => { index--; render(); }));
      if (slide.next !== false) actions.append(nextButton(advance, slide.nextLabel));
      panel.replaceChildren(copy, actions);
    }
    applyAlertGeometry(panel, slide.panel, orientation);
    if (slide.highlight) applyAlertGeometry(highlight, slide.highlight, orientation);
    shade.hidden = Boolean(slide.highlight);
    highlight.hidden = !slide.highlight;
    queueMicrotask(() => {
      if (interactive) background.querySelector<HTMLElement>('.abm-controls__move--attack:not([hidden]):not(:disabled)')?.focus();
      else (actions.querySelector('button') ?? panel).focus();
    });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0]!; const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', onKeyDown);

  function destroy() {
    if (destroyed) return;
    destroyed = true; overlay.removeEventListener('keydown', onKeyDown);
    sprites.forEach((sprite) => sprite.destroy()); gameButtons.forEach((button) => button.destroy());
    canvas.destroy(); background.inert = backgroundWasInert;
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  render();
  return {
    element: overlay,
    complete(trigger) {
      if (destroyed || slides[index]?.completeOn !== trigger) return false;
      finish(); return true;
    },
    destroy,
  };
}

export const ABM_TUTORIAL_SLIDES: readonly TutorialSlide[] = [{
  id: 'simultaneous-reveal',
  ariaLabel: 'Simultaneous reveal games',
  panel: {
    landscape: { x: 90, y: 48, width: 780, height: 444 },
    portrait: { x: 30, y: 210, width: 480, height: 540 },
  },
  content: [
    { text: 'Welcome to', style: 'subheading' },
    { text: 'Super Attack Block Mana!', style: 'heading' },
    { text: 'Super ABM is a three-move simultaneous reveal game like Rock Paper Scissors, but with resources and classes.', style: 'body' },
  ],
  layoutDocumentId: 'tutorial-slide-one',
  next: true,
}, {
  id: 'try-a-move',
  ariaLabel: 'Try a move',
  panel: {
    landscape: { x: 330, y: 155, width: 300, height: 120 },
    portrait: { x: 95, y: 390, width: 350, height: 140 },
  },
  highlight: {
    landscape: { x: 225, y: 308, width: 510, height: 222 },
    portrait: { x: 62, y: 666, width: 416, height: 250 },
  },
  content: [{ text: 'Try It Out!', style: 'heading' }],
  back: false,
  next: false,
  completeOn: 'move',
}];

export function tutorialEndingSlide(ending: 'good' | 'bad'): TutorialSlide {
  const label = ending === 'good' ? 'Good Ending' : 'Bad Ending';
  return {
    id: `${ending}-ending`, ariaLabel: label,
    panel: {
      landscape: { x: 330, y: 180, width: 300, height: 180 },
      portrait: { x: 95, y: 390, width: 350, height: 180 },
    },
    content: [{ text: label, style: 'heading' }],
    back: false, next: true, nextLabel: 'Finish',
  };
}
