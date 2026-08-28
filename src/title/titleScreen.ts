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
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';

const TITLE_LAYOUT = getLayoutDocument('title');
const titleElement = (id: string) => TITLE_LAYOUT.elements.find((element) => element.id === id)!;

export type TitleScreenMount = (() => void) & { readonly ready: Promise<void> };

export function formatOnlinePlayerCount(count: number | null): string { return `players online: ${count ?? '?'}`; }

export function mountTitleScreen(container: HTMLElement, clock: BoilClock, onPlay: (playerName: string) => void,
  getOnlinePlayerCount: () => Promise<number | null> = async () => null): TitleScreenMount {
  const screen = document.createElement('section');
  screen.className = 'title-screen';
  screen.setAttribute('aria-labelledby', 'title-screen-heading');

  let layoutName: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  const applyLayout = () => applyDocumentLayout(TITLE_LAYOUT, layoutName, bindings);
  const canvas = createMenuCanvas(screen, 'title-screen', (name) => { layoutName = name; applyLayout(); });
  const composition = canvas.composition;

  const heading = document.createElement('h1');
  heading.id = 'title-screen-heading';
  heading.className = 'visually-hidden';
  heading.textContent = TITLE_LAYOUT.copy!.heading!;
  const onlineCount = document.createElement('p');
  onlineCount.className = 'title-screen__online-count'; onlineCount.setAttribute('aria-live', 'polite');
  onlineCount.textContent = formatOnlinePlayerCount(null);
  let countStopped = false;
  const updateCount = async () => {
    const count = await getOnlinePlayerCount();
    if (!countStopped) onlineCount.textContent = formatOnlinePlayerCount(count);
  };
  void updateCount();
  const countTimer = window.setInterval(() => void updateCount(), 5_000);

  const logo = createBoilingSprite({
    src: titleElement('logo').assets!.src!,
    clock,
    className: 'title-screen__logo',
    alt: titleElement('logo').alt!,
  });
  const soundToggle = createSoundToggle(clock);
  const boilToggle = createBoilToggle(clock);
  const musicVolume = createVolumeSlider('music', clock, getMusicVolume(), setMusicVolume);
  const sfxVolume = createVolumeSlider('sfx', clock, getSfxVolume(), setSfxVolume);
  setMusicBase('drums');
  void preloadMusic('title');
  const unsubscribeAudio = subscribeAudioState(({ enabled }) => {
    musicVolume.setDisabled(!enabled);
    sfxVolume.setDisabled(!enabled);
  });

  const nameEntry = createTextEntry({
    label: TITLE_LAYOUT.copy!.nameLabel!,
    value: generateRandomName(),
    maxLength: 24,
    autocomplete: 'nickname',
    validate: isNonBlankText,
    sheet: titleElement('name-entry').assets!.src!,
    clock,
  });

  const randomName = createGameButton({
    label: TITLE_LAYOUT.copy!.randomName!,
    onActivate: () => {
      nameEntry.setValue(generateRandomName());
      nameEntry.focus();
    },
    upSheet: titleElement('random-name').assets!.up!,
    betweenSheet: titleElement('random-name').assets!.between!,
    depressedSheet: titleElement('random-name').assets!.depressed!,
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
    label: TITLE_LAYOUT.copy!.enterLobby!,
    onActivate: play,
    upSheet: titleElement('enter-lobby').assets!.up!,
    betweenSheet: titleElement('enter-lobby').assets!.between!,
    depressedSheet: titleElement('enter-lobby').assets!.depressed!,
    clock,
  });
  enterLobby.element.classList.add('game-button--baked-label');

  const onNameKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    play();
  };
  nameEntry.input.addEventListener('keydown', onNameKeyDown);

  composition.append(logo.element, randomName.element, enterLobby.element, nameEntry.element,
    soundToggle.element, musicVolume.element, sfxVolume.element, boilToggle.element, onlineCount);
  bindings.push(
    { id: 'logo', element: logo.element }, { id: 'random-name', element: randomName.element },
    { id: 'enter-lobby', element: enterLobby.element }, { id: 'name-entry', element: nameEntry.element },
    { id: 'sound-toggle', element: soundToggle.element }, { id: 'music-slider', element: musicVolume.element },
    { id: 'sfx-slider', element: sfxVolume.element }, { id: 'boil-toggle', element: boilToggle.element },
    { id: 'online-count', element: onlineCount },
  );
  applyLayout();
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
    countStopped = true; window.clearInterval(countTimer);
    screen.remove();
  }) as TitleScreenMount;
  Object.defineProperty(cleanup, 'ready', { value: logo.whenReady() });
  return cleanup;
}
