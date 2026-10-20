import type { BoilClock } from '../animation/boilClock';
import type { EmblemMissionId, EmblemMissionStatus } from '../core/emblemMission';
import { PLAYER_EMBLEM_BY_ID, type EquippedPlayerEmblem, type OwnablePlayerEmblem } from '../core/playerEmblem';
import { customEmblemImageUrl, type CustomEmblemMeta } from '../core/customEmblem';
import { createBoilingSprite } from '../renderer/boilingSprite';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { createGameButton } from '../input/gameButton';

const GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 100, y: 35, width: 760, height: 470 },
  portrait: { x: 25, y: 95, width: 490, height: 770 },
};

const MISSION_COPY: Record<EmblemMissionId, { title: string; detail: string }> = {
  'claim-account': { title: 'Claim Your Account', detail: 'Protect your guest account.' },
  'finish-tutorial': { title: 'Finish The Tutorial', detail: 'Complete one tutorial match.' },
  'unlock-all-classes': { title: 'Unlock Every Class', detail: 'Complete the class progression.' },
};

export function showEmblemMenuAlert(
  alerts: AlertSystem,
  clock: BoilClock,
  equipped: EquippedPlayerEmblem | null,
  owned: readonly OwnablePlayerEmblem[],
  customEmblem: CustomEmblemMeta | null,
  loadMissions: () => Promise<EmblemMissionStatus[]>,
  onChoose: (emblem: EquippedPlayerEmblem | null) => Promise<void>,
  onChosen: (emblem: EquippedPlayerEmblem | null) => void,
  onEditCustom: () => void,
): void {
  const content = document.createElement('section');
  content.className = 'emblem-menu';
  const choices = document.createElement('div');
  choices.className = 'emblem-menu__choices';
  const sprites: ReturnType<typeof createBoilingSprite>[] = [];
  let handle: ReturnType<AlertSystem['show']>;

  const available: Array<EquippedPlayerEmblem | null> = [null, ...owned, ...(customEmblem ? ['custom' as const] : [])];
  for (const emblem of available) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emblem-menu__choice';
    button.dataset.selected = String(emblem === equipped);
    button.setAttribute('aria-pressed', String(emblem === equipped));
    const art = document.createElement('span');
    art.className = 'emblem-menu__choice-art';
    if (emblem === 'custom' && customEmblem) {
      const sprite = createBoilingSprite({ src: customEmblemImageUrl(customEmblem), clock, className: 'emblem-menu__emblem', alt: '',
        outline: { src: `/emblems/borders/${customEmblem.borderNumber}.webp`, chromaKey: [255, 64, 255] } });
      sprites.push(sprite); art.append(sprite.element);
    } else if (emblem && emblem !== 'custom') {
      const definition = PLAYER_EMBLEM_BY_ID.get(emblem)!;
      const sprite = createBoilingSprite({
        src: definition.sheet, frameCount: definition.frameCount, clock, className: 'emblem-menu__emblem', alt: '',
      });
      sprites.push(sprite);
      art.append(sprite.element);
    } else {
      art.classList.add('emblem-menu__choice-art--none');
      art.textContent = 'None';
    }
    const label = document.createElement('strong');
    label.textContent = emblem === 'custom' ? 'Custom' : emblem ? PLAYER_EMBLEM_BY_ID.get(emblem)!.name : 'No Emblem';
    button.append(art, label);
    button.addEventListener('click', () => {
      if (button.disabled) return;
      for (const choice of choices.querySelectorAll<HTMLButtonElement>('button')) choice.disabled = true;
      void onChoose(emblem).then(() => { onChosen(emblem); handle.close(); }).catch(() => {
        for (const choice of choices.querySelectorAll<HTMLButtonElement>('button')) choice.disabled = false;
        status.textContent = 'Could not change emblem.';
      });
    });
    choices.append(button);
  }

  const customButton = createGameButton({ label: 'Custom Emblem', clock,
    upSheet: '/interactive-elements/custom-emblem-button-up-sheet.webp', betweenSheet: '/interactive-elements/custom-emblem-button-between-sheet.webp',
    depressedSheet: '/interactive-elements/custom-emblem-button-depressed-sheet.webp', onActivate: () => { handle.close(); onEditCustom(); } });
  customButton.element.classList.add('emblem-menu__custom-button', 'game-button--baked-label');

  const missionHeading = document.createElement('h3');
  missionHeading.textContent = 'Missions';
  const status = document.createElement('p');
  status.className = 'emblem-menu__status';
  status.textContent = 'Loading missions…';
  const missions = document.createElement('ul');
  missions.className = 'emblem-menu__missions';
  content.append(choices, customButton.element, missionHeading, status, missions);
  handle = alerts.show({
    ariaLabel: 'Choose Your Emblem', title: 'Choose Your Emblem', geometry: GEOMETRY, content,
    className: 'emblem-menu-alert', actions: [], dismissible: true,
  });
  void loadMissions().then((items) => {
    status.remove();
    for (const mission of items) {
      const item = document.createElement('li');
      item.className = 'emblem-menu__mission';
      item.dataset.completed = String(mission.completed);
      const mark = document.createElement('span');
      mark.className = 'emblem-menu__mission-mark';
      mark.textContent = mission.completed ? '✓' : '';
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = MISSION_COPY[mission.id].title;
      const detail = document.createElement('small');
      detail.textContent = MISSION_COPY[mission.id].detail;
      copy.append(title, detail);
      item.append(mark, copy);
      missions.append(item);
    }
  }).catch(() => { status.textContent = 'Could not load missions.'; });
  void handle.result.finally(() => { sprites.forEach((sprite) => sprite.destroy()); customButton.destroy(); });
}
