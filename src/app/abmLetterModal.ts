import letterSource from '../../abm-letter.txt?raw';
import alphaPatchNotesSource from '../../alpha-patch-notes.md?raw';
import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import { createTextbox } from '../ui/textbox';

export const ABM_NEWSLETTER_SEEN_KEY = 'abm-newsletter-super-abm-alpha-seen';

interface NewsletterVisual {
  src: string;
  alt: string;
  className: string;
  boils: boolean;
}

export interface AbmNewsletterPost {
  id: string;
  source: string;
  visuals: Readonly<Record<string, NewsletterVisual>>;
}

const LETTER_VISUALS: Readonly<Record<string, NewsletterVisual>> = {
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

const ALPHA_PATCH_VISUALS: Readonly<Record<string, NewsletterVisual>> = {
  '[rip logo]': {
    src: '/community-letter/rip-s-rps-o-sheet.webp',
    alt: 'Rest in peace, Super Rock Paper Scissors Online',
    className: 'abm-letter__rip-logo',
    boils: true,
  },
};

export const ABM_NEWSLETTER_POSTS: readonly AbmNewsletterPost[] = [
  { id: 'super-abm-alpha', source: alphaPatchNotesSource, visuals: ALPHA_PATCH_VISUALS },
  { id: 'community-letter-2026-09-01', source: letterSource, visuals: LETTER_VISUALS },
];

export type AbmLetterBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string; placeholder: boolean }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'link'; text: string; href: string }
  | { type: 'image'; marker: string; src: string; alt: string; className: string; boils: boolean };

export function parseAbmLetter(source = ABM_NEWSLETTER_POSTS[0]!.source,
  visuals: Readonly<Record<string, NewsletterVisual>> = ABM_NEWSLETTER_POSTS[0]!.visuals): AbmLetterBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').trim().split('\n');
  const blocks: AbmLetterBlock[] = [];
  const isSpecial = (value: string) => {
    const text = value.trim();
    return !text || Boolean(visuals[text.toLowerCase()]) || text.toLowerCase() === '(discord link)'
      || /^#{1,3}\s+/.test(text) || /^-\s+/.test(text) || /^\d+\.\s+/.test(text);
  };
  for (let index = 0; index < lines.length;) {
    const text = lines[index]!.trim();
    if (!text) { index++; continue; }
    const visual = visuals[text.toLowerCase()];
    if (visual) { blocks.push({ type: 'image', marker: text, ...visual }); index++; continue; }
    if (text.toLowerCase() === '(discord link)') {
      blocks.push({ type: 'link', text: 'https://discord.gg/eVrYpqffej', href: 'https://discord.gg/eVrYpqffej' }); index++; continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(text);
    if (heading) { blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! }); index++; continue; }
    const unordered = /^-\s+/.test(text); const ordered = /^\d+\.\s+/.test(text);
    if (unordered || ordered) {
      const pattern = unordered ? /^-\s+/ : /^\d+\.\s+/;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index]!.trim())) items.push(lines[index++]!.trim().replace(pattern, ''));
      blocks.push({ type: 'list', ordered, items }); continue;
    }
    const paragraphLines = [text]; index++;
    while (index < lines.length && !isSpecial(lines[index]!)) paragraphLines.push(lines[index++]!.trim());
    const paragraph = paragraphLines.join(' ');
    const link = /^\[([^\]]+)]\((https:\/\/[^\s)]+)\)$/.exec(paragraph);
    if (link) blocks.push({ type: 'link', text: link[1]!, href: link[2]! });
    else blocks.push({ type: 'paragraph', text: paragraph, placeholder: /^\(.+\)$/.test(paragraph) });
  }
  return blocks;
}

export function hasSeenAbmNewsletter(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try { return storage.getItem(ABM_NEWSLETTER_SEEN_KEY) === 'true'; }
  catch { return false; }
}

export function markAbmNewsletterSeen(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(ABM_NEWSLETTER_SEEN_KEY, 'true'); }
  catch { /* Storage can be unavailable in privacy-restricted browsers. */ }
}

export function renderAbmLetter(clock: BoilClock, post: AbmNewsletterPost = ABM_NEWSLETTER_POSTS[0]!): { element: HTMLElement; sprites: BoilingSprite[] } {
  const article = document.createElement('article');
  article.className = 'abm-letter__content';
  const sprites: BoilingSprite[] = [];
  for (const block of parseAbmLetter(post.source, post.visuals)) {
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
      const element = document.createElement(`h${block.level}`);
      element.textContent = block.text;
      article.append(element);
      continue;
    }
    if (block.type === 'list') {
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const element = document.createElement('li');
        appendInlineLinks(element, item);
        list.append(element);
      }
      article.append(list);
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
  markAbmNewsletterSeen();
  const backdrop = document.createElement('div');
  backdrop.className = 'abm-letter-modal';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'abm-letter-heading');
  const textbox = createTextbox({ className: 'abm-letter-modal__textbox' });
  const scroll = document.createElement('div');
  scroll.className = 'abm-letter-modal__scroll';
  scroll.setAttribute('aria-live', 'polite');
  let postIndex = 0;
  let letter = renderAbmLetter(clock, ABM_NEWSLETTER_POSTS[postIndex]!);
  const previousButton = createGameButton({
    label: 'Previous post', onActivate: () => showPost(postIndex + 1), clock,
    upSheet: '/variants/abm/Prev-button-up-sheet.webp',
    betweenSheet: '/variants/abm/Prev-button-between-sheet.webp',
    depressedSheet: '/variants/abm/Prev-button-depressed-sheet.webp',
  });
  const dismissButton = createGameButton({
    label: 'Dismiss', onActivate: () => dismiss(), clock,
    upSheet: '/community-letter/dismiss-button-up-sheet.webp',
    betweenSheet: '/community-letter/dismiss-button-between-sheet.webp',
    depressedSheet: '/community-letter/dismiss-button-depressed-sheet.webp',
  });
  const nextButton = createGameButton({
    label: 'Next post', onActivate: () => showPost(postIndex - 1), clock,
    upSheet: '/variants/abm/next-button-up-sheet.webp',
    betweenSheet: '/variants/abm/next-button-between-sheet.webp',
    depressedSheet: '/variants/abm/next-button-depressed-sheet.webp',
  });
  previousButton.element.classList.add('abm-letter-modal__previous', 'game-button--baked-label');
  dismissButton.element.classList.add('abm-letter-modal__dismiss', 'game-button--baked-label');
  nextButton.element.classList.add('abm-letter-modal__next', 'game-button--baked-label');
  const controls = document.createElement('div');
  controls.className = 'abm-letter-modal__controls';
  controls.append(previousButton.element, dismissButton.element, nextButton.element);
  textbox.element.append(scroll, controls);
  backdrop.append(textbox.element);
  container.replaceChildren(backdrop);

  function showPost(index: number): void {
    if (index < 0 || index >= ABM_NEWSLETTER_POSTS.length || index === postIndex) return;
    for (const sprite of letter.sprites) sprite.destroy();
    postIndex = index;
    letter = renderAbmLetter(clock, ABM_NEWSLETTER_POSTS[postIndex]!);
    letter.element.querySelector('h1')?.setAttribute('id', 'abm-letter-heading');
    scroll.replaceChildren(letter.element);
    scroll.scrollTop = 0;
    updateNavigation();
    if (document.activeElement === previousButton.element && previousButton.element.disabled) dismissButton.element.focus();
    if (document.activeElement === nextButton.element && nextButton.element.disabled) dismissButton.element.focus();
  }

  function updateNavigation(): void {
    previousButton.setDisabled(postIndex === ABM_NEWSLETTER_POSTS.length - 1);
    nextButton.setDisabled(postIndex === 0);
  }

  letter.element.querySelector('h1')?.setAttribute('id', 'abm-letter-heading');
  scroll.append(letter.element);
  updateNavigation();

  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.removeEventListener('click', onBackdropClick);
    previousButton.destroy();
    dismissButton.destroy();
    nextButton.destroy();
    for (const sprite of letter.sprites) sprite.destroy();
    textbox.destroy();
    backdrop.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  const onBackdropClick = (event: MouseEvent) => { if (event.target === backdrop) dismiss(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...backdrop.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')];
    if (!focusable.length) return;
    const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  backdrop.addEventListener('click', onBackdropClick);
  document.addEventListener('keydown', onKeyDown, true);
  queueMicrotask(() => dismissButton.element.focus());
  return { element: backdrop, dismiss };
}
