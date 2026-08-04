import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createTextEntry, isNonBlankText } from '../input/textEntry';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { generateRandomName, replaceWithRandomName } from './randomName';

export function mountTitleScreen(container: HTMLElement, clock: BoilClock, onPlay: () => void): () => void {
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
  const soundToggle = createSoundToggle(clock);

  const nameEntry = createTextEntry({
    label: 'Player name',
    value: generateRandomName(),
    maxLength: 24,
    autocomplete: 'nickname',
    validate: isNonBlankText,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp',
    clock,
  });

  const randomName = createGameButton({
    label: 'RANDOM NAME',
    onActivate: () => replaceWithRandomName(nameEntry.input),
    upSheet: '/interactive-elements/generic-buttons/generic2-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/generic2-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/generic2-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });
  randomName.element.classList.add('title-screen__random-name');

  const entryControls = document.createElement('div');
  entryControls.className = 'title-screen__entry-controls';
  entryControls.append(nameEntry.element, randomName.element);

  const play = () => {
    if (!nameEntry.validate()) {
      nameEntry.focus();
      return;
    }
    onPlay();
  };

  const button = createGameButton({
    label: 'PLAY',
    onActivate: play,
    upSheet: '/interactive-elements/generic-buttons/button1-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/button1-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/button1-depressed-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });

  screen.append(heading, logo.element, soundToggle.element, entryControls, button.element);
  container.replaceChildren(screen);

  return () => {
    logo.destroy();
    soundToggle.destroy();
    randomName.destroy();
    nameEntry.destroy();
    button.destroy();
    screen.remove();
  };
}
