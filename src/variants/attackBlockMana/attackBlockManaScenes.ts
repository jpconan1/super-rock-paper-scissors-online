import type { PlayerId } from '../../core/variant';
import type { AbmMove } from './attackBlockManaTypes';

const ROOT = '/variants/abm/scenes';
const BASE_ROOT = `${ROOT}/base`;
const EXCEPTION_ROOT = `${ROOT}/exceptions`;
const SPLIT_ROOT = `${ROOT}/splits`;
const TAG_ROOT = `${ROOT}/tags`;
const BACKGROUND_ROOT = `${ROOT}/backgrounds`;

export interface AbmScene { src: string; flip: boolean }
export type AbmProcTagKind = 'advantaged' | 'bear' | 'bull' | 'cheater' | 'duplicator' | 'juggernaut' | 'lucky' | 'stunned' | 'sumo' | 'thief';
export interface AbmProcTag { kind: AbmProcTagKind; player: PlayerId; src: string }
export type AbmProcBackgroundKind = 'bear' | 'bull';
export interface AbmProcBackground { kind: AbmProcBackgroundKind; player: PlayerId; src: string }

interface ProcTagState {
  luckyProcPlayer?: PlayerId;
  advantagedProcPlayers?: readonly PlayerId[];
  thiefAttemptPlayers?: readonly PlayerId[];
  juggernautProcPlayers?: readonly PlayerId[];
  stunnedPlayers?: readonly PlayerId[];
  investorBullPlayers?: readonly PlayerId[];
  investorBearPlayers?: readonly PlayerId[];
  duplicatorProcPlayers?: readonly PlayerId[];
  sumoProcRemaining?: Partial<Record<PlayerId, 0 | 1 | 2>>;
  cheaterProcPlayers?: readonly PlayerId[];
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
  const full = luckyProcPlayer
    ? { name: 'lucky-survival', flip: luckyProcPlayer === 'p2', exception: true }
    : { ...resolveBase(moves), exception: false };
  const canonicalHidden = full.flip ? other(early) : early;
  const family = full.exception ? 'exceptions' : 'base';
  return { src: `${SPLIT_ROOT}/${family}/${full.name}-${canonicalHidden}-ready-sheet.webp`, flip: full.flip };
}

export function resolveAbmProcTags(state: ProcTagState, hiddenPlayer?: PlayerId): AbmProcTag[] {
  const tags: AbmProcTag[] = [];
  const add = (kind: AbmProcTagKind, players: readonly PlayerId[] | undefined) => {
    for (const player of players ?? []) if (player !== hiddenPlayer) tags.push({ kind, player, src: `${TAG_ROOT}/${kind}-sheet.webp` });
  };
  add('lucky', state.luckyProcPlayer ? [state.luckyProcPlayer] : undefined);
  add('advantaged', state.advantagedProcPlayers);
  add('juggernaut', state.juggernautProcPlayers?.map(other));
  add('thief', state.thiefAttemptPlayers);
  add('stunned', state.stunnedPlayers);
  add('bull', state.investorBullPlayers);
  add('bear', state.investorBearPlayers);
  add('duplicator', state.duplicatorProcPlayers);
  add('cheater', state.cheaterProcPlayers);
  for (const player of ['p1', 'p2'] as const) {
    const remaining = state.sumoProcRemaining?.[player];
    if (remaining !== undefined && player !== hiddenPlayer) tags.push({ kind: 'sumo', player, src: `${TAG_ROOT}/sumo-${remaining}-left-sheet.webp` });
  }
  return tags;
}

export function resolveAbmProcBackgrounds(state: ProcTagState, hiddenPlayer?: PlayerId): AbmProcBackground[] {
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

const SPLIT_BASE_SCENE_NAMES = ['standoff', 'attack-draw', 'block-attack', 'block-draw', 'block-mana', 'mana-draw'] as const;
const BASE_SCENE_NAMES = [...SPLIT_BASE_SCENE_NAMES, 'mana-attack'] as const;
const TAG_NAMES: readonly Exclude<AbmProcTagKind, 'sumo'>[] = ['advantaged', 'bear', 'bull', 'cheater', 'duplicator', 'juggernaut', 'lucky', 'stunned', 'thief'];

export const ABM_SCENE_URLS = [
  ...BASE_SCENE_NAMES.map((name) => `${BASE_ROOT}/${name}-sheet.webp`),
  `${EXCEPTION_ROOT}/lucky-survival-sheet.webp`,
  ...SPLIT_BASE_SCENE_NAMES.flatMap((name) => (['p1', 'p2'] as const).map((player) => `${SPLIT_ROOT}/base/${name}-${player}-ready-sheet.webp`)),
  ...(['p1', 'p2'] as const).map((player) => `${SPLIT_ROOT}/exceptions/lucky-survival-${player}-ready-sheet.webp`),
  ...TAG_NAMES.map((name) => `${TAG_ROOT}/${name}-sheet.webp`),
  ...([0, 1, 2] as const).map((remaining) => `${TAG_ROOT}/sumo-${remaining}-left-sheet.webp`),
  ...(['bear', 'bull'] as const).map((name) => `${BACKGROUND_ROOT}/${name}-sheet.webp`),
  `${ROOT}/effects/thief-transfer-sheet.webp`, `${ROOT}/effects/thief-transfer-mirror-sheet.webp`,
];

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

function other(player: PlayerId): PlayerId { return player === 'p1' ? 'p2' : 'p1'; }
