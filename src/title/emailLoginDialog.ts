import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createTextEntry } from '../input/textEntry';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';

const EMAIL_LOGIN_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 220, y: 100, width: 520, height: 340 },
  portrait: { x: 40, y: 300, width: 460, height: 360 },
};

export interface EmailLoginActions {
  verify(code: string): Promise<void>;
  resend(): Promise<void>;
}

export function showEmailLoginDialog(alerts: AlertSystem, clock: BoilClock, email: string,
  actions: EmailLoginActions): Promise<boolean> {
  const content = document.createElement('section'); content.className = 'email-login-dialog';
  const heading = document.createElement('h2'); heading.className = 'email-login-dialog__heading'; heading.textContent = 'Check Your Email';
  const instruction = document.createElement('p'); instruction.className = 'email-login-dialog__instruction';
  instruction.textContent = `Enter the code sent to ${email}.`;
  const status = document.createElement('p'); status.className = 'email-login-dialog__status'; status.setAttribute('aria-live', 'polite');
  const code = createTextEntry({
    label: 'Six-digit code', placeholder: '123 456', required: true, autocomplete: 'one-time-code', maxLength: 7,
    validate: (value) => /^\d{3}\s?\d{3}$/.test(value.trim()),
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock,
  });
  code.element.classList.add('email-login-dialog__entry'); code.input.inputMode = 'numeric';
  const form = document.createElement('form'); form.className = 'email-login-dialog__form';
  let busy = false;
  let handle: ReturnType<AlertSystem['show']>;
  const resend = createGameButton({
    label: 'Resend code', onActivate: () => resendCode(), clock,
    upSheet: '/title/auth/resend-code-button-up-sheet.webp',
    betweenSheet: '/title/auth/resend-code-button-between-sheet.webp',
    depressedSheet: '/title/auth/resend-code-button-depressed-sheet.webp',
  });
  resend.element.classList.add('email-login-dialog__resend', 'game-button--baked-label');
  const enter = createGameButton({
    label: 'Enter lobby', onActivate: () => form.requestSubmit(), clock,
    upSheet: '/interactive-elements/menu-buttons/lobby-button-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/lobby-button-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/lobby-button-depressed-sheet.webp',
  });
  enter.element.classList.add('email-login-dialog__enter', 'game-button--baked-label');
  const setBusy = (value: boolean) => { busy = value; enter.setDisabled(value); resend.setDisabled(value); };
  const controls = document.createElement('div'); controls.className = 'email-login-dialog__controls'; controls.append(resend.element, enter.element);
  form.append(code.element, controls);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || !code.validate()) { code.focus(); return; }
    status.textContent = ''; setBusy(true);
    void actions.verify(code.value().replace(/\s/g, '')).then(() => handle.close(true)).catch((reason) => {
      status.textContent = reason instanceof Error ? reason.message : 'Could not sign in. Try again.';
      setBusy(false); code.focus();
    });
  });
  const resendCode = () => {
    if (busy) return;
    status.textContent = ''; setBusy(true);
    void actions.resend().then(() => { code.setValue(''); status.textContent = 'New code sent.'; code.focus(); })
      .catch((reason) => { status.textContent = reason instanceof Error ? reason.message : 'Could not send code. Try again.'; })
      .finally(() => setBusy(false));
  };
  content.append(heading, instruction, form, status);
  handle = alerts.show({ ariaLabel: 'Enter Email Code', geometry: EMAIL_LOGIN_GEOMETRY, content,
    className: 'email-login-alert', dismissible: true, actions: [] });
  queueMicrotask(() => code.focus());
  return handle.result.finally(() => { code.destroy(); resend.destroy(); enter.destroy(); }).then((value) => value === true);
}
