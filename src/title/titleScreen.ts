import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createBoilingSprite } from '../renderer/boilingSprite';

export function mountTitleScreen(container: HTMLElement, clock: BoilClock): () => void {
  const screen = document.createElement('section');
  screen.className = 'title-screen';
  screen.setAttribute('aria-labelledby', 'title-screen-heading');

  const heading = document.createElement('h1');
  heading.id = 'title-screen-heading';
  heading.className = 'visually-hidden';
  heading.textContent = 'Super Rock Paper Scissors Online';

  const logo = createBoilingSprite({
    src: '/LOGO_sheet.webp',
    clock,
    className: 'title-screen__logo',
    alt: 'Super Rock Paper Scissors Online',
  });

  let count = 1;
  const counter = document.createElement('output');
  counter.className = 'title-screen__counter';
  counter.value = String(count);
  counter.textContent = String(count);
  counter.setAttribute('aria-live', 'polite');

  const button = createGameButton({
    label: 'ADD ONE',
    onActivate() {
      count += 1;
      counter.value = String(count);
      counter.textContent = String(count);
    },
    upSheet: '/interactive-elements/generic-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-depressed-sheet.webp',
    juiceSheet: '/interactive-elements/button-juice-sheet.webp',
    clock,
  });

  screen.append(heading, logo.element, counter, button.element);
  container.replaceChildren(screen);

  return () => {
    logo.destroy();
    button.destroy();
    screen.remove();
  };
}
