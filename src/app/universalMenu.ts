import type { BoilClock } from '../animation/boilClock';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume, subscribeAudioState } from '../audio/soundEffect';
import { createBoilToggle } from '../input/boilToggle';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createVolumeSlider } from '../title/volumeSlider';
import { createTextbox } from '../ui/textbox';

export interface UniversalMenu { element: HTMLElement; destroy(): void; }

export function mountUniversalMenu(container: HTMLElement, background: HTMLElement, clock: BoilClock, onQuit: () => void, onClose: () => void): UniversalMenu {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const overlay = document.createElement('div');
  overlay.className = 'universal-menu';
  const sound = createSoundToggle(clock);
  const music = createVolumeSlider('music', clock, getMusicVolume(), setMusicVolume);
  const sfx = createVolumeSlider('sfx', clock, getSfxVolume(), setSfxVolume);
  const boil = createBoilToggle(clock);
  let confirmingQuit = false;
  const showConfirmation = () => {
    confirmingQuit = true;
    box.element.hidden = true;
    confirmation.element.hidden = false;
    confirmQuit.element.focus();
  };
  const hideConfirmation = () => {
    confirmingQuit = false;
    confirmation.element.hidden = true;
    box.element.hidden = false;
    quit.element.focus();
  };
  const quit = createGameButton({ label: 'Quit', onActivate: showConfirmation, clock,
    upSheet: '/new-buttons/quit-button-w-up-sheet.webp', betweenSheet: '/new-buttons/quit-button-w-between-sheet.webp', depressedSheet: '/new-buttons/quit-button-w-depressed-sheet.webp' });
  quit.element.classList.add('universal-menu__quit', 'game-button--baked-label');
  const continueButton = createGameButton({ label: 'Continue', onActivate: onClose, clock,
    upSheet: '/new-buttons/continue-button-w-up-sheet.webp', betweenSheet: '/new-buttons/continue-button-w-between-sheet.webp', depressedSheet: '/new-buttons/continue-button-w-depressed-sheet.webp' });
  continueButton.element.classList.add('universal-menu__continue', 'game-button--baked-label');
  const controls = document.createElement('div');
  controls.className = 'universal-menu__controls';
  music.element.classList.add('universal-menu__slider');
  sfx.element.classList.add('universal-menu__slider');
  sound.element.classList.add('universal-menu__toggle');
  boil.element.classList.add('universal-menu__toggle');
  controls.append(music.element, sfx.element, sound.element, boil.element, continueButton.element, quit.element);
  const box = createTextbox({ className: 'universal-menu__box', role: 'dialog', ariaLabel: 'Menu', content: controls });
  box.element.setAttribute('aria-modal', 'true');
  const question = document.createElement('p');
  question.className = 'universal-menu__question';
  question.textContent = 'Are you sure?';
  const confirmationActions = document.createElement('div');
  confirmationActions.className = 'universal-menu__confirmation-actions';
  const confirmQuit = createGameButton({ label: 'Quit', onActivate: onQuit, clock,
    upSheet: '/new-buttons/quit-button-w-up-sheet.webp', betweenSheet: '/new-buttons/quit-button-w-between-sheet.webp', depressedSheet: '/new-buttons/quit-button-w-depressed-sheet.webp' });
  confirmQuit.element.classList.add('game-button--baked-label');
  const back = createGameButton({ label: 'Back', onActivate: hideConfirmation, clock,
    upSheet: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp', betweenSheet: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp', depressedSheet: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp' });
  back.element.classList.add('game-button--baked-label');
  confirmationActions.append(back.element, confirmQuit.element);
  const confirmation = createTextbox({ className: 'universal-menu__confirmation', role: 'alertdialog', ariaLabel: 'Are you sure?', content: [question, confirmationActions] });
  confirmation.element.setAttribute('aria-modal', 'true');
  confirmation.element.hidden = true;
  overlay.append(box.element, confirmation.element); container.append(overlay); background.inert = true;
  const unsubscribe = subscribeAudioState(({ enabled }) => { music.setDisabled(!enabled); sfx.setDisabled(!enabled); });
  const focusables = () => [...box.element.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); confirmingQuit ? hideConfirmation() : onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = focusables(); if (!items.length) return;
    const first = items[0]!; const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', onKeyDown); (focusables()[0] ?? box.element).focus();
  return { element: overlay, destroy() {
    overlay.removeEventListener('keydown', onKeyDown); unsubscribe(); sound.destroy(); music.destroy(); sfx.destroy(); boil.destroy(); continueButton.destroy(); quit.destroy(); back.destroy(); confirmQuit.destroy(); confirmation.destroy(); box.destroy(); overlay.remove();
    background.inert = false; if (previousFocus?.isConnected) previousFocus.focus();
  } };
}
