import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createTextEntry } from '../input/textEntry';
import { createMenuCanvas } from '../layout/menuLayout';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { generateRandomName } from '../title/randomName';
import type { AccountState } from './shellSessionAdapter';
import { normalizePlayerDisplayName } from '../protocol/playerProfile';
import type { AlertButtonSheets, AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { isCompleteEmailCode, normalizeEmailCode } from '../auth/emailCodeChallenge';
import { showPasswordAlert } from '../auth/passwordAlert';
import type { PlayerAccountType } from '../protocol/playerId';
import { showGuestLogoutDialog } from '../title/guestLogoutDialog';

export interface AccountScreenMount { destroy(): void; update(account: AccountState): void }

export const DELETE_ACCOUNT_BUTTON_SHEETS = {
  up: '/account/delete-account-button-up-sheet.webp',
  between: '/account/delete-account-button-between-sheet.webp',
  depressed: '/account/delete-account-button-depressed-sheet.webp',
} as const;

export const CHANGE_PASSWORD_BUTTON_SHEETS = {
  up: '/account/change-password-button-up-sheet.webp',
  between: '/account/change-password-button-between-sheet.webp',
  depressed: '/account/change-password-button-depressed-sheet.webp',
} as const;

export const SET_PASSWORD_BUTTON_SHEETS = {
  up: '/account/set-password-button-up-sheet.webp',
  between: '/account/set-password-button-between-sheet.webp',
  depressed: '/account/set-password-button-depressed-sheet.webp',
} as const;

export const REMOVE_PASSWORD_BUTTON_SHEETS = {
  up: '/account/remove-password-button-up-sheet.webp',
  between: '/account/remove-password-button-between-sheet.webp',
  depressed: '/account/remove-password-button-depressed-sheet.webp',
} as const;

const DELETE_ALERT_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 200, y: 85, width: 560, height: 370 },
  portrait: { x: 35, y: 260, width: 470, height: 440 },
};
const CONFIRM_SHEETS: AlertButtonSheets = {
  up: '/new-buttons/continue-button-w-up-sheet.webp',
  between: '/new-buttons/continue-button-w-between-sheet.webp',
  depressed: '/new-buttons/continue-button-w-depressed-sheet.webp',
};

export function getAccountProviderVisibility(accountType: PlayerAccountType) {
  return { protectWithGoogle: accountType === 'guest', signUpWithEmail: accountType === 'guest', googleConnected: accountType === 'google' };
}

export function showDeleteAccountAlert(alerts: AlertSystem, clock: BoilClock,
  onRequestCode: () => Promise<void>, onDelete: (code?: string) => Promise<void>): void {
  const content = document.createElement('section'); content.className = 'delete-account-dialog';
  const warning = document.createElement('p');
  warning.textContent = 'Your login, profile, and progression will be removed. Completed matches will keep an anonymized player record.';
  const instruction = document.createElement('p');
  instruction.textContent = "We'll send you a code to delete your account.";
  const entry = createTextEntry({
    label: 'Six-digit deletion code',
    placeholder: '123 456', autocomplete: 'one-time-code', maxLength: 7,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock,
    validate: isCompleteEmailCode,
  });
  entry.element.hidden = true; entry.input.inputMode = 'numeric'; entry.input.disabled = true;
  entry.element.classList.add('delete-account-dialog__entry');
  content.append(warning, instruction, entry.element);
  let codeSent = false;
  let handle: ReturnType<AlertSystem['show']>;
  handle = alerts.show({
    ariaLabel: 'Delete account confirmation', title: 'Delete Account?', geometry: DELETE_ALERT_GEOMETRY, content, className: 'delete-account-alert',
    dismissible: true, dismissValue: false,
    actions: [
      { label: 'Continue', value: true, sheets: CONFIRM_SHEETS, onActivate: async () => {
        if (!codeSent) {
          await onRequestCode();
          codeSent = true;
          entry.element.hidden = false;
          entry.input.disabled = false;
          handle.setActionLabel(0, 'Delete Account');
          handle.setActionDisabled(0, true);
          instruction.textContent = 'Enter the code sent to your account email.';
          queueMicrotask(() => entry.focus());
          return false;
        }
        if (!entry.validate()) { entry.focus(); return false; }
        entry.input.disabled = true;
        try { await onDelete(normalizeEmailCode(entry.value())); }
        catch (reason) { entry.input.disabled = false; throw reason; }
      } },
    ],
  });
  entry.input.addEventListener('input', () => handle.setActionDisabled(0, !codeSent || !isCompleteEmailCode(entry.value())));
  void handle.result.finally(() => entry.destroy());
}

export function mountAccountScreen(container: HTMLElement, clock: BoilClock, alerts: AlertSystem, initial: AccountState,
  onChangeName: (name: string) => Promise<AccountState>, onClaim: () => void, onLogout: () => void,
  onBack: () => void, onRequestDeleteCode: () => Promise<void>, onDelete: (code?: string) => Promise<void>,
  onRequestPasswordCode: (email: string) => Promise<void> = async () => {},
  onUpdatePassword: (email: string, code: string, password?: string, remove?: boolean) => Promise<void> = async () => {},
  onSignUp: (displayName: string) => Promise<AccountState | undefined> = async () => undefined): AccountScreenMount {
  const layout = getLayoutDocument('account');
  let orientation: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  const applyLayout = () => applyDocumentLayout(layout, orientation, bindings);
  const screen = document.createElement('section'); screen.className = 'menu-canvas-screen account-screen'; screen.setAttribute('aria-label', 'Account Settings');
  const canvas = createMenuCanvas(screen, 'account-screen', (next) => { orientation = next; applyLayout(); });
  const composition = canvas.composition;
  const heading = createBoilingSprite({ src: layout.elements.find((item) => item.id === 'header')!.assets!.src!, clock, className: 'account-screen__heading', alt: 'Profile' });
  const nameEntry = createTextEntry({ label: 'New player name', value: initial.displayName, maxLength: 24, autocomplete: 'nickname', validate: (value) => normalizePlayerDisplayName(value) !== null,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock });
  nameEntry.element.classList.add('account-screen__name');
  const buttons: GameButton[] = [];
  const button = (label: string, root: string, run: () => void, className: string) => {
    const result = createGameButton({ label, onActivate: run, upSheet: `${root}-up-sheet.webp`, betweenSheet: `${root}-between-sheet.webp`, depressedSheet: `${root}-depressed-sheet.webp`, clock });
    result.element.classList.add('game-button--baked-label', className); buttons.push(result); return result;
  };
  const random = button('Random name', '/interactive-elements/menu-buttons/name-button', () => { nameEntry.setValue(generateRandomName()); nameEntry.focus(); }, 'account-screen__random');
  const error = document.createElement('p'); error.className = 'account-screen__error'; error.setAttribute('aria-live', 'polite');
  let account = initial;
  const change = button('Change name', '/account/change-name-button', () => {
    if (!nameEntry.validate()) { nameEntry.focus(); return; }
    error.textContent = '';
    void onChangeName(nameEntry.input.value.trim()).then((next) => { account = next; nameEntry.setValue(next.displayName); renderProvider(); })
      .catch((reason) => { error.textContent = reason instanceof Error ? reason.message : 'Name change failed.'; });
  }, 'account-screen__change');
  const back = button('Back to lobby', '/interactive-elements/menu-buttons/back-button-w', onBack, 'account-screen__back');
  const logout = button('Log out', '/account/log-out-button', () => {
    if (account.accountType !== 'guest') { onLogout(); return; }
    void showGuestLogoutDialog(alerts).then((confirmed) => { if (confirmed) onLogout(); });
  }, 'account-screen__logout');
  const playerId = document.createElement('p'); playerId.className = 'account-screen__player-id'; playerId.textContent = `Account ID: ${account.playerId}`;
  const accountType = document.createElement('p'); accountType.className = 'account-screen__account-type';
  const google = button('Protect with Google', '/title/google-sign-in/google-sign-in-button', onClaim, 'account-screen__google');
  const signUp = button('Sign up', '/title/auth/sign-up-button', () => {
    error.textContent = '';
    void onSignUp(account.displayName).then((next) => {
      if (!next) return;
      account = next;
      nameEntry.setValue(next.displayName);
      renderProvider();
    }).catch((reason) => { error.textContent = reason instanceof Error ? reason.message : 'Sign up failed.'; });
  }, 'account-screen__sign-up');
  const connected = document.createElement('p'); connected.className = 'account-screen__connected'; connected.textContent = 'Signed in with Google';
  const openPasswordAlert = () => {
    showPasswordAlert(alerts, clock, account.email, 'set', onRequestPasswordCode, async (...args) => { await onUpdatePassword(...args); account.hasPassword = true; renderProvider(); });
  };
  const setPassword = button('Set Password', '/account/set-password-button', openPasswordAlert, 'account-screen__password');
  const changePassword = button('Change Password', '/account/change-password-button', openPasswordAlert, 'account-screen__password');
  const removePassword = button('Remove Password', '/account/remove-password-button', () => {
    showPasswordAlert(alerts, clock, account.email, 'remove', onRequestPasswordCode, async (...args) => { await onUpdatePassword(...args); account.hasPassword = false; renderProvider(); });
  }, 'account-screen__remove-password');
  const renderProvider = () => {
    const guest = account.accountType === 'guest';
    const visibility = getAccountProviderVisibility(account.accountType);
    playerId.textContent = `Account ID: ${account.playerId}`;
    accountType.textContent = guest ? 'Guest Account' : account.accountType === 'google' ? 'Google Account' : 'Email Account';
    google.element.hidden = !visibility.protectWithGoogle;
    signUp.element.hidden = !visibility.signUpWithEmail;
    connected.hidden = !visibility.googleConnected;
    setPassword.element.hidden = account.accountType !== 'email' || account.hasPassword;
    changePassword.element.hidden = account.accountType !== 'email' || !account.hasPassword;
    removePassword.element.hidden = account.accountType !== 'email' || !account.hasPassword;
    deleteAccount.element.hidden = guest;
  };
  const deleteAccount = button('Delete Account', '/account/delete-account-button', () => {
    showDeleteAccountAlert(alerts, clock, onRequestDeleteCode, onDelete);
  }, 'account-screen__delete');
  const decoration = (id: string, className: string) => createBoilingSprite({ src: layout.elements.find((item) => item.id === id)!.assets!.src!, clock, className, alt: '' });
  const openCurtain = decoration('curtain-open', 'account-screen__curtain-open');
  const left = decoration('curtain-left', 'account-screen__curtain-left');
  const right = decoration('curtain-right', 'account-screen__curtain-right');
  renderProvider();
  composition.append(heading.element, nameEntry.element, random.element, change.element, playerId, accountType, google.element, signUp.element, connected, setPassword.element, changePassword.element, removePassword.element, deleteAccount.element, error, logout.element, back.element, openCurtain.element, left.element, right.element);
  bindings.push({ id: 'header', element: heading.element }, { id: 'name-entry', element: nameEntry.element },
    { id: 'random-name', element: random.element }, { id: 'change-name', element: change.element }, { id: 'player-id', element: playerId },
    { id: 'account-type', element: accountType }, { id: 'google', element: google.element }, { id: 'sign-up', element: signUp.element }, { id: 'connected', element: connected },
    { id: 'password', element: setPassword.element }, { id: 'password', element: changePassword.element }, { id: 'remove-password', element: removePassword.element },
    { id: 'delete-account', element: deleteAccount.element }, { id: 'error', element: error }, { id: 'logout', element: logout.element }, { id: 'back', element: back.element }, { id: 'curtain-open', element: openCurtain.element },
    { id: 'curtain-left', element: left.element }, { id: 'curtain-right', element: right.element });
  applyLayout();
  container.replaceChildren(screen);
  return {
    update(next) { account = next; nameEntry.setValue(next.displayName); renderProvider(); },
    destroy() { canvas.destroy(); nameEntry.destroy(); for (const item of buttons) item.destroy(); heading.destroy(); openCurtain.destroy(); left.destroy(); right.destroy(); screen.remove(); },
  };
}
