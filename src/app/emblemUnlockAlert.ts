import type { BoilClock } from '../animation/boilClock';
import { playCatalogSound } from '../audio/soundCatalog';
import type { EmblemMissionStatus } from '../core/emblemMission';
import type { AlertSystem } from '../ui/alertSystem';
import { createEmblemMissionRow } from './emblemMenuAlert';

export function showEmblemUnlockAlert(alerts: AlertSystem, clock: BoilClock, mission: EmblemMissionStatus, onChangeEmblem?: () => void): Promise<void> {
  const list = document.createElement('ul'); list.className = 'emblem-menu__missions';
  const row = createEmblemMissionRow(mission, clock, 'You earned:', true);
  list.append(row.element);
  const prestige = mission.id === 'prestige';
  const content = document.createElement('div'); content.className = 'emblem-unlock-alert__body';
  content.append(list);
  if (prestige) {
    const message = document.createElement('p'); message.className = 'emblem-unlock-alert__message';
    message.textContent = 'Thank you so much for playing my game!! -JP Conan';
    content.append(message);
  }
  const handle = alerts.show({
    ariaLabel: 'You Unlocked an Emblem!', title: 'You Unlocked an Emblem!',
    geometry: prestige
      ? { landscape: { x: 200, y: 45, width: 560, height: 470 }, portrait: { x: 45, y: 215, width: 450, height: 530 } }
      : { landscape: { x: 200, y: 75, width: 560, height: 410 }, portrait: { x: 45, y: 255, width: 450, height: 450 } },
    content, actions: [
      { label: 'Neat', value: 'dismiss', sheets: {
        up: '/interactive-elements/neat-button-up-sheet.webp',
        between: '/interactive-elements/neat-button-between-sheet.webp',
        depressed: '/interactive-elements/neat-button-depressed-sheet.webp',
      } },
      ...(onChangeEmblem ? [{ label: 'Change your Emblem', value: 'change-emblem', sheets: {
        up: '/interactive-elements/emblem-button-up-sheet.webp',
        between: '/interactive-elements/emblem-button-between-sheet.webp',
        depressed: '/interactive-elements/emblem-button-depressed-sheet.webp',
      }, onActivate: onChangeEmblem }] : []),
    ], dismissible: true, className: 'emblem-unlock-alert',
  });
  playCatalogSound('emblem-unlock');
  return handle.result.then(() => { row.sprites.forEach((sprite) => sprite.destroy()); });
}
