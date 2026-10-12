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

export function showGuestNameDialog(alerts: AlertSystem, clock: BoilClock): Promise<string | undefined> {
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
  const enter = button('Enter lobby', '/interactive-elements/menu-buttons/lobby-button', () => form.requestSubmit(), 'guest-name-dialog__button');
  const controls = document.createElement('div'); controls.className = 'guest-name-dialog__controls'; controls.append(random.element, enter.element);
  form.append(entry.element, controls);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = resolveGuestName(entry.value());
    if (!name) { entry.validate(); entry.focus(); return; }
    handle.close(name);
  });
  content.append(heading, form);
  handle = alerts.show({ ariaLabel: 'Pick A Name', geometry: GUEST_NAME_GEOMETRY, content, className: 'guest-name-alert', dismissible: true, actions: [] });
  queueMicrotask(() => entry.focus());
  return handle.result.finally(() => { entry.destroy(); buttons.forEach((item) => item.destroy()); })
    .then((value) => typeof value === 'string' ? value : undefined);
}
