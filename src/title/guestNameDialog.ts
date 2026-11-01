import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createTextEntry } from '../input/textEntry';
import { normalizePlayerDisplayName, PLAYER_NAME_MAX_LENGTH } from '../protocol/playerProfile';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { generateRandomName } from './randomName';

const GUEST_NAME_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 220, y: 120, width: 520, height: 300 },
  portrait: { x: 40, y: 310, width: 460, height: 340 },
};

export function resolveGuestName(value: string, generate: () => string = generateRandomName): string | null {
  if (!value.trim()) return generate();
  return normalizePlayerDisplayName(value);
}

export function showGuestNameDialog(alerts: AlertSystem, clock: BoilClock,
  options: { mode?: 'guest' | 'google'; save?: (name: string) => Promise<void> } = {}): Promise<string | undefined> {
  const google = options.mode === 'google';
  const content = document.createElement('section'); content.className = 'guest-name-dialog';
  const heading = document.createElement('h2'); heading.className = 'guest-name-dialog__heading'; heading.textContent = 'Pick A Name!';
  const entry = createTextEntry({
    label: 'Display name', value: generateRandomName(), placeholder: 'Display name', maxLength: PLAYER_NAME_MAX_LENGTH,
    autocomplete: 'nickname', validate: (value) => !value.trim() || normalizePlayerDisplayName(value) !== null,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock,
  });
  entry.element.classList.add('guest-name-dialog__entry');
  const form = document.createElement('form'); form.className = 'guest-name-dialog__form';
  let handle: ReturnType<AlertSystem['show']>;
  const buttons: GameButton[] = [];
  const button = (label: string, root: string, activate: () => void, className: string) => {
    const result = createGameButton({ label, onActivate: activate, clock,
      upSheet: `${root}-up-sheet.webp`, betweenSheet: `${root}-between-sheet.webp`, depressedSheet: `${root}-depressed-sheet.webp` });
    result.element.classList.add(className, 'game-button--baked-label'); buttons.push(result); return result;
  };
  const random = button('Random name', '/interactive-elements/menu-buttons/name-button', () => {
    entry.setValue(generateRandomName()); entry.focus();
  }, 'guest-name-dialog__button');
  const enter = button(google ? 'Continue' : 'Enter lobby', google ? '/new-buttons/continue-button-w' : '/interactive-elements/menu-buttons/lobby-button', () => form.requestSubmit(), 'guest-name-dialog__button');
  const controls = document.createElement('div'); controls.className = 'guest-name-dialog__controls'; controls.append(random.element, enter.element);
  form.append(entry.element, controls);
  const error = document.createElement('p'); error.className = 'guest-name-dialog__error'; error.setAttribute('role', 'alert'); error.hidden = true;
  let saving = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (saving) return;
    const name = resolveGuestName(entry.value());
    if (!name) { entry.validate(); entry.focus(); return; }
    if (!options.save) { handle.close(name); return; }
    saving = true; enter.setDisabled(true); random.setDisabled(true); error.hidden = true;
    void options.save(name).then(() => handle.close(name)).catch(() => {
      error.textContent = 'Could not save your name. Try again.'; error.hidden = false;
      entry.focus();
    }).finally(() => { saving = false; enter.setDisabled(false); random.setDisabled(false); });
  });
  content.append(heading, form, error);
  handle = alerts.show({ ariaLabel: 'Pick A Name', geometry: GUEST_NAME_GEOMETRY, content, className: 'guest-name-alert', dismissible: !google, actions: [] });
  queueMicrotask(() => entry.focus());
  return handle.result.finally(() => { entry.destroy(); buttons.forEach((item) => item.destroy()); })
    .then((value) => typeof value === 'string' ? value : undefined);
}
