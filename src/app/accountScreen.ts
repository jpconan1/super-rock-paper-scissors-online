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
import type { PlayerAccountType } from '../protocol/playerId';

export interface AccountScreenMount { destroy(): void; update(account: AccountState): void }

export const DELETE_ACCOUNT_BUTTON_SHEETS = {
  up: '/account/delete-account-button-up-sheet.webp',
  between: '/account/delete-account-button-between-sheet.webp',
  depressed: '/account/delete-account-button-depressed-sheet.webp',
} as const;

const DELETE_ALERT_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 200, y: 85, width: 560, height: 370 },
  portrait: { x: 35, y: 260, width: 470, height: 440 },
};
const BACK_SHEETS: AlertButtonSheets = {
  up: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
  between: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
  depressed: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp',
};
const CONFIRM_SHEETS: AlertButtonSheets = {
  up: '/new-buttons/continue-button-w-up-sheet.webp',
  between: '/new-buttons/continue-button-w-between-sheet.webp',
  depressed: '/new-buttons/continue-button-w-depressed-sheet.webp',
};

export function isDeleteAccountConfirmation(value: string): boolean {
  return value.trim().toLowerCase() === 'delete';
}

export function getAccountProviderVisibility(accountType: PlayerAccountType) {
  return { protectWithGoogle: accountType === 'guest', googleConnected: accountType === 'google' };
}

function showDeleteAccountAlert(alerts: AlertSystem, clock: BoilClock, guest: boolean,
  onRequestCode: () => Promise<void>, onDelete: (code?: string) => Promise<void>): void {
  const content = document.createElement('section'); content.className = 'delete-account-dialog';
  const heading = document.createElement('h2'); heading.textContent = 'Delete Account?';
  const warning = document.createElement('p');
  warning.textContent = 'Your login, profile, and progression will be removed. Completed matches will keep an anonymized player record.';
  const instruction = document.createElement('p');
  instruction.textContent = guest ? 'Type delete to continue.' : "We'll send you a code to delete your account.";
  const entry = createTextEntry({
    label: guest ? 'Type delete to confirm' : 'Six-digit deletion code',
    placeholder: guest ? 'delete' : '123 456', autocomplete: guest ? 'off' : 'one-time-code', maxLength: guest ? undefined : 7,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock,
    validate: guest ? isDeleteAccountConfirmation : isCompleteEmailCode,
  });
  if (!guest) { entry.input.inputMode = 'numeric'; entry.input.disabled = true; }
  entry.element.classList.add('delete-account-dialog__entry');
  content.append(heading, warning, instruction, entry.element);
  let codeSent = false;
  let handle: ReturnType<AlertSystem['show']>;
  handle = alerts.show({
    ariaLabel: 'Delete account confirmation', geometry: DELETE_ALERT_GEOMETRY, content, className: 'delete-account-alert',
    dismissible: true, dismissValue: false,
    actions: [
      { label: 'Back', value: false, sheets: BACK_SHEETS },
      { label: guest ? 'Confirm' : 'Send Code', value: true, sheets: CONFIRM_SHEETS, disabled: guest, onActivate: async () => {
        if (!guest && !codeSent) {
          await onRequestCode();
          codeSent = true;
          entry.input.disabled = false;
          handle.setActionLabel(1, 'Delete Account');
          handle.setActionDisabled(1, true);
          instruction.textContent = 'Enter the code sent to your account email.';
          queueMicrotask(() => entry.focus());
          return false;
        }
        if (!entry.validate()) { entry.focus(); return false; }
        entry.input.disabled = true;
        try { await onDelete(guest ? undefined : normalizeEmailCode(entry.value())); }
        catch (reason) { entry.input.disabled = false; throw reason; }
      } },
    ],
  });
  entry.input.addEventListener('input', () => handle.setActionDisabled(1,
    guest ? !isDeleteAccountConfirmation(entry.value()) : !codeSent || !isCompleteEmailCode(entry.value())));
  void handle.result.finally(() => entry.destroy());
  if (guest) queueMicrotask(() => entry.focus());
}

function showPasswordAlert(alerts: AlertSystem, clock: BoilClock, email: string, remove: boolean,
  onRequestCode: (email: string) => Promise<void>, onUpdate: (email: string, code: string, password?: string, remove?: boolean) => Promise<void>): void {
  const content = document.createElement('section'); content.className = 'delete-account-dialog';
  const heading = document.createElement('h2'); heading.textContent = remove ? 'Remove Password?' : 'Set Password';
  const instruction = document.createElement('p'); instruction.textContent = `A verification code will be sent to ${email}.`;
  const code = createTextEntry({ label: 'Six-digit code', placeholder: '123 456', autocomplete: 'one-time-code', maxLength: 7,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock, validate: isCompleteEmailCode });
  code.input.inputMode = 'numeric'; code.input.disabled = true;
  const password = createTextEntry({ label: 'New password', type: 'password', placeholder: 'New password', autocomplete: 'new-password', maxLength: 128,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock, validate: (value) => remove || (value.length >= 8 && value.length <= 128) });
  password.element.hidden = remove;
  content.append(heading, instruction, code.element, password.element);
  let sent = false; let handle: ReturnType<AlertSystem['show']>;
  handle = alerts.show({ ariaLabel: remove ? 'Remove password' : 'Set password', geometry: DELETE_ALERT_GEOMETRY, content, dismissible: true,
    actions: [{ label: 'Back', value: false, sheets: BACK_SHEETS }, { label: 'Send Code', value: true, sheets: CONFIRM_SHEETS, onActivate: async () => {
      if (!sent) {
        await onRequestCode(email); sent = true; code.input.disabled = false; handle.setActionLabel(1, remove ? 'Remove Password' : 'Save Password');
        instruction.textContent = 'Enter the code from your email.'; queueMicrotask(() => code.focus()); return false;
      }
      if (!code.validate() || !password.validate()) return false;
      await onUpdate(email, normalizeEmailCode(code.value()), remove ? undefined : password.value(), remove); return true;
    } }] });
  void handle.result.finally(() => { code.destroy(); password.destroy(); });
}

export function mountAccountScreen(container: HTMLElement, clock: BoilClock, alerts: AlertSystem, initial: AccountState,
  onChangeName: (name: string) => Promise<AccountState>, onClaim: () => void, onLogout: () => void,
  onBack: () => void, onRequestDeleteCode: () => Promise<void>, onDelete: (code?: string) => Promise<void>,
  onRequestPasswordCode: (email: string) => Promise<void> = async () => {},
  onUpdatePassword: (email: string, code: string, password?: string, remove?: boolean) => Promise<void> = async () => {}): AccountScreenMount {
  const layout = getLayoutDocument('account');
  let orientation: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  const applyLayout = () => applyDocumentLayout(layout, orientation, bindings);
  const screen = document.createElement('section'); screen.className = 'menu-canvas-screen account-screen'; screen.setAttribute('aria-label', 'Account Settings');
  const canvas = createMenuCanvas(screen, 'account-screen', (next) => { orientation = next; applyLayout(); });
  const composition = canvas.composition;
  const heading = document.createElement('h1'); heading.className = 'account-screen__heading'; heading.textContent = layout.elements.find((item) => item.id === 'header')!.label!;
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
  const logout = button('Log out', '/account/log-out-button', onLogout, 'account-screen__logout');
  const playerId = document.createElement('p'); playerId.className = 'account-screen__player-id'; playerId.textContent = account.playerId;
  const accountType = document.createElement('p'); accountType.className = 'account-screen__account-type';
  const google = button('Protect with Google', '/title/google-sign-in/google-sign-in-button', onClaim, 'account-screen__google');
  const connected = document.createElement('p'); connected.className = 'account-screen__connected'; connected.textContent = 'Signed in with Google';
  const emailDetails = document.createElement('p'); emailDetails.className = 'account-screen__connected';
  const managePassword = button('Set Password', '/interactive-elements/generic-buttons/generic3', () => {
    showPasswordAlert(alerts, clock, account.email, false, onRequestPasswordCode, async (...args) => { await onUpdatePassword(...args); account.hasPassword = true; renderProvider(); });
  }, 'account-screen__password');
  const removePassword = button('Remove Password', '/interactive-elements/generic-buttons/generic3', () => {
    showPasswordAlert(alerts, clock, account.email, true, onRequestPasswordCode, async (...args) => { await onUpdatePassword(...args); account.hasPassword = false; renderProvider(); });
  }, 'account-screen__remove-password');
  managePassword.element.classList.remove('game-button--baked-label');
  removePassword.element.classList.remove('game-button--baked-label');
  const renderProvider = () => {
    const guest = account.accountType === 'guest';
    const visibility = getAccountProviderVisibility(account.accountType);
    playerId.textContent = account.playerId;
    accountType.textContent = guest ? 'Guest account' : account.accountType === 'google' ? 'Google account' : `${account.accountType} account`;
    google.element.hidden = !visibility.protectWithGoogle;
    connected.hidden = !visibility.googleConnected;
    emailDetails.hidden = account.accountType !== 'email';
    emailDetails.textContent = account.accountType === 'email' ? `${account.email} · Email cannot be changed · ${account.hasPassword ? 'Password enabled' : 'Email-code login'}` : '';
    managePassword.element.hidden = account.accountType !== 'email';
    managePassword.setLabel(account.hasPassword ? 'Change Password' : 'Add Password');
    removePassword.element.hidden = account.accountType !== 'email' || !account.hasPassword;
  };
  const deleteAccount = button('Delete Account', '/account/delete-account-button', () => {
    showDeleteAccountAlert(alerts, clock, account.accountType === 'guest', onRequestDeleteCode, onDelete);
  }, 'account-screen__delete');
  const decoration = (id: string, className: string) => createBoilingSprite({ src: layout.elements.find((item) => item.id === id)!.assets!.src!, clock, className, alt: '' });
  const openCurtain = decoration('curtain-open', 'account-screen__curtain-open');
  const left = decoration('curtain-left', 'account-screen__curtain-left');
  const right = decoration('curtain-right', 'account-screen__curtain-right');
  renderProvider();
  composition.append(heading, nameEntry.element, random.element, change.element, playerId, accountType, google.element, connected, emailDetails, managePassword.element, removePassword.element, deleteAccount.element, error, logout.element, back.element, openCurtain.element, left.element, right.element);
  bindings.push({ id: 'header', element: heading }, { id: 'name-entry', element: nameEntry.element },
    { id: 'random-name', element: random.element }, { id: 'change-name', element: change.element }, { id: 'player-id', element: playerId },
    { id: 'account-type', element: accountType }, { id: 'google', element: google.element }, { id: 'connected', element: connected },
    { id: 'email-details', element: emailDetails }, { id: 'password', element: managePassword.element }, { id: 'remove-password', element: removePassword.element },
    { id: 'delete-account', element: deleteAccount.element }, { id: 'error', element: error }, { id: 'logout', element: logout.element }, { id: 'back', element: back.element }, { id: 'curtain-open', element: openCurtain.element },
    { id: 'curtain-left', element: left.element }, { id: 'curtain-right', element: right.element });
  applyLayout();
  container.replaceChildren(screen);
  return {
    update(next) { account = next; nameEntry.setValue(next.displayName); renderProvider(); },
    destroy() { canvas.destroy(); nameEntry.destroy(); for (const item of buttons) item.destroy(); openCurtain.destroy(); left.destroy(); right.destroy(); screen.remove(); },
  };
}
