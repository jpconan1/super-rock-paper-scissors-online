import letterSource from '../../abm-letter.txt?raw';
import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import { createTextbox } from '../ui/textbox';

export const ABM_LETTER_SEEN_KEY = 'abm-community-letter-2026-09-01-seen';

const VISUALS: Readonly<Record<string, { src: string; alt: string; className: string; boils: boolean }>> = {
  '(s-rps-o logo)': {
    src: '/community-letter/s-rps-o-logo.webp',
    alt: 'Super Rock Paper Scissors Online',
    className: 'abm-letter__s-rps-o-logo',
    boils: true,
  },
  '(meme)': {
    src: '/community-letter/meme-sheet.webp',
    alt: '',
    className: 'abm-letter__meme',
    boils: true,
  },
  '(pic of variant grid)': {
    src: '/community-letter/variant-select-mockup.webp',
    alt: 'Season 1 variant selection grid with Attack Block Mana featured in the centre',
    className: 'abm-letter__variant-grid',
    boils: false,
  },
};

export type AbmLetterBlock =
  | { type: 'heading'; level: 1 | 3; text: string }
  | { type: 'paragraph'; text: string; placeholder: boolean }
  | { type: 'link'; text: string; href: string }
  | { type: 'image'; marker: string; src: string; alt: string; className: string; boils: boolean };

export function parseAbmLetter(source = letterSource): AbmLetterBlock[] {
  return source.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).map((block) => {
    const text = block.trim();
    const visual = VISUALS[text.toLowerCase()];
    if (visual) return { type: 'image', marker: text, ...visual };
    if (text.toLowerCase() === '(discord link)') return { type: 'link', text: 'https://discord.gg/eVrYpqffej', href: 'https://discord.gg/eVrYpqffej' };
    const heading = /^(#|###)\s+([\s\S]+)$/.exec(text);
    if (heading) return { type: 'heading', level: heading[1] === '#' ? 1 : 3, text: heading[2]! };
    const link = /^\[([^\]]+)]\((https:\/\/[^\s)]+)\)$/.exec(text);
    if (link) return { type: 'link', text: link[1]!, href: link[2]! };
    return { type: 'paragraph', text: text.replace(/\n/g, ' '), placeholder: /^\(.+\)$/.test(text) };
  });
}

export function hasSeenAbmLetter(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try { return storage.getItem(ABM_LETTER_SEEN_KEY) === 'true'; }
  catch { return false; }
}

export function markAbmLetterSeen(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(ABM_LETTER_SEEN_KEY, 'true'); }
  catch { /* Storage can be unavailable in privacy-restricted browsers. */ }
}

export function renderAbmLetter(clock: BoilClock, source = letterSource): { element: HTMLElement; sprites: BoilingSprite[] } {
  const article = document.createElement('article');
  article.className = 'abm-letter__content';
  const sprites: BoilingSprite[] = [];
  for (const block of parseAbmLetter(source)) {
    if (block.type === 'image') {
      if (!block.boils) {
        const image = document.createElement('img');
        image.src = block.src; image.alt = block.alt; image.className = `abm-letter__static-image ${block.className}`;
        article.append(image);
        continue;
      }
      const sprite = createBoilingSprite({ src: block.src, alt: block.alt, className: `abm-letter__image ${block.className}`, clock });
      sprites.push(sprite);
      article.append(sprite.element);
      continue;
    }
    if (block.type === 'heading') {
      const element = document.createElement(block.level === 1 ? 'h1' : 'h3');
      element.textContent = block.text;
      article.append(element);
      continue;
    }
    if (block.type === 'link') {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = block.href; link.textContent = block.text; link.target = '_blank'; link.rel = 'noreferrer';
      paragraph.append(link); article.append(paragraph);
      continue;
    }
    const paragraph = document.createElement('p');
    appendInlineLinks(paragraph, block.text);
    if (block.placeholder) paragraph.className = 'abm-letter__placeholder';
    article.append(paragraph);
  }
  return { element: article, sprites };
}

function appendInlineLinks(container: HTMLElement, text: string): void {
  const pattern = /\[([^\]]+)]\((https:\/\/[^\s)]+)\)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    container.append(document.createTextNode(text.slice(cursor, index)));
    const link = document.createElement('a');
    link.href = match[2]!; link.textContent = match[1]!; link.target = '_blank'; link.rel = 'noreferrer';
    container.append(link);
    cursor = index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

export interface AbmLetterModal {
  readonly element: HTMLElement;
  dismiss(): void;
}

export function mountAbmLetterModal(container: HTMLElement, clock: BoilClock, returnFocus?: HTMLElement | null): AbmLetterModal {
  markAbmLetterSeen();
  const backdrop = document.createElement('div');
  backdrop.className = 'abm-letter-modal';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'abm-letter-heading');
  const textbox = createTextbox({ className: 'abm-letter-modal__textbox' });
  const scroll = document.createElement('div');
  scroll.className = 'abm-letter-modal__scroll';
  const letter = renderAbmLetter(clock);
  letter.element.querySelector('h1')?.setAttribute('id', 'abm-letter-heading');
  scroll.append(letter.element);
  const dismissButton = createGameButton({
    label: 'Dismiss', onActivate: () => dismiss(), clock,
    upSheet: '/community-letter/dismiss-button-up-sheet.webp',
    betweenSheet: '/community-letter/dismiss-button-between-sheet.webp',
    depressedSheet: '/community-letter/dismiss-button-depressed-sheet.webp',
  });
  dismissButton.element.classList.add('abm-letter-modal__dismiss', 'game-button--baked-label');
  textbox.element.append(scroll, dismissButton.element);
  backdrop.append(textbox.element);
  container.replaceChildren(backdrop);

  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.removeEventListener('click', onBackdropClick);
    dismissButton.destroy();
    for (const sprite of letter.sprites) sprite.destroy();
    textbox.destroy();
    backdrop.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  const onBackdropClick = (event: MouseEvent) => { if (event.target === backdrop) dismiss(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    dismissButton.element.focus();
  };
  backdrop.addEventListener('click', onBackdropClick);
  document.addEventListener('keydown', onKeyDown, true);
  queueMicrotask(() => dismissButton.element.focus());
  return { element: backdrop, dismiss };
}
