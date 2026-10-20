import type { BoilClock } from '../animation/boilClock';
import { PLAYER_EMBLEM_BY_ID, type EquippedPlayerEmblem, type PlayerEmblem } from '../core/playerEmblem';
import { customEmblemImageUrl, type CustomEmblemMeta } from '../core/customEmblem';
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
  setEmblem(emblem: EquippedPlayerEmblem | PlayerEmblem | null, customEmblem?: CustomEmblemMeta | null): void;
}

export function createPlayerEmblemCard(player: { name: string; level?: number; prestigeCount?: number; emblem?: PlayerEmblem | 'custom' | null; customEmblem?: CustomEmblemMeta | null }, clock: BoilClock): PlayerEmblemCard {
  const element = document.createElement('div');
  element.className = 'player-emblem-card';
  const level = Number.isSafeInteger(player.level) && player.level! > 0 ? player.level! : 1;
  let emblemKind = player.emblem ?? null;
  let custom = player.customEmblem ?? null;
  const outline = `/emblems/borders/${custom?.borderNumber ?? emblemBorderNumber(player.name)}.webp`;
  const initialDefinition = PLAYER_EMBLEM_BY_ID.get(emblemKind === 'custom' ? 'beta-og' : emblemKind ?? 'beta-og')
    ?? { id: '', name: '', sheet: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', ownable: false, systemOnly: false };
  const emblem = createBoilingSprite({
    src: emblemKind === 'custom' && custom ? customEmblemImageUrl(custom) : initialDefinition.sheet,
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
  levelLabel.textContent = player.prestigeCount ? `P. ${player.prestigeCount}` : `Lv ${level}`;
  const heading = document.createElement('div');
  heading.className = 'player-emblem-card__heading';
  heading.append(name, levelLabel);
  element.append(emblem.element, none, heading);
  const updateLabel = () => element.setAttribute('aria-label', `${player.name}, ${player.prestigeCount ? `prestige ${player.prestigeCount}` : `level ${level}`}, ${emblemKind === 'custom' ? 'custom emblem' : emblemKind ? `${PLAYER_EMBLEM_BY_ID.get(emblemKind)?.name ?? emblemKind.replace(/(^|-)(\w)/g, (_all, _dash, letter: string) => ` ${letter.toUpperCase()}`).trim()} emblem` : 'no emblem'}`);
  updateLabel();
  return {
    element,
    emblem,
    setEmblem(next, nextCustom = custom) {
      if (next === emblemKind && nextCustom?.version === custom?.version) return;
      emblemKind = next;
      custom = nextCustom ?? null;
      emblem.setArtworkVisible(next !== null); none.hidden = next !== null;
      if (next === 'custom' && custom) {
        emblem.setOutline({ src: `/emblems/borders/${custom.borderNumber}.webp`, chromaKey: EMBLEM_OUTLINE_CHROMA_KEY });
        emblem.setSource(customEmblemImageUrl(custom));
      } else if (next && next !== 'custom') {
        const definition = PLAYER_EMBLEM_BY_ID.get(next);
        if (!definition) return;
        emblem.setOutline({ src: `/emblems/borders/${emblemBorderNumber(player.name)}.webp`, chromaKey: EMBLEM_OUTLINE_CHROMA_KEY });
        emblem.setSource(definition.sheet, definition.frameCount);
      }
      updateLabel();
    },
  };
}
