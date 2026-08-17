import type { BoilClock } from '../animation/boilClock';
import {
  getMusicVolume,
  getSfxVolume,
  playMusicInterrupt,
  preloadMusic,
  setMusicBase,
  setMusicTopper,
  setMusicVolume,
  setSfxVolume,
  subscribeAudioState,
} from '../audio/soundEffect';
import { createBoilToggle } from '../input/boilToggle';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createTextEntry, isNonBlankText } from '../input/textEntry';
import { createScaleBox, observeScaleBox } from '../layout/scaleBox';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { generateRandomName } from './randomName';
import { createVolumeSlider } from './volumeSlider';

export type TitleScreenMount = (() => void) & { readonly ready: Promise<void> };

export function mountTitleScreen(container: HTMLElement, clock: BoilClock, onPlay: (playerName: string) => void): TitleScreenMount {
  const screen = document.createElement('section');
  screen.className = 'title-screen';
  screen.setAttribute('aria-labelledby', 'title-screen-heading');

  const composition = document.createElement('div');
  composition.className = 'title-screen__composition';
  const scaleBox = createScaleBox(704, 704, 'title-screen__scale-box');

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
    upSheet: '/interactive-elements/generic-buttons/generic2-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/generic2-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/generic2-sheet.webp',
    clock,
  });
  randomName.element.classList.add('title-screen__random-name');

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
    upSheet: '/interactive-elements/generic-buttons/button1-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/button1-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/button1-depressed-sheet.webp',
    clock,
  });

  const primaryActions = document.createElement('div');
  primaryActions.className = 'title-screen__primary-actions';
  primaryActions.append(randomName.element, enterLobby.element);

  const toggles = document.createElement('div');
  toggles.className = 'title-screen__toggles';
  toggles.append(soundToggle.element, musicVolume.element, sfxVolume.element, boilToggle.element);

  const audioTests = document.createElement('nav');
  audioTests.className = 'title-screen__audio-tests';
  audioTests.setAttribute('aria-label', 'Temporary audio tests');
  const testButton = (label: string, activate: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'title-screen__audio-test';
    button.textContent = label;
    button.addEventListener('click', activate);
    audioTests.append(button);
  };
  testButton('lose sting', () => { void playMusicInterrupt('lose'); });
  testButton('drums', () => setMusicBase('drums'));
  testButton('bass', () => setMusicBase('drums-bass'));
  testButton('var 1', () => setMusicBase('drums-bass-var-1'));
  testButton('var 2', () => setMusicBase('drums-bass-var-2'));
  testButton('var 3', () => setMusicBase('drums-bass-var-3'));
  testButton('var 4', () => setMusicBase('drums-bass-var-4'));
  testButton('var 5', () => setMusicBase('drums-bass-var-5'));
  testButton('sax', () => setMusicBase('drums-bass-sax'));
  testButton('topper 1', () => setMusicTopper('match-point'));
  testButton('topper 2', () => setMusicTopper('double-match-point'));
  testButton('topper off', () => setMusicTopper('none'));

  const onNameKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    play();
  };
  nameEntry.input.addEventListener('keydown', onNameKeyDown);

  composition.append(logo.element, primaryActions, nameEntry.element, toggles, audioTests);
  scaleBox.content.append(composition);
  screen.append(heading, scaleBox.element);
  container.replaceChildren(screen);
  const stopLayout = observeScaleBox(screen, scaleBox);

  const cleanup = (() => {
    stopLayout();
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
