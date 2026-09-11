import type { PlayerId } from '../../core/variant';
import type { AbmDisplayMove, AbmGamblerOutcome, AbmLastDitchBonus, AbmMove } from './attackBlockManaTypes';
import { ABM_TAG_ENTRANCE_SOURCES } from './abmTagEntrance';

const ROOT = '/variants/abm/scenes';
const BASE_ROOT = `${ROOT}/base`;
const EXCEPTION_ROOT = `${ROOT}/exceptions`;
const SPLIT_ROOT = `${ROOT}/splits`;
const TAG_ROOT = `${ROOT}/tags`;
const BACKGROUND_ROOT = `${ROOT}/backgrounds`;

export interface AbmScene { src: string; flip: boolean }
export function resolveJoeScene(): AbmScene { return { src: `${ROOT}/joe-time-sheet.webp`, flip: false }; }
export function resolveNullScene(readyPlayer?: PlayerId): AbmScene {
  return { src: readyPlayer ? `${SPLIT_ROOT}/null-${readyPlayer}-ready-sheet.webp` : `${ROOT}/null-reset-sheet.webp`, flip: false };
}
export function resolveConjureScene(move: AbmDisplayMove | 'conjure', conjurer: PlayerId): AbmScene {
  return { src: `${ROOT}/conjure/conjure-${move}-sheet.webp`, flip: conjurer === 'p2' };
}
export type AbmTagCategory = 'proc' | 'impact' | 'status';
export type AbmTagKind = 'advantaged' | 'bear' | 'bull' | 'cheater' | 'copywriter' | 'cupid-arrow' | 'cupid-attack' | 'cupid-block' | 'cupid-mana' | 'defender' | 'duplicator' | 'fireborne-shield' | 'gambler' | 'joe-infinite' | 'joe-proc' | 'juggernaut' | 'last-ditch' | 'lucky' | 'null-reset' | 'parried' | 'retired' | 'stunned' | 'sumo' | 'taxed' | 'thief';
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
  cupidAttackProcPlayers?: readonly PlayerId[];
  cupidManaProcPlayers?: readonly PlayerId[];
  cupidBlockImpactPlayers?: readonly PlayerId[];
  defenderProcPlayers?: readonly PlayerId[];
  lastDitchBonusMana?: Partial<Record<PlayerId, AbmLastDitchBonus>>;
  pendingGoldenArrowPlayer?: PlayerId;
  retiredProcPlayers?: readonly PlayerId[];
  gamblerOutcomes?: Partial<Record<PlayerId, AbmGamblerOutcome>>;
  taxmanCollectPlayers?: readonly PlayerId[];
  parriedPlayers?: readonly PlayerId[];
  nullResetPlayer?: PlayerId;
  joeProcPlayers?: readonly PlayerId[];
  players?: Readonly<Record<PlayerId, { fireShieldTurns?: 0 | 1 | 2 | 3 | 4 | 5; goldenArrowTurns?: 0 | 1 | 2 | 3 | 4 | 5; infiniteMana?: boolean }>>;
}

export function resolveAbmScene(moves?: Readonly<Record<PlayerId, AbmMove>>, luckyProcPlayer?: PlayerId, fireborneProcPlayer?: PlayerId): AbmScene {
  if (fireborneProcPlayer) return { src: `${EXCEPTION_ROOT}/fireborne-shield-sheet.webp`, flip: fireborneProcPlayer === 'p2' };
  if (luckyProcPlayer) return { src: `${EXCEPTION_ROOT}/lucky-survival-sheet.webp`, flip: luckyProcPlayer === 'p2' };
  const resolved = resolveBase(moves);
  return { src: `${BASE_ROOT}/${resolved.name}-sheet.webp`, flip: resolved.flip };
}

export function resolveAbmSplitScene(
  moves: Readonly<Record<PlayerId, AbmMove>> | undefined,
  early: PlayerId,
  luckyProcPlayer?: PlayerId,
  fireborneProcPlayer?: PlayerId,
): AbmScene {
  if (fireborneProcPlayer) {
    const late = other(early);
    const visibleRole = late === fireborneProcPlayer ? 'fireborne' : 'attacker';
    return { src: `${SPLIT_ROOT}/exceptions/fireborne-shield-${visibleRole}-ready-sheet.webp`, flip: late === 'p2' };
  }
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
  add('impact', 'parried', state.parriedPlayers);
  add('proc', 'bull', state.investorBullPlayers);
  add('proc', 'bear', state.investorBearPlayers);
  add('proc', 'duplicator', state.duplicatorProcPlayers);
  add('proc', 'copywriter', state.copywriterProcPlayers);
  add('proc', 'cheater', state.cheaterProcPlayers);
  add('proc', 'cupid-attack', state.cupidAttackProcPlayers);
  add('proc', 'cupid-mana', state.cupidManaProcPlayers);
  add('impact', 'cupid-block', state.cupidBlockImpactPlayers);
  add('proc', 'defender', state.defenderProcPlayers);
  add('proc', 'null-reset', state.nullResetPlayer ? [state.nullResetPlayer] : undefined);
  const joeProcs = new Set(state.joeProcPlayers ?? []);
  for (const player of ['p1', 'p2'] as const) {
    if (player === hiddenPlayer) continue;
    if (joeProcs.has(player)) tags.push({ category: 'proc', kind: 'joe-proc', player, src: tagSource('proc', 'joe-proc', player) });
    if (state.players?.[player].infiniteMana) tags.push({ category: 'status', kind: 'joe-infinite', player, src: tagSource('status', 'joe-infinite', player) });
  }
  for (const player of ['p1', 'p2'] as const) {
    const bonus = state.lastDitchBonusMana?.[player];
    if (bonus !== undefined && player !== hiddenPlayer) tags.push({
      category: 'proc', kind: 'last-ditch', player, src: `${TAG_ROOT}/last-ditch-tag-${bonus}-sheet.webp`,
    });
  }
  for (const player of state.retiredProcPlayers ?? []) {
    tags.push({ category: 'proc', kind: 'retired', player, src: tagSource('proc', 'retired', player) });
  }
  for (const player of ['p1', 'p2'] as const) {
    const remaining = state.players?.[player].fireShieldTurns ?? 0;
    if (remaining > 0 && player !== hiddenPlayer) tags.push({
      category: 'status', kind: 'fireborne-shield', player,
      src: `${TAG_ROOT}/fireborne-cloud-${remaining}-sheet.webp`,
    });
  }
  for (const player of ['p1', 'p2'] as const) {
    const pending = state.pendingGoldenArrowPlayer === player;
    const remaining = pending ? 5 : state.players?.[player].goldenArrowTurns ?? 0;
    if (remaining > 0 && (pending || player !== hiddenPlayer)) tags.push({
      category: 'status', kind: 'cupid-arrow', player,
      src: `${TAG_ROOT}/golden-arrow-${remaining}-sheet.webp`,
    });
  }
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
const TAG_NAMES: readonly Exclude<AbmTagKind, 'sumo' | 'gambler' | 'fireborne-shield' | 'cupid-arrow' | 'cupid-attack' | 'cupid-block' | 'cupid-mana' | 'last-ditch' | 'joe-proc'>[] = ['advantaged', 'bear', 'bull', 'cheater', 'copywriter', 'defender', 'duplicator', 'joe-infinite', 'juggernaut', 'lucky', 'null-reset', 'parried', 'retired', 'stunned', 'taxed', 'thief'];
const DIRECTIONAL_IMPACT_TAGS = ['juggernaut', 'parried', 'stunned', 'thief', 'cupid-block'] as const;
const GAMBLER_TAG_NAMES: readonly Exclude<AbmGamblerOutcome, 'nothing'>[] = [
  'plus-2-mana', 'plus-1-mana', 'mana-drain', 'mana-double', 'plus-1-block', 'plus-2-block', 'minus-1-block',
];

export const ABM_SCENE_URLS = [
  ...BASE_SCENE_NAMES.map((name) => `${BASE_ROOT}/${name}-sheet.webp`),
  `${EXCEPTION_ROOT}/lucky-survival-sheet.webp`,
  `${EXCEPTION_ROOT}/fireborne-shield-sheet.webp`,
  `${ROOT}/null-reset-sheet.webp`,
  `${ROOT}/joe-time-sheet.webp`,
  ...(['p1', 'p2'] as const).map((player) => `${SPLIT_ROOT}/null-${player}-ready-sheet.webp`),
  ...(['attack', 'block', 'mana', 'skip', 'conjure'] as const).map((move) => `${ROOT}/conjure/conjure-${move}-sheet.webp`),
  ...SPLIT_BASE_SCENE_NAMES.flatMap((name) => SPLIT_BASE_SCENE_VARIANTS[name].map((variant) => `${SPLIT_ROOT}/base/${name}-${variant}-ready-sheet.webp`)),
  ...(['attacker', 'charger'] as const).map((role) => `${SPLIT_ROOT}/exceptions/lucky-survival-${role}-ready-sheet.webp`),
  ...(['attacker', 'fireborne'] as const).map((role) => `${SPLIT_ROOT}/exceptions/fireborne-shield-${role}-ready-sheet.webp`),
  ...TAG_NAMES.map((name) => `${TAG_ROOT}/${name}-sheet.webp`),
  `${TAG_ROOT}/joe-thousand-sheet.webp`,
  ...DIRECTIONAL_IMPACT_TAGS.map((name) => tagSource('impact', name, 'p1')),
  ...GAMBLER_TAG_NAMES.map((name) => `${TAG_ROOT}/gambler-${name}-sheet.webp`),
  ...([1, 2, 3, 4, 5] as const).map((remaining) => `${TAG_ROOT}/fireborne-cloud-${remaining}-sheet.webp`),
  ...([1, 2, 3, 4, 5] as const).map((remaining) => `${TAG_ROOT}/golden-arrow-${remaining}-sheet.webp`),
  ...(['attack', 'mana', 'block', 'block-p2'] as const).map((name) => `${TAG_ROOT}/golden-arrow-${name}-sheet.webp`),
  ...([0, 1, 2] as const).map((remaining) => `${TAG_ROOT}/sumo-${remaining}-left-sheet.webp`),
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((bonus) => `${TAG_ROOT}/last-ditch-tag-${bonus}-sheet.webp`),
  ...ABM_TAG_ENTRANCE_SOURCES,
  ...(['bear', 'bull'] as const).map((name) => `${BACKGROUND_ROOT}/${name}-sheet.webp`),
  `${ROOT}/effects/thief-transfer-sheet.webp`, `${ROOT}/effects/thief-transfer-mirror-sheet.webp`,
];

function tagSource(category: AbmTagCategory, kind: AbmTagKind, player: PlayerId): string {
  // Impact arrows point at the affected player. The authored `-p2` art points
  // left, so it belongs to P1's victim slot; the base art points right at P2.
  const directional = category === 'impact' && player === 'p1' && (DIRECTIONAL_IMPACT_TAGS as readonly string[]).includes(kind);
  const name = kind === 'cupid-attack' ? 'golden-arrow-attack'
    : kind === 'cupid-mana' ? 'golden-arrow-mana'
      : kind === 'cupid-block' ? 'golden-arrow-block'
        : kind === 'joe-proc' ? 'joe-thousand' : kind;
  return `${TAG_ROOT}/${name}${directional ? '-p2' : ''}-sheet.webp`;
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
