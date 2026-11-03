import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createBoilingSprite } from '../renderer/boilingSprite';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { isCompleteEmailCode, normalizeEmailCode } from './emailCodeChallenge';

const GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 220, y: 100, width: 520, height: 340 },
  portrait: { x: 40, y: 300, width: 460, height: 360 },
};

export interface CodeAlertActions {
  verify(code: string): Promise<void>;
  resend(): Promise<void>;
}

export function showCodeAlert(alerts: AlertSystem, clock: BoilClock, email: string, actions: CodeAlertActions): Promise<boolean> {
  const content = document.createElement('section'); content.className = 'code-alert';
  const instruction = document.createElement('p'); instruction.className = 'code-alert__instruction';
  instruction.textContent = `Enter the code sent to ${email}.`;
  const status = document.createElement('p'); status.className = 'code-alert__status'; status.setAttribute('aria-live', 'polite');
  const field = document.createElement('label'); field.className = 'code-alert__field';
  const box = createBoilingSprite({ src: '/auth/code/code-entry-box-sheet.webp', clock, className: 'code-alert__box', alt: '' });
  box.element.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input'); input.className = 'code-alert__input'; input.type = 'text';
  input.maxLength = 4; input.required = true; input.autocomplete = 'one-time-code'; input.inputMode = 'text';
  input.setAttribute('aria-label', 'Four-character email code');
  input.setAttribute('autocapitalize', 'none'); input.spellcheck = false;
  const placeholders = document.createElement('span'); placeholders.className = 'code-alert__placeholders'; placeholders.setAttribute('aria-hidden', 'true');
  const stars = Array.from({ length: 4 }, () => createBoilingSprite({ src: '/auth/code/code-entry-astrix-sheet.webp', clock, className: 'code-alert__star', alt: '' }));
  const slots = stars.map((star) => {
    const slot = document.createElement('span'); slot.className = 'code-alert__slot';
    const glyph = document.createElement('span'); glyph.className = 'code-alert__glyph';
    slot.append(star.element, glyph); placeholders.append(slot);
    return { slot, glyph };
  });
  const render = () => {
    const value = input.value;
    const caret = Math.min(input.selectionStart ?? value.length, 4);
    slots.forEach(({ slot, glyph }, index) => {
      glyph.textContent = value[index] ?? '';
      stars[index]!.element.hidden = index < value.length;
      slot.toggleAttribute('data-cursor', index === Math.min(caret, 3));
      slot.toggleAttribute('data-cursor-end', caret === 4 && index === 3);
    });
  };
  input.addEventListener('input', () => {
    const normalized = normalizeEmailCode(input.value).replace(/[^a-z0-9]/g, '').slice(0, 4);
    if (input.value !== normalized) input.value = normalized;
    render();
  });
  input.addEventListener('click', render);
  input.addEventListener('keyup', render);
  input.addEventListener('select', render);
  render();
  field.append(box.element, placeholders, input);
  const form = document.createElement('form'); form.className = 'code-alert__form';
  const resend = createGameButton({ label: 'Resend code', clock, onActivate: () => resendCode(),
    upSheet: '/title/auth/resend-code-button-up-sheet.webp', betweenSheet: '/title/auth/resend-code-button-between-sheet.webp',
    depressedSheet: '/title/auth/resend-code-button-depressed-sheet.webp' });
  const verify = createGameButton({ label: 'Verify', clock, onActivate: () => form.requestSubmit(),
    upSheet: '/auth/code/verify-button-up-sheet.webp', betweenSheet: '/auth/code/verify-button-between-sheet.webp',
    depressedSheet: '/auth/code/verify-button-depressed-sheet.webp' });
  resend.element.classList.add('code-alert__button', 'game-button--baked-label');
  verify.element.classList.add('code-alert__button', 'game-button--baked-label');
  const buttons = document.createElement('div'); buttons.className = 'code-alert__buttons'; buttons.append(resend.element, verify.element);
  form.append(field, buttons); content.append(instruction, form, status);
  let busy = false;
  let handle: ReturnType<AlertSystem['show']>;
  const setBusy = (next: boolean) => { busy = next; resend.setDisabled(next); verify.setDisabled(next); input.disabled = next; };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    if (!isCompleteEmailCode(input.value)) { status.textContent = 'Enter the four-character code.'; input.focus(); return; }
    status.textContent = ''; setBusy(true);
    void actions.verify(normalizeEmailCode(input.value)).then(() => handle.close(true)).catch((reason) => {
      status.textContent = reason instanceof Error ? reason.message : 'Could not verify code. Try again.';
      setBusy(false); input.focus();
    });
  });
  const resendCode = () => {
    if (busy) return;
    status.textContent = ''; setBusy(true);
    void actions.resend().then(() => { input.value = ''; render(); status.textContent = 'New code sent.'; })
      .catch((reason) => { status.textContent = reason instanceof Error ? reason.message : 'Could not send code. Try again.'; })
      .finally(() => { setBusy(false); input.focus(); });
  };
  handle = alerts.show({ ariaLabel: 'Enter Email Code', title: 'Check Your Email', geometry: GEOMETRY, content,
    className: 'code-entry-alert', dismissible: true, actions: [] });
  queueMicrotask(() => input.focus());
  return handle.result.finally(() => { box.destroy(); stars.forEach((star) => star.destroy()); resend.destroy(); verify.destroy(); }).then((result) => result === true);
}
