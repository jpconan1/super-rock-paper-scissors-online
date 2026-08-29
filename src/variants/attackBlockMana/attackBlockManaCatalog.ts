import type { AbmClassId, AbmMove, AbmPlayerState } from './attackBlockManaTypes';

export interface AbmClassHooks {
  initialMana?: number;
  maximumBlocks?: number;
  manaGain?(turn: number, forced: boolean): number;
  validateMove?(move: AbmMove, player: Readonly<AbmPlayerState>): void;
}

export interface AbmClassDefinition {
  id: AbmClassId;
  name: string;
  description: string;
  asset: string;
  badgeAsset: string;
  implemented: boolean;
  hooks: AbmClassHooks;
}

const root = '/variants/abm';

export const ABM_CLASSES: readonly AbmClassDefinition[] = [
  entry('lucky', 'Lucky', 'Has a 1-in-4 chance to survive being attacked while gaining Mana.', true),
  entry('advantaged', 'Advantaged', 'Gains 2 Mana instead of 1 during the first three turns.', true),
  entry('thief', 'Thief', 'Once per game, steals 1 Mana from the opponent after Turn 4.', true, {}, 'theif'),
  entry('juggernaut', 'Juggernaut', 'Attacking twice consecutively prevents the opponent from Blocking next turn.', true),
  entry('investor', 'Investor', 'Starts with 5 Mana, loses 1 every third turn, and gains extra Mana when both players Mana.'),
  entry('sumo', 'The Sumo', 'Avoids paying for an Attack when both players Attack, up to three times.'),
  entry('cheater', 'Cheater', 'Has a 1-in-3 chance to gain 2 Mana instead of 1.'),
  entry('duplicator', 'Duplicator', 'Consecutive Mana moves double the amount gained each time.'),
  entry('stunner', 'Stunner', 'Attacking doubles the opponent\'s Attack cost on their next turn.'),
];

export const ABM_CLASS_BY_ID = new Map(ABM_CLASSES.map((definition) => [definition.id, definition]));

function entry(
  id: AbmClassId,
  name: string,
  description: string,
  implemented = false,
  hooks: AbmClassHooks = {},
  assetKey: string = id,
): AbmClassDefinition {
  return { id, name, description, implemented, hooks, asset: `${root}/${assetKey}-sheet.webp`, badgeAsset: `${root}/${assetKey}-badge-sheet.webp` };
}
