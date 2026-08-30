import type { PlayerId } from '../../core/variant';
import type { AbmClassId, AbmMove } from './attackBlockManaTypes';

const ROOT = '/variants/abm/scenes';
const THIEF_ROOT = '/variants/abm/thief';
export interface AbmScene { src: string; flip: boolean }

export function resolveAbmScene(
  moves?: Readonly<Record<PlayerId, AbmMove>>,
  luckyProcPlayer?: PlayerId,
  advantagedProcPlayers?: readonly PlayerId[],
  juggernautProcPlayers?: readonly PlayerId[],
): AbmScene {
  if (luckyProcPlayer) return scene('lucky-proc', luckyProcPlayer === 'p2');
  if (juggernautProcPlayers?.length) return scene('juggernaut-proc', juggernautProcPlayers[0] === 'p2');
  if (advantagedProcPlayers?.length === 2) return scene('both-mana-both-proc-adv');
  if (advantagedProcPlayers?.length === 1) {
    const procPlayer = advantagedProcPlayers[0]!;
    return scene(moves?.p1 === 'mana' && moves.p2 === 'mana' ? 'both-mana-adv-proc' : 'mana-block-adv-proc', procPlayer === 'p2');
  }
  if (!moves) return scene('abm-standoff');
  if (moves.p1 === moves.p2) return scene(moves.p1 === 'attack' ? 'attack-draw' : moves.p1 === 'block' ? 'block-draw' : 'mana-draw');
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return scene('block-mana', moves.p1 === 'mana');
  if (pair.has('block') && pair.has('attack')) return scene('block-attack', moves.p1 === 'attack');
  return scene('mana-attack', moves.p1 === 'attack');
}

export function resolveAbmSplitScene(moves: Readonly<Record<PlayerId, AbmMove>> | undefined, early: PlayerId): AbmScene {
  if (!moves) return split(`abm-standoff-${early}-ready`);
  const full = resolveAbmScene(moves);
  if (moves.p1 === moves.p2) {
    const name = moves.p1 === 'attack' ? 'attack-draw' : moves.p1 === 'block' ? 'block-draw' : 'mana-draw';
    return split(`${name}-${early}-ready`, full.flip);
  }
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return split(`block-mana-${moves[early]}-ready`, full.flip);
  if (pair.has('block') && pair.has('attack')) return split(`block-attack-${moves[early]}-ready`, full.flip);
  return full;
}

export function resolveAbmClassProcSplitScene(
  moves: Readonly<Record<PlayerId, AbmMove>>,
  early: PlayerId,
  luckyProcPlayer?: PlayerId,
  advantagedProcPlayers?: readonly PlayerId[],
  juggernautProcPlayers?: readonly PlayerId[],
): AbmScene | undefined {
  if (luckyProcPlayer) return split(
    early === luckyProcPlayer ? 'lucky-victim-survivor' : 'lucky-survivor',
    luckyProcPlayer === 'p2',
  );
  if (juggernautProcPlayers?.length) {
    const juggernaut = juggernautProcPlayers[0]!;
    return split(early === juggernaut ? 'juggernaut-victim-survivor' : 'juggernaut-survivor', juggernaut === 'p2');
  }
  if (advantagedProcPlayers?.length === 2) return split('advantaged-survivor', early === 'p1');
  if (advantagedProcPlayers?.length === 1) {
    const advantaged = advantagedProcPlayers[0]!;
    return early === advantaged ? resolveAbmSplitScene(moves, early) : split('advantaged-survivor', advantaged === 'p2');
  }
  return undefined;
}

export function resolveThiefScene(
  moves: Readonly<Record<PlayerId, AbmMove>> | undefined,
  attemptPlayers: readonly PlayerId[] | undefined,
  classes: Readonly<Record<PlayerId, AbmClassId | undefined>>,
): AbmScene | undefined {
  if (!moves || !attemptPlayers?.length || (moves.p1 === 'attack' && moves.p2 === 'mana') || (moves.p1 === 'mana' && moves.p2 === 'attack')) return undefined;
  const mirror = classes.p1 === 'thief' && classes.p2 === 'thief';
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (mirror) {
    const name = moves.p1 === moves.p2
      ? moves.p1 === 'attack' ? 'both-thief-attack-draw' : moves.p1 === 'block' ? 'both-block-both-theif' : 'both-charge-both-thief'
      : pair.has('attack') ? 'block-attack-both-thief' : 'block-mana-both-thief';
    return thiefScene(name);
  }
  const thief = attemptPlayers[0]!;
  const name = moves.p1 === moves.p2
    ? moves.p1 === 'attack' ? 'thief-attack-draw' : moves.p1 === 'block' ? 'both-block-theif' : 'both-charge-thief'
    : pair.has('attack') ? moves[thief] === 'attack' ? 'attack-block-thief-attacking' : 'block-attack-thief-blocking'
      : moves[thief] === 'mana' ? 'mana-block-thief-manaing' : 'block-mana-thief-blocking';
  return thiefScene(name, thief === 'p2');
}

export function resolveThiefSplitScene(
  moves: Readonly<Record<PlayerId, AbmMove>>,
  attemptPlayers: readonly PlayerId[] | undefined,
  classes: Readonly<Record<PlayerId, AbmClassId | undefined>>,
  early: PlayerId,
): AbmScene | undefined {
  if (!resolveThiefScene(moves, attemptPlayers, classes)) return undefined;
  const remaining: PlayerId = early === 'p1' ? 'p2' : 'p1';
  if (classes[remaining] !== 'thief') return resolveAbmSplitScene(moves, early);
  const move = moves[remaining];
  const name = move === 'attack' ? 'thief-attacking-survivor'
    : move === 'mana' ? 'thief-mana-survivor'
      : moves[early] === 'attack' ? 'thief-blocking-vs-attack-survivor' : 'thief-blocking-survivor';
  return split(name, remaining === 'p2');
}

export const ABM_SCENE_URLS = [
  'abm-standoff', 'block-mana', 'block-draw', 'block-attack', 'mana-draw', 'mana-attack', 'attack-draw', 'lucky-proc',
  'both-mana-adv-proc', 'mana-block-adv-proc', 'both-mana-both-proc-adv', 'juggernaut-proc',
].map((name) => `${ROOT}/${name}-sheet.webp`).concat([
  'abm-standoff-p1-ready', 'abm-standoff-p2-ready', 'block-draw-p1-ready', 'block-draw-p2-ready',
  'attack-draw-p1-ready', 'attack-draw-p2-ready', 'mana-draw-p1-ready', 'mana-draw-p2-ready',
  'block-mana-mana-ready', 'block-mana-block-ready', 'block-attack-attack-ready', 'block-attack-block-ready',
].map((name) => `${ROOT}/split-scenes/${name}-sheet.webp`)).concat([
  'advantaged-survivor', 'juggernaut-survivor', 'juggernaut-victim-survivor', 'lucky-survivor', 'lucky-victim-survivor',
  'thief-attacking-survivor', 'thief-blocking-survivor', 'thief-blocking-vs-attack-survivor', 'thief-mana-survivor',
].map((name) => `${ROOT}/split-scenes/${name}-sheet.webp`)).concat([
  'attack-block-thief-attacking', 'block-attack-both-thief', 'block-attack-thief-blocking', 'block-mana-both-thief',
  'block-mana-thief-blocking', 'both-block-both-theif', 'both-block-theif', 'both-charge-both-thief', 'both-charge-thief',
  'both-thief-attack-draw', 'mana-block-thief-manaing', 'thief-attack-draw', 'thief-transfer', 'thief-transfer-mirror',
].map((name) => `${THIEF_ROOT}/${name}-sheet.webp`));

function scene(name: string, flip = false): AbmScene { return { src: `${ROOT}/${name}-sheet.webp`, flip }; }
function split(name: string, flip = false): AbmScene { return { src: `${ROOT}/split-scenes/${name}-sheet.webp`, flip }; }
function thiefScene(name: string, flip = false): AbmScene { return { src: `${THIEF_ROOT}/${name}-sheet.webp`, flip }; }
