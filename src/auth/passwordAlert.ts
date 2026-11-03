import type { BoilClock } from '../animation/boilClock';
import { createTextEntry } from '../input/textEntry';
import type { AlertButtonSheets, AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { showCodeAlert } from './codeAlert';

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
  const content = document.createElement('section'); content.className = 'password-dialog';
  const instruction = document.createElement('p'); instruction.textContent = `A verification code will be sent to ${email}.`;
  content.append(instruction);
  const password = remove ? undefined : createTextEntry({ label: 'New password', type: 'password', placeholder: 'New password', autocomplete: 'new-password', maxLength: 128,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock, validate: (value) => value.length >= 8 && value.length <= 128 });
  if (password) { password.element.classList.add('password-dialog__entry'); content.append(password.element); }
  let handle: ReturnType<AlertSystem['show']>;
  handle = alerts.show({ ariaLabel: getPasswordAlertTitle(mode), title: getPasswordAlertTitle(mode), geometry: PASSWORD_ALERT_GEOMETRY, content,
    className: 'password-alert', dismissible: true,
    actions: [{ label: 'Continue', value: true, sheets: CONFIRM_SHEETS, onActivate: async () => {
      if (password && !password.validate()) { password.focus(); return false; }
      const chosenPassword = password?.value();
      await onRequestCode(email);
      void showCodeAlert(alerts, clock, email, {
        verify: async (code) => { await onUpdate(email, code, chosenPassword, remove); handle.close(true); },
        resend: () => onRequestCode(email),
      });
      return false;
    } }] });
  void handle.result.finally(() => password?.destroy());
}
