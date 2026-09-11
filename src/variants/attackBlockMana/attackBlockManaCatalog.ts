import type { AbmAbilityId, AbmClassId, AbmMove, AbmPlayerState } from './attackBlockManaTypes';

export interface AbmActivatedAbilityDefinition {
  id: AbmAbilityId;
  label: string;
  uses: number;
  manaCost: number;
  inputStrategy: 'arm-with-move' | 'opponent-first' | 'standalone';
  buttonAssets: { up: string; between: string; depressed: string };
  available?(player: Readonly<AbmPlayerState>, turn: number): boolean;
}

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
  ability?: AbmActivatedAbilityDefinition;
}

const root = '/variants/abm';

export const ABM_CLASSES: readonly AbmClassDefinition[] = [
  entry('lucky', 'Lucky', 'Has a 1-in-4 chance to survive being attacked while gaining Mana.', true),
  entry('advantaged', 'Advantaged', 'Gains 2 Mana instead of 1 during the first three turns.', true),
  entry('thief', 'Thief', 'Once per game, steals 1 Mana from the opponent after Turn 4.', true, {}, 'thief', ability('steal', 'Steal', 1, 0, (player, turn) => turn >= 5)),
  entry('juggernaut', 'Juggernaut', 'Attacking twice consecutively prevents the opponent from Blocking next turn.', true),
  entry('stunner', 'Stunner', 'Attacking doubles the opponent\'s next Attack cost, up to 8 Mana.', true),
  entry('duplicator', 'Duplicator', 'Consecutive Mana moves double the amount gained each time.', true),
  entry('sumo', 'The Sumo', 'Avoids paying for an Attack when both players Attack, up to three times.', true),
  entry('cheater', 'Cheater', 'Has a 1-in-3 chance to gain 2 Mana instead of 1.', true),
  entry('investor', 'Investor', 'Starts with 5 Mana, loses 1 every third turn, and gains extra Mana when both players Mana.', true, { initialMana: 5 }),
  entry('gambler', 'Gambler', 'Every Block rolls for a random Mana or Block effect. Starts with 3 Blocks.', true, { maximumBlocks: 3 }),
  entry('taxman', 'Taxman', 'Collects 1 Mana from both players after moves resolve, up to three times.', true, {}, 'taxman', ability('collect', 'Collect', 3, 0, (player) => player.mana > 0)),
  entry('copywriter', 'Copywriter', 'Gains 1 Mana when the opponent makes the same move three times in a row.', true),
  entry('conjurer', 'Conjurer', 'Twice per game, pays 1 Mana to see the opponent\'s move before choosing.', true, {}, 'conjurer', ability('conjure', 'Conjure', 2, 1, undefined, 'opponent-first')),
  entry('fireborne', 'Fireborne', 'Once per game, pays 1 Mana for an extra life lasting five turns, beginning next turn.', true, {}, 'fireborne', ability('flame', 'Flame', 1, 1)),
  entry('retired', 'Retired', 'Starts with 7 Mana and 4 Blocks, but cannot gain Mana. Two depleted Retired players become classless.', true, { initialMana: 7, maximumBlocks: 4, manaGain: () => 0 }),
  entry('parrymaster', 'Parrymaster', 'Once per game, Parry makes an attacking opponent lose 2 additional Mana.', true, {}, 'parrymaster', ability('parry', 'Parry', 1, 0)),
  entry('cupid', 'Cupid', 'Golden Arrow rewards matching the opponent\'s move for five turns, beginning next turn.', true, {}, 'cupid', ability('golden-arrow', 'Golden Arrow', 1, 0)),
  entry('defender', 'Defender', 'When you successfully Block an Attack, it will not cause you to lose one of your consecutive Blocks remaining.', true),
  entry('last-ditch', 'Last Ditch', 'When both players drop to 0 Mana, gains 2 Mana instead of 1. Every second reset increases that gain by 1.', true),
  entry('null', 'Null', 'Once per game, resets both players to their initial state without resetting strikes or the turn count.', true, {}, 'null', ability('reset', 'Reset', 1, 0, undefined, 'standalone')),
  entry('joe', 'Joe', 'Every turn has a 1-in-1,000 chance to gain Infinite Mana. Good luck.', true),
];

export const ABM_CLASS_BY_ID = new Map(ABM_CLASSES.map((definition) => [definition.id, definition]));

export interface AbmStartingResources { mana: number; blocks: number }

export function startingResourcesForClass(classId?: AbmClassId): AbmStartingResources {
  const hooks = classId ? ABM_CLASS_BY_ID.get(classId)?.hooks : undefined;
  return { mana: hooks?.initialMana ?? 1, blocks: hooks?.maximumBlocks ?? 5 };
}

function entry(
  id: AbmClassId,
  name: string,
  description: string,
  implemented = false,
  hooks: AbmClassHooks = {},
  assetKey: string = id,
  activatedAbility?: AbmActivatedAbilityDefinition,
): AbmClassDefinition {
  return { id, name, description, implemented, hooks, ...(activatedAbility ? { ability: activatedAbility } : {}), asset: `${root}/${assetKey}-sheet.webp`, badgeAsset: `${root}/${assetKey}-badge-sheet.webp` };
}

function ability(id: AbmAbilityId, label: string, uses: number, manaCost: number,
  available?: AbmActivatedAbilityDefinition['available'], inputStrategy: AbmActivatedAbilityDefinition['inputStrategy'] = 'arm-with-move'): AbmActivatedAbilityDefinition {
  const base = `${root}/${id}-button`;
  return { id, label, uses, manaCost, inputStrategy, buttonAssets: {
    up: `${base}-up-sheet.webp`, between: `${base}-between-sheet.webp`, depressed: `${base}-depressed-sheet.webp`,
  }, ...(available ? { available } : {}) };
}
