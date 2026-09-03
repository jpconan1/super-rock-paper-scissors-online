import type { DeterministicContext, PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { BEAT_MS, STARBURST_WIPE_MS } from '../../core/time';
import { GUN_KNIFE_FIST_MOVES, type GunKnifeFistCommand, type GunKnifeFistMove, type GunKnifeFistProjection, type GunKnifeFistResult, type GunKnifeFistState } from './gunKnifeFistTypes';

export const GUN_KNIFE_FIST_TARGET_WINS = 3;
export const GUN_KNIFE_FIST_START_HEALTH = 3;
export const GUN_KNIFE_FIST_READY_SPLIT_MS = 3 * 58;
export const GUN_KNIFE_FIST_WAITING_MS = 30_000;
export const GUN_KNIFE_FIST_REVEAL_MS = STARBURST_WIPE_MS + BEAT_MS;
export const GUN_KNIFE_FIST_GAME_RESULT_HOLD_MS = 2 * BEAT_MS;

export const gunKnifeFistRules: VariantRules<GunKnifeFistState, GunKnifeFistCommand, GunKnifeFistProjection, GunKnifeFistResult> = {
  variantId: 'gun-knife-fist', rulesVersion: 1,
  initialize: () => ({ phase: 'choosing', round: 1, turn: 1, score: { p1: 0, p2: 0 }, resources: { p1: GUN_KNIFE_FIST_START_HEALTH, p2: GUN_KNIFE_FIST_START_HEALTH }, pendingMoves: {} }),
  resolve(state, player, command, context) {
    if (state.phase === 'complete') throw new Error('Game is complete.');
    if (command?.type === 'continue') return continueRound(state, player, context);
    if (!isMoveCommand(command)) throw new Error('Unknown move.');
    if (state.phase !== 'choosing' && state.phase !== 'waiting') throw new Error('Move cannot be chosen now.');
    if (state.pendingMoves[player]) throw new Error('Player already chose this turn.');
    const pendingMoves = { ...state.pendingMoves, [player]: command.move };
    if (!pendingMoves[other(player)]) {
      const waitingStartsAt = context.now + GUN_KNIFE_FIST_READY_SPLIT_MS;
      return { state: { ...state, phase: 'waiting', pendingMoves, earlyPlayer: player, waitingStartsAt, waitingDeadlineAt: waitingStartsAt + GUN_KNIFE_FIST_WAITING_MS }, events: [cue('ready', context.now, GUN_KNIFE_FIST_READY_SPLIT_MS + GUN_KNIFE_FIST_WAITING_MS, { player, waitingStartsAt })] };
    }
    return resolveTurn(state, pendingMoves as Record<PlayerId, GunKnifeFistMove>, context);
  },
  nextDeadline: (state) => state.gameCompleteAt ?? state.waitingDeadlineAt,
  advanceDeadline(state, context) {
    if (state.phase === 'game-result' && state.gameCompleteAt !== undefined && context.now >= state.gameCompleteAt) return { state: { ...state, phase: 'complete', gameCompleteAt: undefined }, events: [] };
    if ((state.phase !== 'waiting' && state.phase !== 'round-waiting') || !state.earlyPlayer || state.waitingDeadlineAt === undefined || context.now < state.waitingDeadlineAt) return undefined;
    const winner = state.earlyPlayer;
    return { state: { ...state, phase: 'complete', score: { ...state.score, [winner]: GUN_KNIFE_FIST_TARGET_WINS }, pendingMoves: {}, winner, resultReason: 'forfeit', waitingDeadlineAt: undefined }, events: [cue('move-timeout', context.now, GUN_KNIFE_FIST_REVEAL_MS, { winner })] };
  },
  project(state, viewer) {
    const ownPendingMove = state.pendingMoves[viewer];
    return { self: viewer, phase: state.phase, round: state.round, turn: state.turn, score: { ...state.score }, resources: { ...state.resources },
      legalMoves: (state.phase === 'choosing' || state.phase === 'waiting') && !ownPendingMove ? [...GUN_KNIFE_FIST_MOVES] : [],
      opponentReady: state.phase === 'round-waiting' ? Boolean(state.pendingContinues?.[other(viewer)]) : Boolean(state.pendingMoves[other(viewer)]),
      canContinue: (state.phase === 'round-result' || state.phase === 'round-waiting') && !state.pendingContinues?.[viewer],
      ...(ownPendingMove ? { ownPendingMove } : {}), ...(state.pendingContinues?.[viewer] ? { ownPendingContinue: true as const } : {}),
      ...(state.lastMoves ? { lastMoves: { ...state.lastMoves } } : {}), ...(state.lastWinner ? { lastWinner: state.lastWinner } : {}),
      ...(state.earlyPlayer ? { earlyPlayer: state.earlyPlayer } : {}), ...(state.waitingStartsAt === undefined ? {} : { waitingStartsAt: state.waitingStartsAt }),
      ...(state.waitingDeadlineAt === undefined ? {} : { waitingDeadlineAt: state.waitingDeadlineAt }), ...(state.resultRevealAt === undefined ? {} : { resultRevealAt: state.resultRevealAt }),
      ...(state.winner ? { winner: state.winner } : {}), ...(state.resultReason ? { resultReason: state.resultReason } : {}) };
  },
  result: (state) => state.phase === 'complete' && state.winner ? { winner: state.winner, scores: { ...state.score }, ...(state.resultReason ? { reason: state.resultReason } : {}) } : undefined,
};

export function hitWinnerForGunKnifeFist(p1: GunKnifeFistMove, p2: GunKnifeFistMove): PlayerId | undefined {
  const hits = (move: GunKnifeFistMove, target: GunKnifeFistMove) => move === 'punch' && target === 'shoot' || move === 'shoot' && target === 'stab' || move === 'stab' && target === 'punch';
  const p1Hit = hits(p1, p2), p2Hit = hits(p2, p1);
  return p1Hit === p2Hit ? undefined : p1Hit ? 'p1' : 'p2';
}

function resolveTurn(state: GunKnifeFistState, moves: Record<PlayerId, GunKnifeFistMove>, context: DeterministicContext): VariantResolution<GunKnifeFistState> {
  const hitWinner = hitWinnerForGunKnifeFist(moves.p1, moves.p2);
  const resources = { ...state.resources };
  if (hitWinner) { const target = other(hitWinner); resources[target] = Math.max(0, resources[target] - damageFor(moves[hitWinner])); }
  const winner = resources.p1 === 0 ? 'p2' : resources.p2 === 0 ? 'p1' : undefined;
  const score = { ...state.score }; if (winner) score[winner]++;
  const gameWinner = score.p1 >= 3 ? 'p1' : score.p2 >= 3 ? 'p2' : undefined;
  return { state: { phase: gameWinner ? 'game-result' : winner ? 'round-result' : 'choosing', round: state.round, turn: winner ? state.turn : state.turn + 1, score, resources, pendingMoves: {}, lastMoves: moves,
    ...(winner ? { lastWinner: winner, pendingContinues: {}, resultRevealAt: context.now + GUN_KNIFE_FIST_REVEAL_MS } : {}), ...(gameWinner ? { winner: gameWinner, gameCompleteAt: context.now + GUN_KNIFE_FIST_REVEAL_MS + GUN_KNIFE_FIST_GAME_RESULT_HOLD_MS } : {}) },
    events: [cue('reveal', context.now, GUN_KNIFE_FIST_REVEAL_MS, { moves, winner, score, resources }), ...(winner ? [cue(gameWinner ? 'game-result' : 'round-result', context.now + GUN_KNIFE_FIST_REVEAL_MS, gameWinner ? GUN_KNIFE_FIST_GAME_RESULT_HOLD_MS : GUN_KNIFE_FIST_WAITING_MS, { winner, score, round: state.round })] : [])] };
}

function continueRound(state: GunKnifeFistState, player: PlayerId, context: DeterministicContext): VariantResolution<GunKnifeFistState> {
  if (state.phase !== 'round-result' && state.phase !== 'round-waiting') throw new Error('Continue is unavailable now.');
  if (state.resultRevealAt !== undefined && context.now < state.resultRevealAt) throw new Error('Continue is not available yet.');
  if (state.pendingContinues?.[player]) throw new Error('Player already continued.');
  const pendingContinues = { ...(state.pendingContinues ?? {}), [player]: true as const };
  if (!pendingContinues[other(player)]) { const waitingStartsAt = context.now + GUN_KNIFE_FIST_READY_SPLIT_MS; return { state: { ...state, phase: 'round-waiting', pendingContinues, earlyPlayer: player, waitingStartsAt, waitingDeadlineAt: waitingStartsAt + GUN_KNIFE_FIST_WAITING_MS }, events: [cue('ready', context.now, GUN_KNIFE_FIST_READY_SPLIT_MS + GUN_KNIFE_FIST_WAITING_MS, { player, waitingStartsAt, context: 'continue' })] }; }
  return { state: { phase: 'choosing', round: state.round + 1, turn: 1, score: { ...state.score }, resources: { p1: GUN_KNIFE_FIST_START_HEALTH, p2: GUN_KNIFE_FIST_START_HEALTH }, pendingMoves: {} }, events: [cue('wipe', context.now, STARBURST_WIPE_MS, { scene: 'standoff', round: state.round + 1 })] };
}
function damageFor(move: GunKnifeFistMove) { return move === 'punch' ? 1 : move === 'stab' ? 2 : 3; }
function other(player: PlayerId): PlayerId { return player === 'p1' ? 'p2' : 'p1'; }
function isMoveCommand(value: unknown): value is Extract<GunKnifeFistCommand, { type: 'choose-move' }> { return Boolean(value && typeof value === 'object' && (value as GunKnifeFistCommand).type === 'choose-move' && GUN_KNIFE_FIST_MOVES.includes((value as { move: GunKnifeFistMove }).move)); }
function cue(type: 'ready'|'reveal'|'move-timeout'|'round-result'|'game-result'|'wipe', startsAt: number, duration: number, payload: unknown) { return { type, startsAt, endsAt: startsAt + duration, payload } as const; }
