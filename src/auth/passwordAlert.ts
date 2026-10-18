import type { BoilClock } from '../animation/boilClock';
import { createTextEntry } from '../input/textEntry';
import type { AlertButtonSheets, AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { isCompleteEmailCode, normalizeEmailCode } from './emailCodeChallenge';

export type PasswordAlertMode = 'set' | 'forgot' | 'remove';

const PASSWORD_ALERT_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 200, y: 85, width: 560, height: 370 },
  portrait: { x: 35, y: 260, width: 470, height: 440 },
};
const CONFIRM_SHEETS: AlertButtonSheets = {
  up: '/new-buttons/continue-button-w-up-sheet.webp',
  between: '/new-buttons/continue-button-w-between-sheet.webp',
  depressed: '/new-buttons/continue-button-w-depressed-sheet.webp',
};

export function getPasswordAlertTitle(mode: PasswordAlertMode): string {
  if (mode === 'forgot') return 'Forgot Password?';
  return mode === 'remove' ? 'Remove Password?' : 'Set Password';
}

export function showPasswordAlert(alerts: AlertSystem, clock: BoilClock, email: string, mode: PasswordAlertMode,
  onRequestCode: (email: string) => Promise<void>,
  onUpdate: (email: string, code: string, password?: string, remove?: boolean) => Promise<void>): void {
  const remove = mode === 'remove';
  const title = getPasswordAlertTitle(mode);
  const content = document.createElement('section'); content.className = 'password-dialog';
  const instruction = document.createElement('p'); instruction.textContent = `A verification code will be sent to ${email}.`;
  const code = createTextEntry({ label: 'Six-digit code', placeholder: '123 456', autocomplete: 'one-time-code', maxLength: 7,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock, validate: isCompleteEmailCode });
  code.element.classList.add('password-dialog__entry');
  code.element.hidden = true; code.input.inputMode = 'numeric'; code.input.disabled = true;
  const password = createTextEntry({ label: 'New password', type: 'password', placeholder: 'New password', autocomplete: 'new-password', maxLength: 128,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock, validate: (value) => remove || (value.length >= 8 && value.length <= 128) });
  password.element.classList.add('password-dialog__entry');
  password.element.hidden = true;
  content.append(instruction, code.element, password.element);
  let sent = false; let handle: ReturnType<AlertSystem['show']>;
  handle = alerts.show({ ariaLabel: title, title, geometry: PASSWORD_ALERT_GEOMETRY, content,
    className: 'password-alert', dismissible: true,
    actions: [{ label: 'Continue', value: true, sheets: CONFIRM_SHEETS, onActivate: async () => {
      if (!sent) {
        await onRequestCode(email); sent = true; code.element.hidden = false; code.input.disabled = false; password.element.hidden = remove;
        handle.setActionLabel(0, remove ? 'Remove Password' : 'Save Password');
        handle.setActionDisabled(0, true);
        instruction.textContent = 'Enter the code from your email.'; queueMicrotask(() => code.focus()); return false;
      }
      if (!code.validate() || !password.validate()) { (!code.validate() ? code : password).focus(); return false; }
      await onUpdate(email, normalizeEmailCode(code.value()), remove ? undefined : password.value(), remove); return true;
    } }] });
  const updateAction = () => {
    if (!sent) return;
    handle.setActionDisabled(0, !isCompleteEmailCode(code.value()) || (!remove && (password.value().length < 8 || password.value().length > 128)));
  };
  code.input.addEventListener('input', updateAction);
  password.input.addEventListener('input', updateAction);
  void handle.result.finally(() => { code.destroy(); password.destroy(); });
}
