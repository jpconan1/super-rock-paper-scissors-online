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
  implemented: boolean;
  hooks: AbmClassHooks;
}

const root = '/variants/abm';

export const ABM_CLASSES: readonly AbmClassDefinition[] = [
  entry('lucky', 'Lucky', 'When attacked while gaining Mana, you have a chance to survive.'),
  entry('advantaged', 'Advantaged', 'Gain 2 Mana instead of 1 during Turns 1, 2, and 3.', true, {
    manaGain: (turn) => turn <= 3 ? 2 : 1,
  }),
  entry('thief', 'Thief', 'From Turn 5 onward, steal 1 Mana from your opponent once per round.', false, {}, 'theif'),
  entry('juggernaut', 'Juggernaut', 'After every second consecutive Attack, your opponent cannot Block next turn.'),
  entry('stunner', 'Stunner', 'Consecutive Attacks increase your opponent\'s next Attack cost.'),
  entry('duplicator', 'Duplicator', 'Consecutive Mana actions gain 1, then 2, then 4, then 8 Mana.'),
  entry('gambler', 'Gambler', 'Blocking triggers one of eight random resource effects.'),
  entry('tax-collector', 'Tax Collector', 'Spend an activation to remove 1 Mana from both players.', false, {}, 'taxcollector'),
  entry('copywriter', 'Copywriter', 'Gain Mana when your opponent repeats the same move three times.'),
  entry('conjurer', 'Conjurer', 'Spend 1 Mana to see your opponent\'s committed move before choosing yours.'),
  entry('sumo', 'The Sumo', 'Refund your Attack cost when both players Attack, up to three times.'),
  entry('fireborne', 'Fireborne', 'Spend 1 Mana to gain a temporary extra life.'),
  entry('retired', 'Retired', 'Start with 7 Mana, but Mana actions cannot increase it.'),
  entry('parrymaster', 'Parrymaster', 'Parry before choosing your move; an attacking opponent loses extra Mana.'),
  entry('cheater', 'Cheater', 'Mana actions sometimes gain 2 Mana instead of 1.'),
  entry('cupid', 'Cupid', 'Matching your opponent\'s move grants a temporary bonus effect.'),
  entry('investor', 'Investor', 'Start with 5 Mana, gain extra Mana together, and pay tax every third turn.'),
  entry('defender', 'Defender', 'Blocking an Attack does not consume one of your Blocks.'),
  entry('last-ditch', 'Last Ditch', 'Forced Mana turns grant increasingly larger Mana recoveries.', false, {}, 'lastditch'),
  entry('null', 'Null', 'Once per round, reset both players to their starting class state.'),
  entry('joe', 'Joe', 'A forbidden joke class with an extremely rare infinite-Mana effect.'),
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
  return { id, name, description, implemented, hooks, asset: `${root}/${assetKey}-placeholder-sheet.webp` };
}
