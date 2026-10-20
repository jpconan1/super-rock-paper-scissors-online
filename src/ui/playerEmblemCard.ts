import type { BoilClock } from '../animation/boilClock';
import { PLAYER_EMBLEM_BY_ID, type PlayerEmblem } from '../core/playerEmblem';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';

const EMBLEM_BORDER_COUNT = 28;
const EMBLEM_OUTLINE_CHROMA_KEY = [255, 64, 255] as const;

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
  setEmblem(emblem: PlayerEmblem | null): void;
}

export function createPlayerEmblemCard(player: { name: string; level?: number; emblem?: PlayerEmblem | null }, clock: BoilClock): PlayerEmblemCard {
  const element = document.createElement('div');
  element.className = 'player-emblem-card';
  const level = Number.isSafeInteger(player.level) && player.level! > 0 ? player.level! : 1;
  let emblemKind = player.emblem ?? null;
  const outline = `/emblems/borders/${emblemBorderNumber(player.name)}.webp`;
  const initialDefinition = PLAYER_EMBLEM_BY_ID.get(emblemKind ?? 'beta-og')!;
  const emblem = createBoilingSprite({
    src: initialDefinition.sheet,
    frameCount: initialDefinition.frameCount,
    clock,
    className: 'player-emblem-card__emblem',
    alt: '',
    outline: { src: outline, chromaKey: EMBLEM_OUTLINE_CHROMA_KEY },
  });
  emblem.setArtworkVisible(emblemKind !== null);
  const none = document.createElement('span'); none.className = 'player-emblem-card__none'; none.textContent = '(None)'; none.hidden = emblemKind !== null;
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
  element.append(emblem.element, none, heading);
  const updateLabel = () => element.setAttribute('aria-label', `${player.name}, level ${level}, ${emblemKind ? `${PLAYER_EMBLEM_BY_ID.get(emblemKind)!.name} emblem` : 'no emblem'}`);
  updateLabel();
  return {
    element,
    emblem,
    setEmblem(next) {
      if (next === emblemKind) return;
      emblemKind = next;
      emblem.setArtworkVisible(next !== null); none.hidden = next !== null;
      if (next) {
        const definition = PLAYER_EMBLEM_BY_ID.get(next)!;
        emblem.setSource(definition.sheet, definition.frameCount);
      }
      updateLabel();
    },
  };
}
