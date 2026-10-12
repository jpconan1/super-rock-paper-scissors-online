import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createTextEntry, type TextEntry } from '../input/textEntry';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { generateRandomName } from './randomName';

const SIGN_UP_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 130, y: 5, width: 700, height: 530 },
  portrait: { x: 20, y: 90, width: 500, height: 780 },
};
const BACK_SHEETS = {
  up: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
  between: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
  depressed: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp',
};

export interface EmailSignupActions {
  request(displayName: string, email: string, legalAccepted: boolean): Promise<void>;
  verify(email: string, code: string, password?: string): Promise<void>;
  resend(displayName: string, email: string): Promise<void>;
}

export function showSignUpDialog(alerts: AlertSystem, clock: BoilClock, actions: EmailSignupActions): Promise<boolean> {
  const content = document.createElement('section'); content.className = 'sign-up-dialog';
  const heading = document.createElement('h2'); heading.className = 'sign-up-dialog__heading'; heading.textContent = 'New Account Creation';
  const status = document.createElement('p'); status.className = 'sign-up-dialog__status'; status.setAttribute('aria-live', 'polite');
  const sheet = '/title/auth/password-entry-landscape-sheet.webp';
  let entries: TextEntry[] = [];
  let buttons: GameButton[] = [];
  let emailAddress = '';
  let chosenDisplayName = '';
  let chosenPassword = '';
  let busy = false;
  let handle: ReturnType<AlertSystem['show']>;
  const setBusy = (button: HTMLButtonElement, value: boolean) => { busy = value; button.disabled = value; };
  const destroyControls = () => {
    entries.forEach((entry) => entry.destroy()); entries = [];
    buttons.forEach((button) => button.destroy()); buttons = [];
  };

  const renderRequest = () => {
    destroyControls();
    const displayName = createTextEntry({ label: 'Display name', value: generateRandomName(), placeholder: 'Display name', required: true,
      maxLength: 24, autocomplete: 'nickname', sheet, clock });
    const randomName = createGameButton({ label: 'Random name', onActivate: () => { displayName.setValue(generateRandomName()); displayName.focus(); }, clock,
      upSheet: '/interactive-elements/menu-buttons/name-button-up-sheet.webp',
      betweenSheet: '/interactive-elements/menu-buttons/name-button-between-sheet.webp',
      depressedSheet: '/interactive-elements/menu-buttons/name-button-depressed-sheet.webp' });
    randomName.element.classList.add('sign-up-dialog__random-name', 'game-button--baked-label');
    const nameRow = document.createElement('div'); nameRow.className = 'sign-up-dialog__name-row'; nameRow.append(displayName.element, randomName.element);
    const nameHint = document.createElement('p'); nameHint.className = 'sign-up-dialog__hint';
    nameHint.textContent = "(Don't think about your display name too hard, you can change it any time.)";
    const nameGap = document.createElement('div'); nameGap.className = 'sign-up-dialog__section-gap'; nameGap.setAttribute('aria-hidden', 'true');
    const email = createTextEntry({ label: 'Email', type: 'email', placeholder: 'Email', required: true, autocomplete: 'email', sheet, clock });
    const emailHint = document.createElement('p'); emailHint.className = 'sign-up-dialog__hint';
    emailHint.textContent = "Email required for account recovery. We'll never sell or give away your email.";
    const emailGap = document.createElement('div'); emailGap.className = 'sign-up-dialog__section-gap'; emailGap.setAttribute('aria-hidden', 'true');
    const password = createTextEntry({ label: 'Password', type: 'password', placeholder: 'Password', autocomplete: 'new-password', sheet, clock });
    const confirmPassword = createTextEntry({ label: 'Confirm password', type: 'password', placeholder: 'Confirm password', autocomplete: 'new-password', sheet, clock });
    const passwordRow = document.createElement('div'); passwordRow.className = 'sign-up-dialog__password-row'; passwordRow.append(password.element, confirmPassword.element);
    const passwordHint = document.createElement('p'); passwordHint.className = 'sign-up-dialog__hint';
    passwordHint.textContent = 'Passwords are optional; you can just log in with an email code if you want.';
    const passwordFields = document.createElement('div'); passwordFields.className = 'sign-up-dialog__password-fields'; passwordFields.hidden = true;
    password.input.minLength = 8; password.input.maxLength = 128;
    confirmPassword.input.minLength = 8; confirmPassword.input.maxLength = 128;
    passwordFields.append(passwordRow, passwordHint);
    entries = [displayName, password, confirmPassword, email]; email.setValue(emailAddress);
    const legal = document.createElement('label'); legal.className = 'sign-up-dialog__legal';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.required = true;
    const terms = document.createElement('a'); terms.href = '/terms.html'; terms.target = '_blank'; terms.rel = 'noopener'; terms.textContent = 'Terms of Service';
    const privacy = document.createElement('a'); privacy.href = '/privacy.html'; privacy.target = '_blank'; privacy.rel = 'noopener'; privacy.textContent = 'Privacy Policy';
    legal.append(checkbox, document.createTextNode(' I agree to the '), terms, document.createTextNode(' and acknowledge the '), privacy, document.createTextNode('.'));
    const form = document.createElement('form'); form.className = 'sign-up-dialog__form';
    const addPassword = createGameButton({ label: 'Add password', onActivate: () => {
      addPassword.element.hidden = true; passwordFields.hidden = false; password.focus();
    }, clock,
    upSheet: '/title/auth/add-password-button-up-sheet.webp', betweenSheet: '/title/auth/add-password-button-between-sheet.webp',
    depressedSheet: '/title/auth/add-password-button-depressed-sheet.webp' });
    addPassword.element.classList.add('sign-up-dialog__add-password', 'game-button--baked-label');
    const send = createGameButton({ label: 'Send code', onActivate: () => form.requestSubmit(), clock,
      upSheet: '/title/auth/send-code-button-up-sheet.webp', betweenSheet: '/title/auth/send-code-button-between-sheet.webp',
      depressedSheet: '/title/auth/send-code-button-depressed-sheet.webp' });
    send.element.classList.add('sign-up-dialog__send-code', 'game-button--baked-label');
    const submitRow = document.createElement('div'); submitRow.className = 'sign-up-dialog__submit-row'; submitRow.append(addPassword.element, send.element);
    const back = createGameButton({ label: 'Back', onActivate: () => handle.close(false), clock,
      upSheet: BACK_SHEETS.up, betweenSheet: BACK_SHEETS.between, depressedSheet: BACK_SHEETS.depressed });
    back.element.classList.add('sign-up-dialog__back', 'game-button--baked-label');
    const legalRow = document.createElement('div'); legalRow.className = 'sign-up-dialog__legal-row'; legalRow.append(legal, back.element);
    buttons = [randomName, addPassword, send, back];
    const validatePasswords = () => {
      const lengthValid = passwordFields.hidden || (password.value().length >= 8 && password.value().length <= 128);
      password.input.setCustomValidity(lengthValid ? '' : 'Password must be 8-128 characters.');
      const matches = passwordFields.hidden || password.value() === confirmPassword.value();
      confirmPassword.input.setCustomValidity(matches ? '' : 'Passwords do not match.');
      return lengthValid && matches;
    };
    password.input.addEventListener('input', validatePasswords);
    confirmPassword.input.addEventListener('input', validatePasswords);
    form.append(nameRow, nameHint, nameGap, email.element, emailHint, emailGap, passwordFields, submitRow, legalRow);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy || !displayName.input.reportValidity() || !validatePasswords() || !confirmPassword.input.reportValidity()
        || !email.input.reportValidity() || !checkbox.reportValidity()) return;
      status.textContent = ''; emailAddress = email.value().trim().toLowerCase(); chosenDisplayName = displayName.value().trim();
      chosenPassword = passwordFields.hidden ? '' : password.value(); busy = true; send.setDisabled(true); randomName.setDisabled(true);
      void actions.request(chosenDisplayName, emailAddress, checkbox.checked).then(renderCode).catch((reason) => {
        status.textContent = reason instanceof Error ? reason.message : 'Could not send code. Try again.';
        busy = false; send.setDisabled(false); randomName.setDisabled(false);
      });
    });
    content.replaceChildren(heading, form, status); queueMicrotask(() => displayName.focus());
  };

  const renderCode = () => {
    destroyControls(); busy = false;
    const instruction = document.createElement('p'); instruction.className = 'sign-up-dialog__instruction'; instruction.textContent = `Enter the code sent to ${emailAddress}.`;
    const code = createTextEntry({ label: 'Six-digit code', type: 'text', placeholder: '123 456', required: true, autocomplete: 'one-time-code', maxLength: 7, sheet, clock,
      validate: (value) => /^\d{3}\s?\d{3}$/.test(value.trim()) });
    entries = [code]; code.input.inputMode = 'numeric';
    const verify = document.createElement('button'); verify.type = 'submit'; verify.textContent = 'Verify'; verify.className = 'sign-up-dialog__plain-button';
    const resend = document.createElement('button'); resend.type = 'button'; resend.textContent = 'Resend'; resend.className = 'sign-up-dialog__plain-button';
    const change = document.createElement('button'); change.type = 'button'; change.textContent = 'Change email'; change.className = 'sign-up-dialog__plain-button';
    const controls = document.createElement('div'); controls.className = 'sign-up-dialog__controls'; controls.append(verify, resend, change);
    const form = document.createElement('form'); form.className = 'sign-up-dialog__form'; form.append(instruction, code.element, controls);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy || !code.validate()) return;
      status.textContent = ''; setBusy(verify, true); resend.disabled = true; change.disabled = true;
      void actions.verify(emailAddress, code.value().replace(/\s/g, ''), chosenPassword || undefined).then(() => handle.close(true)).catch((reason) => {
        status.textContent = reason instanceof Error ? reason.message : 'Could not verify code. Try again.';
        setBusy(verify, false); resend.disabled = false; change.disabled = false;
      });
    });
    resend.addEventListener('click', () => {
      if (busy) return;
      status.textContent = ''; setBusy(resend, true); verify.disabled = true; change.disabled = true;
      void actions.resend(chosenDisplayName, emailAddress).then(() => { status.textContent = 'New code sent.'; code.setValue(''); })
        .catch((reason) => { status.textContent = reason instanceof Error ? reason.message : 'Could not send code. Try again.'; })
        .finally(() => { setBusy(resend, false); verify.disabled = false; change.disabled = false; });
    });
    change.addEventListener('click', () => { if (!busy) { status.textContent = ''; renderRequest(); } });
    content.replaceChildren(heading, form, status); queueMicrotask(() => code.focus());
  };

  renderRequest();
  handle = alerts.show({ ariaLabel: 'New Account Creation', geometry: SIGN_UP_GEOMETRY, content, className: 'sign-up-alert', dismissible: true,
    actions: [] });
  return handle.result.finally(() => { chosenPassword = ''; destroyControls(); }).then((value) => value === true);
}
