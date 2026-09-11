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
  entry('lucky', 'Lucky', 'Has a 1/4 chance to survive a lethal attack.', true),
  entry('advantaged', 'Advantaged', 'For the first three turns, Mana gives 2 instead of 1.', true),
  entry('thief', 'Thief', 'Steal ability steals 1 Mana from your opponent. Only after turn 4, only once.', true, {}, 'thief', ability('steal', 'Steal', 1, 0, (player, turn) => turn >= 5)),
  entry('juggernaut', 'Juggernaut', 'Two consecutive attacks disable your opponent\'s Block next turn.', true),
  entry('stunner', 'Stunner', 'Attacks double your opponent\'s next Attack cost, up to 8 Mana.', true),
  entry('duplicator', 'Duplicator', 'Picking Mana consecutively doubles the amount gained each time.', true),
  entry('sumo', 'The Sumo', 'When both players Attack, The Sumo doesn\'t pay. Three charges.', true),
  entry('cheater', 'Cheater', 'Has a 1/3 chance to get an extra Mana when Mana-ing.', true),
  entry('investor', 'Investor', 'Starts with 5 Mana, but loses 1 every third turn. Gains 1 extra when both players Mana.', true, { initialMana: 5 }),
  entry('gambler', 'Gambler', 'When Blocking, rolls a random effect. Short Block meter.', true, { maximumBlocks: 3 }),
  entry('taxman', 'Taxman', 'Collect ability taxes both players 1 Mana. Three charges.', true, {}, 'taxman', ability('collect', 'Collect', 3, 0, (player) => player.mana > 0)),
  entry('copywriter', 'Copywriter', 'If your opponent picks the same move three times in a row, gain a free Mana.', true),
  entry('conjurer', 'Conjurer', 'Conjure ability reveals your opponent\'s move. Two charges.', true, {}, 'conjurer', ability('conjure', 'Conjure', 2, 1, undefined, 'opponent-first')),
  entry('fireborne', 'Fireborne', 'Flame ability grants an extra life for 5 turns.', true, {}, 'fireborne', ability('flame', 'Flame', 1, 1)),
  entry('retired', 'Retired', 'Starts with a bunch of Mana, but can\'t gain Mana and has a short Block meter.', true, { initialMana: 7, maximumBlocks: 4, manaGain: () => 0 }),
  entry('parrymaster', 'Parrymaster', 'Parry ability drains your opponent of 2 extra Mana, if you catch their Attack. One charge.', true, {}, 'parrymaster', ability('parry', 'Parry', 1, 0)),
  entry('cupid', 'Cupid', 'Golden Arrow ability gives you a bonus for matching your opponent\'s move. Lasts 5 turns.', true, {}, 'cupid', ability('golden-arrow', 'Golden Arrow', 1, 0)),
  entry('defender', 'Defender', 'Blocking an Attack doesn\'t deplete your Block meter.', true),
  entry('last-ditch', 'Last Ditch', 'Gains extra Mana when both players have 0. Gain increases every second time it happens.', true),
  entry('null', 'Null', 'Reset ability resets both players to their starting state. One charge.', true, {}, 'null', ability('reset', 'Reset', 1, 0, undefined, 'standalone')),
  entry('joe', 'Joe', 'Has a 1/1000 chance to gain infinite Mana every turn. Otherwise, does nothing.', true),
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
