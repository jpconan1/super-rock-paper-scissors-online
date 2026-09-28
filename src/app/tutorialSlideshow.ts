import type { BoilClock } from '../animation/boilClock';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';

export interface TutorialRect { x: number; y: number; width: number; height: number }
export interface TutorialResponsiveRect extends TutorialRect { portrait?: TutorialRect }
export interface TutorialTextPart { text: string; bold?: boolean }
export interface TutorialSlide {
  id: string;
  ariaLabel: string;
  content: readonly TutorialTextPart[];
  panel?: TutorialResponsiveRect;
  highlight?: TutorialResponsiveRect;
  back?: boolean;
  next?: boolean;
}

export interface TutorialSlideshow {
  element: HTMLElement;
  destroy(): void;
}

const NAVIGATION_ART = {
  back: '/tutorial/previous-slide-button-sheet.webp',
  next: '/tutorial/next-slide-button-sheet.webp',
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
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-slideshow';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = -1;
  const shade = document.createElement('div');
  shade.className = 'tutorial-slideshow__shade';
  const highlight = document.createElement('div');
  highlight.className = 'tutorial-slideshow__highlight';
  const panel = document.createElement('section');
  panel.className = 'textbox tutorial-slideshow__panel';
  const copy = document.createElement('p');
  copy.className = 'tutorial-slideshow__copy';
  const actions = document.createElement('nav');
  actions.className = 'tutorial-slideshow__actions';
  actions.setAttribute('aria-label', 'Tutorial navigation');
  overlay.append(shade, highlight, panel);
  container.append(overlay);
  background.inert = true;

  let index = 0;
  let destroyed = false;
  let sprites: BoilingSprite[] = [];

  const orientation = () => container.clientHeight > container.clientWidth ? 'portrait' : 'landscape';
  const rectFor = (rect: TutorialResponsiveRect) => orientation() === 'portrait' && rect.portrait ? rect.portrait : rect;
  const applyRect = (element: HTMLElement, rect?: TutorialResponsiveRect) => {
    if (!rect) {
      element.style.position = element === panel ? 'relative' : 'absolute';
      element.style.removeProperty('left'); element.style.removeProperty('top');
      element.style.removeProperty('width'); element.style.removeProperty('height');
      return;
    }
    const active = rectFor(rect);
    element.style.position = 'absolute';
    element.style.left = `${active.x}px`; element.style.top = `${active.y}px`;
    element.style.width = `${active.width}px`; element.style.height = `${active.height}px`;
  };
  const button = (kind: keyof typeof NAVIGATION_ART, label: string, activate: () => void) => {
    const element = document.createElement('button');
    element.type = 'button'; element.className = `tutorial-slideshow__button tutorial-slideshow__button--${kind}`;
    element.setAttribute('aria-label', label);
    const sprite = createBoilingSprite({ src: NAVIGATION_ART[kind], clock, alt: '' });
    sprite.element.setAttribute('aria-hidden', 'true'); sprites.push(sprite); element.append(sprite.element);
    element.addEventListener('click', activate);
    return element;
  };
  const finish = () => { destroy(); onComplete(); };
  const render = () => {
    sprites.forEach((sprite) => sprite.destroy()); sprites = [];
    const slide = slides[index]!;
    overlay.dataset.slideId = slide.id;
    panel.setAttribute('aria-label', slide.ariaLabel);
    copy.replaceChildren(...slide.content.map((part) => {
      const node = document.createElement(part.bold ? 'strong' : 'span'); node.textContent = part.text; return node;
    }));
    actions.replaceChildren();
    if (index > 0 && slide.back !== false) actions.append(button('back', 'Previous', () => { index--; render(); }));
    if (slide.next !== false) actions.append(button('next', 'Next', () => {
      if (index === slides.length - 1) finish(); else { index++; render(); }
    }));
    panel.replaceChildren(copy, actions);
    applyRect(panel, slide.panel);
    applyRect(highlight, slide.highlight);
    shade.hidden = Boolean(slide.highlight);
    highlight.hidden = !slide.highlight;
    queueMicrotask(() => (actions.querySelector('button') ?? panel).focus());
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
  const onResize = () => { const slide = slides[index]!; applyRect(panel, slide.panel); applyRect(highlight, slide.highlight); };
  const observer = new ResizeObserver(onResize);
  observer.observe(container);
  overlay.addEventListener('keydown', onKeyDown);

  function destroy() {
    if (destroyed) return;
    destroyed = true; observer.disconnect(); overlay.removeEventListener('keydown', onKeyDown);
    sprites.forEach((sprite) => sprite.destroy()); overlay.remove(); background.inert = backgroundWasInert;
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  render();
  return { element: overlay, destroy };
}

export const ABM_TUTORIAL_SLIDES: readonly TutorialSlide[] = [{
  id: 'simultaneous-reveal',
  ariaLabel: 'Simultaneous reveal games',
  content: [
    { text: 'Super ABM is a ' },
    { text: 'simultaneous reveal', bold: true },
    { text: ' game like Rock Paper Scissors. Like RPS, ABM has three moves - Attack, Block and Mana.' },
  ],
  next: true,
}];
