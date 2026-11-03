import type { BoilClock } from '../animation/boilClock';
import type { EmblemMissionFeed, EmblemMissionStatus } from '../core/emblemMission';
import { emblemArtworkFrameCount, emblemArtworkSource, PLAYER_EMBLEM_BY_ID, type EquippedPlayerEmblem, type OwnablePlayerEmblem } from '../core/playerEmblem';
import { customEmblemImageUrl, type CustomEmblemMeta } from '../core/customEmblem';
import { createButtonFaceArtwork } from '../renderer/buttonFaceArtwork';
import { createBoilingSprite } from '../renderer/boilingSprite';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { createGameButton, type GameButton } from '../input/gameButton';

const GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 100, y: 35, width: 760, height: 470 },
  portrait: { x: 25, y: 95, width: 490, height: 770 },
};
const BLANK_BUTTON = {
  upSheet: '/interactive-elements/generic-buttons/generic2-up-sheet.webp',
  betweenSheet: '/interactive-elements/generic-buttons/generic2-between-sheet.webp',
  depressedSheet: '/interactive-elements/generic-buttons/generic2-sheet.webp',
} as const;
const BLANK_BUTTON_FACE_SHEETS = {
  up: BLANK_BUTTON.upSheet,
  between: BLANK_BUTTON.betweenSheet,
  depressed: BLANK_BUTTON.depressedSheet,
} as const;
const NONE_BUTTON = {
  upSheet: '/interactive-elements/none-button-up-sheet.webp',
  betweenSheet: '/interactive-elements/none-button-between-sheet.webp',
  depressedSheet: '/interactive-elements/none-button-depressed-sheet.webp',
} as const;

interface EmblemChoice {
  emblem: EquippedPlayerEmblem | null;
  button: GameButton;
}

export function showEmblemMenuAlert(
  alerts: AlertSystem,
  clock: BoilClock,
  equipped: EquippedPlayerEmblem | null,
  owned: readonly OwnablePlayerEmblem[],
  customEmblem: CustomEmblemMeta | null,
  loadMissions: () => Promise<EmblemMissionFeed>,
  onChoose: (emblem: EquippedPlayerEmblem | null) => Promise<void>,
  onChosen: (emblem: EquippedPlayerEmblem | null) => void,
  onEditCustom: () => void,
): Promise<void> {
  const content = document.createElement('section'); content.className = 'emblem-menu';
  const collectionSection = document.createElement('section'); collectionSection.className = 'emblem-menu__section emblem-menu__section--collection';
  const collectionHeading = document.createElement('h3'); collectionHeading.textContent = 'Emblems';
  const choices = document.createElement('div'); choices.className = 'emblem-menu__choices'; choices.setAttribute('role', 'radiogroup'); choices.setAttribute('aria-label', 'Emblem collection');
  const choiceStatus = document.createElement('p'); choiceStatus.className = 'emblem-menu__choice-status'; choiceStatus.hidden = true;
  const sprites: ReturnType<typeof createBoilingSprite>[] = [];
  const faceArtworks: ReturnType<typeof createButtonFaceArtwork>[] = [];
  const controls: GameButton[] = [];
  const choiceRecords: EmblemChoice[] = [];
  let handle: ReturnType<AlertSystem['show']>;
  let saving = false;

  const available: Array<EquippedPlayerEmblem | null> = [null, ...owned, ...(customEmblem ? ['custom' as const] : [])];
  let selected = available.includes(equipped) ? equipped : null;
  const setChoicesDisabled = (disabled: boolean) => {
    for (const choice of choiceRecords) choice.button.setDisabled(disabled);
  };
  const setChoiceSelected = (emblem: EquippedPlayerEmblem | null, value: boolean) => {
    const choice = choiceRecords.find((item) => item.emblem === emblem);
    choice?.button.setLockedDepressed(value);
    choice?.button.element.setAttribute('aria-checked', String(value));
  };
  const choose = (next: EquippedPlayerEmblem | null) => {
    if (saving || next === selected) return;
    const previous = selected;
    saving = true;
    choiceStatus.hidden = true;
    setChoiceSelected(previous, false);
    setChoiceSelected(next, true);
    setChoicesDisabled(true);
    customButton.setDisabled(true);
    void onChoose(next).then(() => {
      selected = next;
      onChosen(next);
    }).catch(() => {
      setChoiceSelected(next, false);
      setChoiceSelected(previous, true);
      choiceStatus.textContent = 'Could not change emblem.';
      choiceStatus.hidden = false;
    }).finally(() => {
      saving = false;
      setChoicesDisabled(false);
      customButton.setDisabled(false);
    });
  };

  for (const emblem of available) {
    const name = emblem === 'custom' ? 'Custom' : emblem ? PLAYER_EMBLEM_BY_ID.get(emblem)?.name ?? emblem : 'No Emblem';
    const button = createGameButton({ label: name, clock, ...(emblem === null ? NONE_BUTTON : BLANK_BUTTON), lockedDepressed: emblem === selected,
      activateAtReleaseStart: true, onActivate: () => choose(emblem) });
    button.element.classList.add('emblem-menu__choice', 'game-button--baked-label');
    button.element.setAttribute('role', 'radio');
    button.element.setAttribute('aria-checked', String(emblem === selected));
    button.element.title = name;
    const art = document.createElement('span'); art.className = 'emblem-menu__choice-art';
    let sprite: ReturnType<typeof createBoilingSprite> | null = null;
    if (emblem === 'custom' && customEmblem) {
      sprite = createBoilingSprite({ src: customEmblemImageUrl(customEmblem), clock, className: 'emblem-menu__emblem', alt: '',
        outline: { src: `/emblems/borders/${customEmblem.borderNumber}.webp`, chromaKey: [255, 64, 255] } });
    } else if (emblem) {
      const definition = PLAYER_EMBLEM_BY_ID.get(emblem);
      if (definition) {
        sprite = createBoilingSprite({ src: emblemArtworkSource(definition), frameCount: emblemArtworkFrameCount(definition), clock, className: 'emblem-menu__emblem', alt: '' });
      }
    }
    if (sprite) {
      sprites.push(sprite);
      const faceArtwork = createButtonFaceArtwork({ button, sprite, clock, sheets: BLANK_BUTTON_FACE_SHEETS, className: 'emblem-menu__choice-canvas' });
      faceArtworks.push(faceArtwork); art.append(faceArtwork.element);
    }
    button.element.append(art);
    choices.append(button.element);
    controls.push(button); choiceRecords.push({ emblem, button });
  }

  const customButton = createGameButton({ label: 'Custom Emblem', clock,
    upSheet: '/interactive-elements/custom-emblem-button-up-sheet.webp', betweenSheet: '/interactive-elements/custom-emblem-button-between-sheet.webp',
    depressedSheet: '/interactive-elements/custom-emblem-button-depressed-sheet.webp', onActivate: () => { handle.close(); onEditCustom(); } });
  customButton.element.classList.add('emblem-menu__custom-button', 'game-button--baked-label');
  customButton.element.hidden = customEmblem === null;
  controls.push(customButton);
  collectionSection.append(collectionHeading, choices, customButton.element, choiceStatus);

  const missionSection = document.createElement('section'); missionSection.className = 'emblem-menu__section emblem-menu__section--missions';
  const missionScroll = document.createElement('div'); missionScroll.className = 'emblem-menu__mission-scroll';
  const contest = document.createElement('section'); contest.className = 'emblem-menu__contest'; contest.hidden = true;
  const contestHeading = document.createElement('h3'); contestHeading.textContent = 'Contest';
  const contestCopy = document.createElement('p'); contestCopy.className = 'emblem-menu__contest-copy';
  contestCopy.textContent = 'The first ten players to Prestige get a one-of-a-kind Emblem!';
  const contestClaimed = document.createElement('small'); contestClaimed.className = 'emblem-menu__contest-claimed';
  const contestArt = document.createElement('span'); contestArt.className = 'emblem-menu__contest-art';
  contest.append(contestHeading, contestCopy, contestClaimed, contestArt);
  const missionHeading = document.createElement('h3'); missionHeading.textContent = 'Missions';
  const missionCopy = document.createElement('p'); missionCopy.className = 'emblem-menu__contest-copy emblem-menu__mission-copy';
  missionCopy.textContent = 'Complete Missions to get new Emblems!';
  const missionStatus = document.createElement('p'); missionStatus.className = 'emblem-menu__status'; missionStatus.textContent = 'Loading missions…';
  const missions = document.createElement('ul'); missions.className = 'emblem-menu__missions';
  missionScroll.append(contest, missionHeading, missionCopy, missionStatus, missions); missionSection.append(missionScroll);
  content.append(collectionSection, missionSection);
  handle = alerts.show({ ariaLabel: 'Choose Your Emblem', title: 'Choose Your Emblem', geometry: GEOMETRY, content,
    className: 'emblem-menu-alert', actions: [], dismissible: true });

  void loadMissions().then(({ contest: contestStatus, missions: items }) => {
    if (contestStatus.active) {
      contest.hidden = false;
      contestClaimed.textContent = `${contestStatus.claimed} Emblems claimed`;
      const definition = PLAYER_EMBLEM_BY_ID.get('first-place');
      if (definition) {
        const sprite = createBoilingSprite({ src: emblemArtworkSource(definition), frameCount: emblemArtworkFrameCount(definition),
          clock, className: 'emblem-menu__contest-emblem', alt: 'First place emblem' });
        sprites.push(sprite); contestArt.append(sprite.element);
      }
    }
    customButton.element.hidden = customEmblem === null && !items.some((mission) => mission.id === 'win-online-match' && mission.completed);
    const listedMissions = items.filter((mission) => mission.id !== 'prestige-contest');
    if (!listedMissions.length) { missionStatus.textContent = 'No current missions.'; return; }
    missionStatus.remove();
    for (const mission of listedMissions) {
      const row = createEmblemMissionRow(mission, clock);
      sprites.push(...row.sprites); missions.append(row.element);
    }
  }).catch(() => { missionStatus.textContent = 'Could not load missions.'; });
  return handle.result.then(() => {
    faceArtworks.forEach((artwork) => artwork.destroy());
    controls.forEach((control) => control.destroy()); sprites.forEach((sprite) => sprite.destroy());
  });
}

export function createEmblemMissionRow(mission: EmblemMissionStatus, clock: BoilClock, rewardText = 'Reward:', compact = false): { element: HTMLLIElement; sprites: ReturnType<typeof createBoilingSprite>[] } {
  const item = document.createElement('li'); item.className = 'emblem-menu__mission'; item.dataset.completed = String(mission.completed);
  const mark = document.createElement('span'); mark.className = 'emblem-menu__mission-mark'; mark.textContent = mission.completed ? '✓' : '';
  const copy = document.createElement('span');
  const title = document.createElement('strong'); title.textContent = mission.title;
  copy.append(title);
  if (!compact) {
    const detail = document.createElement('small'); detail.textContent = mission.detail;
    copy.append(detail);
  }
  const rewardId = mission.rewardKind === 'feature' ? null : mission.rewardEmblemId;
  const rewardDefinition = rewardId ? PLAYER_EMBLEM_BY_ID.get(rewardId) : undefined;
  const rewardSource = rewardDefinition ? emblemArtworkSource(rewardDefinition)
    : mission.rewardKind === 'feature' && mission.rewardReference === 'custom-emblem'
      ? '/interactive-elements/custom-emblem-button-depressed-sheet.webp' : null;
  const sprites: ReturnType<typeof createBoilingSprite>[] = [];
  if (rewardSource) {
    const rewardLabel = document.createElement('small'); rewardLabel.className = 'emblem-menu__reward-label'; rewardLabel.textContent = rewardText;
    const rewardArt = document.createElement('span'); rewardArt.className = 'emblem-menu__reward-art';
    const reward = createBoilingSprite({ src: rewardSource, frameCount: rewardDefinition ? emblemArtworkFrameCount(rewardDefinition) : 3,
      clock, className: 'emblem-menu__reward-emblem', alt: rewardDefinition?.name ?? 'Custom Emblem' });
    sprites.push(reward); rewardArt.append(reward.element);
    copy.append(rewardLabel, rewardArt);
  }
  item.append(mark, copy);
  return { element: item, sprites };
}
