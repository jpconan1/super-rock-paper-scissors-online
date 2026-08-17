import type { BoilClock } from '../animation/boilClock';
import {
  getMusicVolume,
  getSfxVolume,
  preloadMusic,
  setMusicBase,
  setMusicVolume,
  setSfxVolume,
  subscribeAudioState,
} from '../audio/soundEffect';
import { createBoilToggle } from '../input/boilToggle';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createTextEntry, isNonBlankText } from '../input/textEntry';
import { createMenuCanvas } from '../layout/menuLayout';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { generateRandomName } from './randomName';
import { createVolumeSlider } from './volumeSlider';

export type TitleScreenMount = (() => void) & { readonly ready: Promise<void> };

export function mountTitleScreen(container: HTMLElement, clock: BoilClock, onPlay: (playerName: string) => void): TitleScreenMount {
  const screen = document.createElement('section');
  screen.className = 'title-screen';
  screen.setAttribute('aria-labelledby', 'title-screen-heading');

  const canvas = createMenuCanvas(screen, 'title-screen');
  const composition = canvas.composition;

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
  const boilToggle = createBoilToggle(clock);
  const musicVolume = createVolumeSlider('music', clock, getMusicVolume(), setMusicVolume);
  const sfxVolume = createVolumeSlider('sfx', clock, getSfxVolume(), setSfxVolume);
  setMusicBase('drums-bass');
  void preloadMusic('title');
  const unsubscribeAudio = subscribeAudioState(({ enabled }) => {
    musicVolume.setDisabled(!enabled);
    sfxVolume.setDisabled(!enabled);
  });

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
    label: 'Random Name',
    onActivate: () => {
      nameEntry.setValue(generateRandomName());
      nameEntry.focus();
    },
    upSheet: '/interactive-elements/menu-buttons/name-button-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/name-button-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/name-button-depressed-sheet.webp',
    clock,
  });
  randomName.element.classList.add('title-screen__random-name', 'game-button--baked-label');

  const play = () => {
    if (!nameEntry.validate()) {
      nameEntry.focus();
      return;
    }
    onPlay(nameEntry.input.value.trim());
  };

  const enterLobby = createGameButton({
    label: 'Enter Lobby',
    onActivate: play,
    upSheet: '/interactive-elements/menu-buttons/lobby-button-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/lobby-button-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/lobby-button-depressed-sheet.webp',
    clock,
  });
  enterLobby.element.classList.add('game-button--baked-label');

  const primaryActions = document.createElement('div');
  primaryActions.className = 'title-screen__primary-actions';
  primaryActions.append(randomName.element, enterLobby.element);

  const toggles = document.createElement('div');
  toggles.className = 'title-screen__toggles';
  toggles.append(soundToggle.element, musicVolume.element, sfxVolume.element, boilToggle.element);

  const onNameKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    play();
  };
  nameEntry.input.addEventListener('keydown', onNameKeyDown);

  composition.append(logo.element, primaryActions, nameEntry.element, toggles);
  screen.append(heading);
  container.replaceChildren(screen);

  const cleanup = (() => {
    canvas.destroy();
    logo.destroy();
    soundToggle.destroy();
    boilToggle.destroy();
    musicVolume.destroy();
    sfxVolume.destroy();
    unsubscribeAudio();
    randomName.destroy();
    nameEntry.input.removeEventListener('keydown', onNameKeyDown);
    nameEntry.destroy();
    enterLobby.destroy();
    screen.remove();
  }) as TitleScreenMount;
  Object.defineProperty(cleanup, 'ready', { value: logo.whenReady() });
  return cleanup;
}
