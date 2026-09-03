import type { DeterministicContext, PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { BEAT_MS, STARBURST_WIPE_MS } from '../../core/time';
import { TAP_TAP_SHOOT_MOVES, type TapTapShootCommand, type TapTapShootMove, type TapTapShootProjection, type TapTapShootResult, type TapTapShootState } from './tapTapShootTypes';

export const TAP_TAP_SHOOT_TARGET_WINS = 3;
export const TAP_TAP_SHOOT_RESOURCE_MAX = 9;
export const TAP_TAP_SHOOT_START_AP = 1;
export const TAP_TAP_SHOOT_READY_SPLIT_MS = 3 * 58;
export const TAP_TAP_SHOOT_WAITING_MS = 30_000;
export const TAP_TAP_SHOOT_REVEAL_MS = STARBURST_WIPE_MS + BEAT_MS;
export const TAP_TAP_SHOOT_GAME_RESULT_HOLD_MS = 2 * BEAT_MS;

export const tapTapShootRules: VariantRules<TapTapShootState, TapTapShootCommand, TapTapShootProjection, TapTapShootResult> = {
  variantId: 'tap-tap-shoot', rulesVersion: 1,
  initialize: () => ({ phase: 'choosing', round: 1, turn: 1, score: { p1: 0, p2: 0 }, resources: { p1: TAP_TAP_SHOOT_START_AP, p2: TAP_TAP_SHOOT_START_AP }, pendingMoves: {} }),
  resolve(state, player, command, context) {
    if (state.phase === 'complete') throw new Error('Game is complete.');
    if (command?.type === 'continue') return continueRound(state, player, context);
    if (!isMoveCommand(command)) throw new Error('Unknown move.');
    if (state.phase !== 'choosing' && state.phase !== 'waiting') throw new Error('Move cannot be chosen now.');
    if (state.pendingMoves[player]) throw new Error('Player already chose this turn.');
    if (!legalMoves(state.resources[player], state.resources[other(player)]).includes(command.move)) throw new Error('Move is not legal in this resource state.');
    const pendingMoves = { ...state.pendingMoves, [player]: command.move };
    if (!pendingMoves[other(player)]) {
      const waitingStartsAt = context.now + TAP_TAP_SHOOT_READY_SPLIT_MS;
      return { state: { ...state, phase: 'waiting', pendingMoves, earlyPlayer: player, waitingStartsAt, waitingDeadlineAt: waitingStartsAt + TAP_TAP_SHOOT_WAITING_MS }, events: [cue('ready', context.now, TAP_TAP_SHOOT_READY_SPLIT_MS + TAP_TAP_SHOOT_WAITING_MS, { player, waitingStartsAt })] };
    }
    return resolveTurn(state, pendingMoves as Record<PlayerId, TapTapShootMove>, context);
  },
  nextDeadline: (state) => state.gameCompleteAt ?? state.waitingDeadlineAt,
  advanceDeadline(state, context) {
    if (state.phase === 'game-result' && state.gameCompleteAt !== undefined && context.now >= state.gameCompleteAt) return { state: { ...state, phase: 'complete', gameCompleteAt: undefined }, events: [] };
    if ((state.phase !== 'waiting' && state.phase !== 'round-waiting') || !state.earlyPlayer || state.waitingDeadlineAt === undefined || context.now < state.waitingDeadlineAt) return undefined;
    const winner = state.earlyPlayer;
    return { state: { ...state, phase: 'complete', score: { ...state.score, [winner]: TAP_TAP_SHOOT_TARGET_WINS }, pendingMoves: {}, winner, resultReason: 'forfeit', waitingDeadlineAt: undefined }, events: [cue('move-timeout', context.now, TAP_TAP_SHOOT_REVEAL_MS, { winner })] };
  },
  project(state, viewer) {
    const ownPendingMove = state.pendingMoves[viewer];
    return { self: viewer, phase: state.phase, round: state.round, turn: state.turn, score: { ...state.score }, resources: { ...state.resources },
      legalMoves: (state.phase === 'choosing' || state.phase === 'waiting') && !ownPendingMove ? legalMoves(state.resources[viewer], state.resources[other(viewer)]) : [],
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

export function legalMoves(resource: number, opponentResource: number): TapTapShootMove[] {
  if (resource === 0 && opponentResource === 0) return ['reload'];
  return TAP_TAP_SHOOT_MOVES.filter((move) => {
    if ((move === 'shoot' || move === 'stab') && resource < 1) return false;
    if (move === 'reload' && resource >= TAP_TAP_SHOOT_RESOURCE_MAX) return false;
    if (opponentResource === 0 && (move === 'duck' || move === 'counterstab')) return false;
    return true;
  });
}

export function winnerForTapTapShoot(p1: TapTapShootMove, p2: TapTapShootMove): PlayerId | undefined {
  const hits = (move: TapTapShootMove, target: TapTapShootMove) => move === 'shoot' && ['stab', 'reload', 'counterstab'].includes(target) || move === 'stab' && ['duck', 'reload'].includes(target);
  const p1Hit = hits(p1, p2), p2Hit = hits(p2, p1);
  return p1Hit === p2Hit ? undefined : p1Hit ? 'p1' : 'p2';
}

function resolveTurn(state: TapTapShootState, moves: Record<PlayerId, TapTapShootMove>, context: DeterministicContext): VariantResolution<TapTapShootState> {
  const resources = { p1: applyResource(state.resources.p1, moves.p1), p2: applyResource(state.resources.p2, moves.p2) };
  const winner = winnerForTapTapShoot(moves.p1, moves.p2); const score = { ...state.score }; if (winner) score[winner]++;
  const gameWinner = score.p1 >= 3 ? 'p1' : score.p2 >= 3 ? 'p2' : undefined;
  return { state: { phase: gameWinner ? 'game-result' : winner ? 'round-result' : 'choosing', round: state.round, turn: winner ? state.turn : state.turn + 1, score, resources, pendingMoves: {}, lastMoves: moves,
    ...(winner ? { lastWinner: winner, pendingContinues: {}, resultRevealAt: context.now + TAP_TAP_SHOOT_REVEAL_MS } : {}), ...(gameWinner ? { winner: gameWinner, gameCompleteAt: context.now + TAP_TAP_SHOOT_REVEAL_MS + TAP_TAP_SHOOT_GAME_RESULT_HOLD_MS } : {}) },
    events: [cue('reveal', context.now, TAP_TAP_SHOOT_REVEAL_MS, { moves, winner, score, resources }), ...(winner ? [cue(gameWinner ? 'game-result' : 'round-result', context.now + TAP_TAP_SHOOT_REVEAL_MS, gameWinner ? TAP_TAP_SHOOT_GAME_RESULT_HOLD_MS : TAP_TAP_SHOOT_WAITING_MS, { winner, score, round: state.round })] : [])] };
}

function continueRound(state: TapTapShootState, player: PlayerId, context: DeterministicContext): VariantResolution<TapTapShootState> {
  if (state.phase !== 'round-result' && state.phase !== 'round-waiting') throw new Error('Continue is unavailable now.');
  if (state.resultRevealAt !== undefined && context.now < state.resultRevealAt) throw new Error('Continue is not available yet.');
  if (state.pendingContinues?.[player]) throw new Error('Player already continued.');
  const pendingContinues = { ...(state.pendingContinues ?? {}), [player]: true as const };
  if (!pendingContinues[other(player)]) { const waitingStartsAt = context.now + TAP_TAP_SHOOT_READY_SPLIT_MS; return { state: { ...state, phase: 'round-waiting', pendingContinues, earlyPlayer: player, waitingStartsAt, waitingDeadlineAt: waitingStartsAt + TAP_TAP_SHOOT_WAITING_MS }, events: [cue('ready', context.now, TAP_TAP_SHOOT_READY_SPLIT_MS + TAP_TAP_SHOOT_WAITING_MS, { player, waitingStartsAt, context: 'continue' })] }; }
  return { state: { phase: 'choosing', round: state.round + 1, turn: 1, score: { ...state.score }, resources: { p1: TAP_TAP_SHOOT_START_AP, p2: TAP_TAP_SHOOT_START_AP }, pendingMoves: {} }, events: [cue('wipe', context.now, STARBURST_WIPE_MS, { scene: 'standoff', round: state.round + 1 })] };
}
function applyResource(value: number, move: TapTapShootMove) { return move === 'reload' ? Math.min(TAP_TAP_SHOOT_RESOURCE_MAX, value + 1) : move === 'shoot' || move === 'stab' ? value - 1 : value; }
function other(player: PlayerId): PlayerId { return player === 'p1' ? 'p2' : 'p1'; }
function isMoveCommand(value: unknown): value is Extract<TapTapShootCommand, { type: 'choose-move' }> { return Boolean(value && typeof value === 'object' && (value as TapTapShootCommand).type === 'choose-move' && TAP_TAP_SHOOT_MOVES.includes((value as { move: TapTapShootMove }).move)); }
function cue(type: 'ready'|'reveal'|'move-timeout'|'round-result'|'game-result'|'wipe', startsAt: number, duration: number, payload: unknown) { return { type, startsAt, endsAt: startsAt + duration, payload } as const; }
