import type { BoilClock } from '../animation/boilClock';
import { PLAYER_EMBLEM_BY_ID, type PlayerEmblem } from '../core/playerEmblem';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';

const EMBLEM_BORDER_COUNT = 44;

export function emblemBorderNumber(displayName: string): number {
  const normalized = displayName.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
  let hash = 0x811c9dc5;
  for (const character of normalized) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % EMBLEM_BORDER_COUNT + 1;
}

export interface PlayerEmblemCard {
  element: HTMLDivElement;
  emblem: BoilingSprite;
  setEmblem(emblem: PlayerEmblem): void;
}

export function createPlayerEmblemCard(player: { name: string; level?: number; emblem?: PlayerEmblem }, clock: BoilClock): PlayerEmblemCard {
  const element = document.createElement('div');
  element.className = 'player-emblem-card';
  const level = Number.isSafeInteger(player.level) && player.level! > 0 ? player.level! : 1;
  let emblemKind = player.emblem ?? 'beta-og';
  const emblem = createBoilingSprite({ src: PLAYER_EMBLEM_BY_ID.get(emblemKind)!.sheet, clock, className: 'player-emblem-card__emblem', alt: '' });
  const border = document.createElement('img');
  border.className = 'player-emblem-card__border';
  border.src = `/emblems/borders/${emblemBorderNumber(player.name)}.webp`;
  border.alt = '';
  border.draggable = false;
  const name = document.createElement('strong');
  name.className = 'player-emblem-card__name';
  name.textContent = player.name;
  name.title = player.name;
  const levelLabel = document.createElement('span');
  levelLabel.className = 'player-emblem-card__level';
  levelLabel.textContent = `Lv ${level}`;
  const heading = document.createElement('div');
  heading.className = 'player-emblem-card__heading';
  heading.append(name, levelLabel);
  element.append(border, emblem.element, heading);
  const updateLabel = () => element.setAttribute('aria-label', `${player.name}, level ${level}, ${PLAYER_EMBLEM_BY_ID.get(emblemKind)!.name} emblem`);
  updateLabel();
  return {
    element,
    emblem,
    setEmblem(next) {
      if (next === emblemKind) return;
      emblemKind = next;
      emblem.setSource(PLAYER_EMBLEM_BY_ID.get(next)!.sheet);
      updateLabel();
    },
  };
}
