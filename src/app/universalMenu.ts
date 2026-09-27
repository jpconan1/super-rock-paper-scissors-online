import type { BoilClock } from '../animation/boilClock';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume, subscribeAudioState } from '../audio/soundEffect';
import { createBoilToggle } from '../input/boilToggle';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createVolumeSlider } from '../title/volumeSlider';
import { createTextbox } from '../ui/textbox';
import { createUnlockController } from './unlockController';

export interface UniversalMenu { element: HTMLElement; destroy(): void; }
export interface UniversalMenuAccount { signedIn: boolean; displayName: string; unlockAllClasses: boolean }
export const QUIT_CONFIRMATION_COPY = 'Are you sure you want to quit to the title screen?';
export const UNLOCK_CONFIRMATION_COPY = 'Unlock everything?';

export function mountUniversalMenu(container: HTMLElement, background: HTMLElement, clock: BoilClock, onQuit: () => void, onClose: () => void, onAccount: () => void,
  onSetUnlockAll: (enabled: boolean) => Promise<void>, account?: UniversalMenuAccount, showUnlockControls = true): UniversalMenu {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const overlay = document.createElement('div');
  overlay.className = 'universal-menu';
  const sound = createSoundToggle(clock);
  const music = createVolumeSlider('music', clock, getMusicVolume(), setMusicVolume);
  const sfx = createVolumeSlider('sfx', clock, getSfxVolume(), setSfxVolume);
  const boil = createBoilToggle(clock);
  let unlockAllClasses = account?.unlockAllClasses ?? false;
  const showUnlockConfirmation = () => {
    box.element.hidden = true; unlockConfirmation.element.hidden = false; unlockContinue.element.focus();
  };
  const unlockController = createUnlockController(clock, showUnlockConfirmation);
  const resumeProgression = createGameButton({ label: 'Resume progression', onActivate: () => void updateUnlockAll(false), clock,
    upSheet: '/interactive-elements/resume-progression/lock-button-up-sheet.webp', betweenSheet: '/interactive-elements/resume-progression/lock-button-between-sheet.webp', depressedSheet: '/interactive-elements/resume-progression/lock-button-depressed-sheet.webp' });
  resumeProgression.element.classList.add('universal-menu__resume-progression', 'game-button--baked-label');
  const renderUnlockControl = () => {
    unlockController.element.hidden = !showUnlockControls || unlockAllClasses;
    resumeProgression.element.hidden = !showUnlockControls || !unlockAllClasses;
  };
  async function updateUnlockAll(enabled: boolean): Promise<void> {
    resumeProgression.setDisabled(true); unlockContinue.setDisabled(true);
    try {
      await onSetUnlockAll(enabled); unlockAllClasses = enabled; renderUnlockControl();
      unlockConfirmation.element.hidden = true; box.element.hidden = false;
      (enabled ? resumeProgression.element : unlockController.element.querySelector<HTMLElement>('[tabindex="0"]'))?.focus();
    } catch (error) { console.error('Could not update unlock-all mode.', error); }
    finally { resumeProgression.setDisabled(false); unlockContinue.setDisabled(false); }
  }
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
  const accountButton = createGameButton({ label: 'Account settings', onActivate: onAccount, clock,
    upSheet: '/account/account-button-up-sheet.webp', betweenSheet: '/account/account-button-between-sheet.webp', depressedSheet: '/account/account-button-depressed-sheet.webp' });
  accountButton.element.classList.add('universal-menu__account-button', 'game-button--baked-label');
  const controls = document.createElement('div');
  controls.className = 'universal-menu__controls';
  music.element.classList.add('universal-menu__slider');
  sfx.element.classList.add('universal-menu__slider');
  sound.element.classList.add('universal-menu__toggle');
  boil.element.classList.add('universal-menu__toggle');
  const accountPanel = document.createElement('div'); accountPanel.className = 'universal-menu__account';
  const accountLabel = document.createElement('p');
  accountLabel.textContent = account?.signedIn ? `${account.displayName} — Google connected` : `${account?.displayName || 'Guest'} — Guest`;
  accountPanel.append(accountLabel);
  controls.append(music.element, sfx.element, sound.element, boil.element, accountButton.element, accountPanel, continueButton.element, quit.element);
  const box = createTextbox({ className: 'universal-menu__box', role: 'dialog', ariaLabel: 'Menu', content: controls });
  box.element.setAttribute('aria-modal', 'true');
  box.element.prepend(unlockController.element, resumeProgression.element);
  renderUnlockControl();
  const question = document.createElement('p');
  question.className = 'universal-menu__question';
  question.textContent = QUIT_CONFIRMATION_COPY;
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
  const unlockQuestion = document.createElement('p'); unlockQuestion.className = 'universal-menu__question'; unlockQuestion.textContent = UNLOCK_CONFIRMATION_COPY;
  const unlockActions = document.createElement('div'); unlockActions.className = 'universal-menu__confirmation-actions';
  const unlockContinue = createGameButton({ label: 'Continue', onActivate: () => void updateUnlockAll(true), clock,
    upSheet: '/new-buttons/continue-button-w-up-sheet.webp', betweenSheet: '/new-buttons/continue-button-w-between-sheet.webp', depressedSheet: '/new-buttons/continue-button-w-depressed-sheet.webp' });
  const unlockDismiss = createGameButton({ label: 'Dismiss', onActivate: () => { unlockConfirmation.element.hidden = true; box.element.hidden = false; }, clock,
    upSheet: '/community-letter/dismiss-button-up-sheet.webp', betweenSheet: '/community-letter/dismiss-button-between-sheet.webp', depressedSheet: '/community-letter/dismiss-button-depressed-sheet.webp' });
  unlockContinue.element.classList.add('game-button--baked-label'); unlockDismiss.element.classList.add('game-button--baked-label'); unlockActions.append(unlockDismiss.element, unlockContinue.element);
  const unlockConfirmation = createTextbox({ className: 'universal-menu__confirmation', role: 'alertdialog', ariaLabel: UNLOCK_CONFIRMATION_COPY, content: [unlockQuestion, unlockActions] });
  unlockConfirmation.element.setAttribute('aria-modal', 'true'); unlockConfirmation.element.hidden = true;
  overlay.append(box.element, confirmation.element, unlockConfirmation.element); container.append(overlay); background.inert = true;
  const unsubscribe = subscribeAudioState(({ enabled }) => { music.setDisabled(!enabled); sfx.setDisabled(!enabled); });
  const focusables = () => [...box.element.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!unlockConfirmation.element.hidden) { unlockConfirmation.element.hidden = true; box.element.hidden = false; } else confirmingQuit ? hideConfirmation() : onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = focusables(); if (!items.length) return;
    const first = items[0]!; const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', onKeyDown); (focusables()[0] ?? box.element).focus();
  return { element: overlay, destroy() {
    overlay.removeEventListener('keydown', onKeyDown); unsubscribe(); sound.destroy(); music.destroy(); sfx.destroy(); boil.destroy(); unlockController.destroy(); resumeProgression.destroy(); accountButton.destroy(); continueButton.destroy(); quit.destroy(); back.destroy(); confirmQuit.destroy(); unlockContinue.destroy(); unlockDismiss.destroy(); unlockConfirmation.destroy(); confirmation.destroy(); box.destroy(); overlay.remove();
    background.inert = false; if (previousFocus?.isConnected) previousFocus.focus();
  } };
}
