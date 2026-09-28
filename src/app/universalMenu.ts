import type { BoilClock } from '../animation/boilClock';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume, subscribeAudioState } from '../audio/soundEffect';
import { createBoilToggle } from '../input/boilToggle';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createVolumeSlider } from '../title/volumeSlider';
import { createTextbox } from '../ui/textbox';
import type { AlertButtonSheets, AlertSystem } from '../ui/alertSystem';
import { createUnlockController } from './unlockController';

export interface UniversalMenu { element: HTMLElement; destroy(): void; }
export interface UniversalMenuAccount { signedIn: boolean; displayName: string; unlockAllClasses: boolean }
export type UniversalMenuMode = 'lobby' | 'game';
interface UniversalMenuCommonOptions { mode: UniversalMenuMode; onQuit: () => void; onClose: () => void; alerts: AlertSystem }
export interface LobbyUniversalMenuOptions extends UniversalMenuCommonOptions {
  mode: 'lobby';
  onAccount: () => void;
  onSetUnlockAll: (enabled: boolean) => Promise<void>;
  account: UniversalMenuAccount;
}
export interface GameUniversalMenuOptions extends UniversalMenuCommonOptions { mode: 'game' }
export type UniversalMenuOptions = LobbyUniversalMenuOptions | GameUniversalMenuOptions;
export const QUIT_CONFIRMATION_COPY = 'Are you sure you want to quit to the title screen?';
export const GAME_QUIT_CONFIRMATION_COPY = 'Quit this match and return to the lobby?';
export const UNLOCK_CONFIRMATION_COPY = 'Unlock everything?';
export const ALERT_BUTTON_SHEETS = {
  back: { up: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp', between: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp', depressed: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp' },
  quit: { up: '/new-buttons/quit-button-up-sheet.webp', between: '/new-buttons/quit-button-between-sheet.webp', depressed: '/new-buttons/quit-button-depressed-sheet.webp' },
  continue: { up: '/new-buttons/continue-button-w-up-sheet.webp', between: '/new-buttons/continue-button-w-between-sheet.webp', depressed: '/new-buttons/continue-button-w-depressed-sheet.webp' },
  dismiss: { up: '/community-letter/dismiss-button-up-sheet.webp', between: '/community-letter/dismiss-button-between-sheet.webp', depressed: '/community-letter/dismiss-button-depressed-sheet.webp' },
} as const satisfies Readonly<Record<string, AlertButtonSheets>>;
export const MENU_QUIT_BUTTONS = {
  lobby: {
    label: 'Quit to Title',
    sheets: { up: '/new-buttons/quit-title-button-up-sheet.webp', between: '/new-buttons/quit-title-button-between-sheet.webp', depressed: '/new-buttons/quit-title-button-depressed-sheet.webp' },
  },
  game: {
    label: 'Quit to Lobby',
    sheets: { up: '/new-buttons/quit-lobby-button-up-sheet.webp', between: '/new-buttons/quit-lobby-button-between-sheet.webp', depressed: '/new-buttons/quit-lobby-button-depressed-sheet.webp' },
  },
} as const satisfies Readonly<Record<UniversalMenuMode, { label: string; sheets: AlertButtonSheets }>>;

export function selectUniversalMenuMode(hasLocalMatch: boolean, hasMatchProjection: boolean): UniversalMenuMode {
  return hasLocalMatch || hasMatchProjection ? 'game' : 'lobby';
}

export function universalMenuFeatures(mode: UniversalMenuMode): Readonly<{ account: boolean; identity: boolean; unlocks: boolean }> {
  const lobby = mode === 'lobby';
  return { account: lobby, identity: lobby, unlocks: lobby };
}

export function mountUniversalMenu(container: HTMLElement, background: HTMLElement, clock: BoilClock, options: UniversalMenuOptions): UniversalMenu {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const overlay = document.createElement('div');
  overlay.className = `universal-menu universal-menu--${options.mode}`;
  const sound = createSoundToggle(clock);
  const music = createVolumeSlider('music', clock, getMusicVolume(), setMusicVolume);
  const sfx = createVolumeSlider('sfx', clock, getSfxVolume(), setSfxVolume);
  const boil = createBoilToggle(clock);
  const showConfirmation = () => {
    void options.alerts.confirm({
      ariaLabel: 'Are you sure?',
      content: options.mode === 'game' ? GAME_QUIT_CONFIRMATION_COPY : QUIT_CONFIRMATION_COPY,
      dismissible: true,
      cancel: { label: 'Back', sheets: ALERT_BUTTON_SHEETS.back },
      confirm: { label: 'Quit', sheets: ALERT_BUTTON_SHEETS.quit },
    }).then((confirmed) => { if (confirmed) options.onQuit(); });
  };
  const quitConfig = MENU_QUIT_BUTTONS[options.mode];
  const quit = createGameButton({ label: quitConfig.label, onActivate: showConfirmation, clock,
    upSheet: quitConfig.sheets.up, betweenSheet: quitConfig.sheets.between, depressedSheet: quitConfig.sheets.depressed });
  quit.element.classList.add('universal-menu__quit', 'game-button--baked-label');
  const continueButton = createGameButton({ label: 'Continue', onActivate: options.onClose, clock,
    upSheet: '/new-buttons/continue-button-w-up-sheet.webp', betweenSheet: '/new-buttons/continue-button-w-between-sheet.webp', depressedSheet: '/new-buttons/continue-button-w-depressed-sheet.webp' });
  continueButton.element.classList.add('universal-menu__continue', 'game-button--baked-label');
  const controls = document.createElement('div');
  controls.className = `universal-menu__controls universal-menu__controls--${options.mode}`;
  music.element.classList.add('universal-menu__slider');
  sfx.element.classList.add('universal-menu__slider');
  sound.element.classList.add('universal-menu__toggle');
  boil.element.classList.add('universal-menu__toggle');
  controls.append(music.element, sfx.element, sound.element, boil.element);
  const lobbyResources: Array<{ destroy(): void }> = [];
  const lobbyDecorations: Node[] = [];
  if (options.mode === 'lobby') {
    let unlockAllClasses = options.account.unlockAllClasses;
    let resumeProgression: ReturnType<typeof createGameButton>;
    const renderUnlockControl = () => {
      unlockController.element.hidden = unlockAllClasses;
      resumeProgression.element.hidden = !unlockAllClasses;
    };
    const updateUnlockAll = async (enabled: boolean): Promise<void> => {
      resumeProgression.setDisabled(true);
      try { await options.onSetUnlockAll(enabled); unlockAllClasses = enabled; renderUnlockControl(); }
      finally { resumeProgression.setDisabled(false); }
    };
    const showUnlockConfirmation = () => {
      void options.alerts.confirm({
        ariaLabel: UNLOCK_CONFIRMATION_COPY,
        content: UNLOCK_CONFIRMATION_COPY,
        dismissible: true,
        cancel: { label: 'Dismiss', sheets: ALERT_BUTTON_SHEETS.dismiss },
        confirm: { label: 'Continue', sheets: ALERT_BUTTON_SHEETS.continue, onActivate: () => updateUnlockAll(true) },
      }).then((confirmed) => { if (confirmed) resumeProgression.element.focus(); });
    };
    const unlockController = createUnlockController(clock, showUnlockConfirmation);
    resumeProgression = createGameButton({ label: 'Resume progression', onActivate: () => void updateUnlockAll(false), clock,
      upSheet: '/interactive-elements/resume-progression/lock-button-up-sheet.webp', betweenSheet: '/interactive-elements/resume-progression/lock-button-between-sheet.webp', depressedSheet: '/interactive-elements/resume-progression/lock-button-depressed-sheet.webp' });
    resumeProgression.element.classList.add('universal-menu__resume-progression', 'game-button--baked-label');
    const accountButton = createGameButton({ label: 'Account settings', onActivate: options.onAccount, clock,
      upSheet: '/account/account-button-up-sheet.webp', betweenSheet: '/account/account-button-between-sheet.webp', depressedSheet: '/account/account-button-depressed-sheet.webp' });
    accountButton.element.classList.add('universal-menu__account-button', 'game-button--baked-label');
    const accountPanel = document.createElement('div'); accountPanel.className = 'universal-menu__account';
    const accountLabel = document.createElement('p');
    accountLabel.textContent = options.account.signedIn ? `${options.account.displayName} — Google connected` : `${options.account.displayName || 'Guest'} — Guest`;
    accountPanel.append(accountLabel);
    controls.append(accountButton.element, accountPanel);
    lobbyResources.push(unlockController, resumeProgression, accountButton);
    lobbyDecorations.push(unlockController.element, resumeProgression.element);
    renderUnlockControl();
  }
  controls.append(continueButton.element, quit.element);
  const box = createTextbox({ className: `universal-menu__box universal-menu__box--${options.mode}`, role: 'dialog', ariaLabel: 'Menu', content: controls });
  box.element.setAttribute('aria-modal', 'true');
  if (lobbyDecorations.length) box.element.prepend(...lobbyDecorations);
  overlay.append(box.element); container.append(overlay); background.inert = true;
  const unsubscribe = subscribeAudioState(({ enabled }) => { music.setDisabled(!enabled); sfx.setDisabled(!enabled); });
  const focusables = () => [...box.element.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); options.onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = focusables(); if (!items.length) return;
    const first = items[0]!; const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', onKeyDown); (focusables()[0] ?? box.element).focus();
  return { element: overlay, destroy() {
    overlay.removeEventListener('keydown', onKeyDown); unsubscribe(); sound.destroy(); music.destroy(); sfx.destroy(); boil.destroy(); lobbyResources.forEach((resource) => resource.destroy()); continueButton.destroy(); quit.destroy(); box.destroy(); overlay.remove();
    background.inert = false; if (previousFocus?.isConnected) previousFocus.focus();
  } };
}
