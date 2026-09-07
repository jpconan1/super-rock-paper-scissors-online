import type { PlayerId } from '../../core/variant';
import type { AbmDisplayMove, AbmGamblerOutcome, AbmMove } from './attackBlockManaTypes';
import { ABM_TAG_ENTRANCE_SOURCES } from './abmTagEntrance';

const ROOT = '/variants/abm/scenes';
const BASE_ROOT = `${ROOT}/base`;
const EXCEPTION_ROOT = `${ROOT}/exceptions`;
const SPLIT_ROOT = `${ROOT}/splits`;
const TAG_ROOT = `${ROOT}/tags`;
const BACKGROUND_ROOT = `${ROOT}/backgrounds`;

export interface AbmScene { src: string; flip: boolean }
export function resolveConjureScene(move: AbmDisplayMove | 'conjure', conjurer: PlayerId): AbmScene {
  return { src: `${ROOT}/conjure/conjure-${move}-sheet.webp`, flip: conjurer === 'p2' };
}
export type AbmTagCategory = 'proc' | 'impact' | 'status';
export type AbmTagKind = 'advantaged' | 'bear' | 'bull' | 'cheater' | 'copywriter' | 'duplicator' | 'gambler' | 'juggernaut' | 'lucky' | 'stunned' | 'sumo' | 'taxed' | 'thief';
export interface AbmTag { kind: AbmTagKind; category: AbmTagCategory; player: PlayerId; src: string }
export type AbmProcBackgroundKind = 'bear' | 'bull';
export interface AbmProcBackground { kind: AbmProcBackgroundKind; player: PlayerId; src: string }

interface TagState {
  luckyProcPlayer?: PlayerId;
  advantagedProcPlayers?: readonly PlayerId[];
  thiefTransferPlayer?: PlayerId;
  juggernautProcPlayers?: readonly PlayerId[];
  stunnedPlayers?: readonly PlayerId[];
  investorBullPlayers?: readonly PlayerId[];
  investorBearPlayers?: readonly PlayerId[];
  duplicatorProcPlayers?: readonly PlayerId[];
  copywriterProcPlayers?: readonly PlayerId[];
  sumoProcRemaining?: Partial<Record<PlayerId, 0 | 1 | 2>>;
  cheaterProcPlayers?: readonly PlayerId[];
  gamblerOutcomes?: Partial<Record<PlayerId, AbmGamblerOutcome>>;
  taxmanCollectPlayers?: readonly PlayerId[];
}

export function resolveAbmScene(moves?: Readonly<Record<PlayerId, AbmMove>>, luckyProcPlayer?: PlayerId): AbmScene {
  if (luckyProcPlayer) return { src: `${EXCEPTION_ROOT}/lucky-survival-sheet.webp`, flip: luckyProcPlayer === 'p2' };
  const resolved = resolveBase(moves);
  return { src: `${BASE_ROOT}/${resolved.name}-sheet.webp`, flip: resolved.flip };
}

export function resolveAbmSplitScene(
  moves: Readonly<Record<PlayerId, AbmMove>> | undefined,
  early: PlayerId,
  luckyProcPlayer?: PlayerId,
): AbmScene {
  if (luckyProcPlayer) {
    const late = other(early);
    const visibleRole = late === luckyProcPlayer ? 'charger' : 'attacker';
    return { src: `${SPLIT_ROOT}/exceptions/lucky-survival-${visibleRole}-ready-sheet.webp`, flip: late === 'p2' };
  }
  const full = resolveBase(moves);
  const readyRole = resolveReadyRole(full.name, early, full.flip);
  return { src: `${SPLIT_ROOT}/base/${full.name}-${readyRole}-ready-sheet.webp`, flip: full.flip };
}

export function resolveAbmTags(state: TagState, hiddenPlayer?: PlayerId): AbmTag[] {
  const tags: AbmTag[] = [];
  const add = (category: AbmTagCategory, kind: AbmTagKind, players: readonly PlayerId[] | undefined) => {
    for (const player of players ?? []) if (player !== hiddenPlayer) {
      tags.push({ category, kind, player, src: tagSource(category, kind, player) });
    }
  };
  add('proc', 'lucky', state.luckyProcPlayer ? [state.luckyProcPlayer] : undefined);
  add('proc', 'advantaged', state.advantagedProcPlayers);
  add('impact', 'juggernaut', state.juggernautProcPlayers?.map(other));
  add('impact', 'thief', state.thiefTransferPlayer ? [other(state.thiefTransferPlayer)] : undefined);
  add('impact', 'stunned', state.stunnedPlayers);
  add('impact', 'taxed', state.taxmanCollectPlayers);
  add('proc', 'bull', state.investorBullPlayers);
  add('proc', 'bear', state.investorBearPlayers);
  add('proc', 'duplicator', state.duplicatorProcPlayers);
  add('proc', 'copywriter', state.copywriterProcPlayers);
  add('proc', 'cheater', state.cheaterProcPlayers);
  for (const player of ['p1', 'p2'] as const) {
    const outcome = state.gamblerOutcomes?.[player];
    if (outcome && outcome !== 'nothing' && player !== hiddenPlayer) {
      tags.push({ category: 'proc', kind: 'gambler', player, src: `${TAG_ROOT}/gambler-${outcome}-sheet.webp` });
    }
  }
  for (const player of ['p1', 'p2'] as const) {
    const remaining = state.sumoProcRemaining?.[player];
    if (remaining !== undefined && player !== hiddenPlayer) tags.push({ category: 'proc', kind: 'sumo', player, src: `${TAG_ROOT}/sumo-${remaining}-left-sheet.webp` });
  }
  return tags;
}

export function resolveAbmProcBackgrounds(state: TagState, hiddenPlayer?: PlayerId): AbmProcBackground[] {
  const bull = new Set(state.investorBullPlayers ?? []);
  const bear = new Set(state.investorBearPlayers ?? []);
  const backgrounds: AbmProcBackground[] = [];
  for (const player of ['p1', 'p2'] as const) {
    if (player === hiddenPlayer || (bull.has(player) && bear.has(player))) continue;
    const kind: AbmProcBackgroundKind | undefined = bull.has(player) ? 'bull' : bear.has(player) ? 'bear' : undefined;
    if (kind) backgrounds.push({ kind, player, src: `${BACKGROUND_ROOT}/${kind}-sheet.webp` });
  }
  return backgrounds;
}

const SPLIT_BASE_SCENE_VARIANTS = {
  standoff: ['left', 'right'],
  'attack-draw': ['left', 'right'],
  'block-attack': ['blocker', 'attacker'],
  'block-draw': ['left', 'right'],
  'block-mana': ['blocker', 'charger'],
  'mana-draw': ['left', 'right'],
} as const;
const SPLIT_BASE_SCENE_NAMES = Object.keys(SPLIT_BASE_SCENE_VARIANTS) as (keyof typeof SPLIT_BASE_SCENE_VARIANTS)[];
const BASE_SCENE_NAMES = [...SPLIT_BASE_SCENE_NAMES, 'mana-attack'] as const;
const TAG_NAMES: readonly Exclude<AbmTagKind, 'sumo' | 'gambler'>[] = ['advantaged', 'bear', 'bull', 'cheater', 'copywriter', 'duplicator', 'juggernaut', 'lucky', 'stunned', 'taxed', 'thief'];
const DIRECTIONAL_IMPACT_TAGS = ['juggernaut', 'stunned', 'thief'] as const;
const GAMBLER_TAG_NAMES: readonly Exclude<AbmGamblerOutcome, 'nothing'>[] = [
  'plus-2-mana', 'plus-1-mana', 'mana-drain', 'mana-double', 'plus-1-block', 'plus-2-block', 'minus-1-block',
];

export const ABM_SCENE_URLS = [
  ...BASE_SCENE_NAMES.map((name) => `${BASE_ROOT}/${name}-sheet.webp`),
  `${EXCEPTION_ROOT}/lucky-survival-sheet.webp`,
  ...(['attack', 'block', 'mana', 'skip', 'conjure'] as const).map((move) => `${ROOT}/conjure/conjure-${move}-sheet.webp`),
  ...SPLIT_BASE_SCENE_NAMES.flatMap((name) => SPLIT_BASE_SCENE_VARIANTS[name].map((variant) => `${SPLIT_ROOT}/base/${name}-${variant}-ready-sheet.webp`)),
  ...(['attacker', 'charger'] as const).map((role) => `${SPLIT_ROOT}/exceptions/lucky-survival-${role}-ready-sheet.webp`),
  ...TAG_NAMES.map((name) => `${TAG_ROOT}/${name}-sheet.webp`),
  ...DIRECTIONAL_IMPACT_TAGS.map((name) => `${TAG_ROOT}/${name}-p2-sheet.webp`),
  ...GAMBLER_TAG_NAMES.map((name) => `${TAG_ROOT}/gambler-${name}-sheet.webp`),
  ...([0, 1, 2] as const).map((remaining) => `${TAG_ROOT}/sumo-${remaining}-left-sheet.webp`),
  ...ABM_TAG_ENTRANCE_SOURCES,
  ...(['bear', 'bull'] as const).map((name) => `${BACKGROUND_ROOT}/${name}-sheet.webp`),
  `${ROOT}/effects/thief-transfer-sheet.webp`, `${ROOT}/effects/thief-transfer-mirror-sheet.webp`,
];

function tagSource(category: AbmTagCategory, kind: AbmTagKind, player: PlayerId): string {
  // Impact arrows point at the affected player. The authored `-p2` art points
  // left, so it belongs to P1's victim slot; the base art points right at P2.
  const directional = category === 'impact' && player === 'p1' && (DIRECTIONAL_IMPACT_TAGS as readonly string[]).includes(kind);
  return `${TAG_ROOT}/${kind}${directional ? '-p2' : ''}-sheet.webp`;
}

function resolveBase(moves?: Readonly<Record<PlayerId, AbmMove>>): { name: typeof BASE_SCENE_NAMES[number]; flip: boolean } {
  if (!moves) return { name: 'standoff', flip: false };
  if (moves.p1 === moves.p2) return {
    name: moves.p1 === 'attack' ? 'attack-draw' : moves.p1 === 'block' ? 'block-draw' : 'mana-draw', flip: false,
  };
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return { name: 'block-mana', flip: moves.p1 === 'mana' };
  if (pair.has('block') && pair.has('attack')) return { name: 'block-attack', flip: moves.p1 === 'attack' };
  return { name: 'mana-attack', flip: moves.p1 === 'attack' };
}

function resolveReadyRole(
  scene: typeof BASE_SCENE_NAMES[number],
  early: PlayerId,
  flip: boolean,
): 'left' | 'right' | 'attacker' | 'blocker' | 'charger' {
  const canonicalHidden = flip ? other(early) : early;
  if (scene === 'block-attack') return canonicalHidden === 'p1' ? 'attacker' : 'blocker';
  if (scene === 'block-mana') return canonicalHidden === 'p1' ? 'charger' : 'blocker';
  return canonicalHidden === 'p1' ? 'right' : 'left';
}

function other(player: PlayerId): PlayerId { return player === 'p1' ? 'p2' : 'p1'; }
