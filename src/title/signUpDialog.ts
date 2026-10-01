import type { BoilClock } from '../animation/boilClock';
import { createTextEntry, type TextEntry } from '../input/textEntry';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';

const SIGN_UP_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 190, y: 55, width: 580, height: 430 },
  portrait: { x: 30, y: 220, width: 480, height: 520 },
};
const BACK_SHEETS = {
  up: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
  between: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
  depressed: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp',
};

export interface EmailSignupActions {
  request(email: string, legalAccepted: boolean): Promise<void>;
  verify(email: string, code: string): Promise<void>;
  resend(email: string): Promise<void>;
}

export function showSignUpDialog(alerts: AlertSystem, clock: BoilClock, actions: EmailSignupActions): Promise<boolean> {
  const content = document.createElement('section'); content.className = 'sign-up-dialog';
  const heading = document.createElement('h2'); heading.className = 'sign-up-dialog__heading'; heading.textContent = 'New Account Creation';
  const status = document.createElement('p'); status.className = 'sign-up-dialog__status'; status.setAttribute('aria-live', 'polite');
  const sheet = '/title/auth/password-entry-landscape-sheet.webp';
  let entry: TextEntry | undefined;
  let emailAddress = '';
  let busy = false;
  let handle: ReturnType<AlertSystem['show']>;
  const setBusy = (button: HTMLButtonElement, value: boolean) => { busy = value; button.disabled = value; };

  const renderRequest = () => {
    entry?.destroy();
    const email = createTextEntry({ label: 'Email', type: 'email', placeholder: 'Email', required: true, autocomplete: 'email', sheet, clock });
    entry = email; email.setValue(emailAddress);
    const legal = document.createElement('label'); legal.className = 'sign-up-dialog__legal';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.required = true;
    const terms = document.createElement('a'); terms.href = '/terms.html'; terms.target = '_blank'; terms.rel = 'noopener'; terms.textContent = 'Terms of Service';
    const privacy = document.createElement('a'); privacy.href = '/privacy.html'; privacy.target = '_blank'; privacy.rel = 'noopener'; privacy.textContent = 'Privacy Policy';
    legal.append(checkbox, document.createTextNode(' I agree to the '), terms, document.createTextNode(' and acknowledge the '), privacy, document.createTextNode('.'));
    const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'Send code'; send.className = 'sign-up-dialog__plain-button';
    const form = document.createElement('form'); form.className = 'sign-up-dialog__form'; form.append(email.element, legal, send);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy || !email.input.reportValidity() || !checkbox.reportValidity()) return;
      status.textContent = ''; emailAddress = email.value().trim().toLowerCase(); setBusy(send, true);
      void actions.request(emailAddress, checkbox.checked).then(renderCode).catch((reason) => {
        status.textContent = reason instanceof Error ? reason.message : 'Could not send code. Try again.'; setBusy(send, false);
      });
    });
    content.replaceChildren(heading, form, status); queueMicrotask(() => email.focus());
  };

  const renderCode = () => {
    entry?.destroy(); busy = false;
    const instruction = document.createElement('p'); instruction.className = 'sign-up-dialog__instruction'; instruction.textContent = `Enter the code sent to ${emailAddress}.`;
    const code = createTextEntry({ label: 'Six-digit code', type: 'text', placeholder: '123 456', required: true, autocomplete: 'one-time-code', maxLength: 7, sheet, clock,
      validate: (value) => /^\d{3}\s?\d{3}$/.test(value.trim()) });
    entry = code; code.input.inputMode = 'numeric';
    const verify = document.createElement('button'); verify.type = 'submit'; verify.textContent = 'Verify'; verify.className = 'sign-up-dialog__plain-button';
    const resend = document.createElement('button'); resend.type = 'button'; resend.textContent = 'Resend'; resend.className = 'sign-up-dialog__plain-button';
    const change = document.createElement('button'); change.type = 'button'; change.textContent = 'Change email'; change.className = 'sign-up-dialog__plain-button';
    const controls = document.createElement('div'); controls.className = 'sign-up-dialog__controls'; controls.append(verify, resend, change);
    const form = document.createElement('form'); form.className = 'sign-up-dialog__form'; form.append(instruction, code.element, controls);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy || !code.validate()) return;
      status.textContent = ''; setBusy(verify, true); resend.disabled = true; change.disabled = true;
      void actions.verify(emailAddress, code.value().replace(/\s/g, '')).then(() => handle.close(true)).catch((reason) => {
        status.textContent = reason instanceof Error ? reason.message : 'Could not verify code. Try again.';
        setBusy(verify, false); resend.disabled = false; change.disabled = false;
      });
    });
    resend.addEventListener('click', () => {
      if (busy) return;
      status.textContent = ''; setBusy(resend, true); verify.disabled = true; change.disabled = true;
      void actions.resend(emailAddress).then(() => { status.textContent = 'New code sent.'; code.setValue(''); })
        .catch((reason) => { status.textContent = reason instanceof Error ? reason.message : 'Could not send code. Try again.'; })
        .finally(() => { setBusy(resend, false); verify.disabled = false; change.disabled = false; });
    });
    change.addEventListener('click', () => { if (!busy) { status.textContent = ''; renderRequest(); } });
    content.replaceChildren(heading, form, status); queueMicrotask(() => code.focus());
  };

  renderRequest();
  handle = alerts.show({ ariaLabel: 'New Account Creation', geometry: SIGN_UP_GEOMETRY, content, className: 'sign-up-alert', dismissible: true,
    actions: [{ label: 'Back', value: false, sheets: BACK_SHEETS }] });
  return handle.result.finally(() => entry?.destroy()).then((value) => value === true);
}
