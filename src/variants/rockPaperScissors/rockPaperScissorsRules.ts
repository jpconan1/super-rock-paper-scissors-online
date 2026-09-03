import type { DeterministicContext, PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { BEAT_MS, STARBURST_WIPE_MS } from '../../core/time';
import type { RpsCommand, RpsMove, RpsProjection, RpsResult, RpsState } from './rockPaperScissorsTypes';
import { RPS_MOVES } from './rockPaperScissorsTypes';

export const RPS_TARGET_WINS = 3;
export const RPS_READY_SPLIT_MS = 3 * 58;
export const RPS_WAITING_MS = 30_000;
export const RPS_REVEAL_MS = STARBURST_WIPE_MS + BEAT_MS;
export const RPS_GAME_RESULT_HOLD_MS = 2 * BEAT_MS;

export const rockPaperScissorsRules: VariantRules<RpsState, RpsCommand, RpsProjection, RpsResult> = {
  variantId: 'rock-paper-scissors',
  rulesVersion: 1,
  initialize: () => ({ phase: 'choosing', round: 1, turn: 1, score: { p1: 0, p2: 0 }, pendingMoves: {} }),
  resolve(state, player, command, context) {
    if (state.phase === 'complete') throw new Error('Game is complete.');
    if (command?.type === 'continue') return continueRound(state, player, context);
    if (!isMoveCommand(command)) throw new Error('Unknown move.');
    if (state.phase !== 'choosing' && state.phase !== 'waiting') throw new Error('Move cannot be chosen now.');
    if (state.pendingMoves[player]) throw new Error('Player already chose this turn.');
    const pendingMoves = { ...state.pendingMoves, [player]: command.move };
    const other = otherPlayer(player);
    if (!pendingMoves[other]) {
      return {
        state: { ...state, phase: 'waiting', pendingMoves, earlyPlayer: player, waitingStartsAt: context.now + RPS_READY_SPLIT_MS, waitingDeadlineAt: context.now + RPS_READY_SPLIT_MS + RPS_WAITING_MS },
        events: [cue('ready', context.now, RPS_READY_SPLIT_MS + RPS_WAITING_MS, { player, waitingStartsAt: context.now + RPS_READY_SPLIT_MS })],
      };
    }
    return resolveTurn(state, pendingMoves as Record<PlayerId, RpsMove>, context);
  },
  nextDeadline: (state) => state.gameCompleteAt ?? state.waitingDeadlineAt,
  advanceDeadline(state, context) {
    if (state.phase === 'game-result' && state.gameCompleteAt !== undefined && context.now >= state.gameCompleteAt) {
      return { state: { ...state, phase: 'complete', gameCompleteAt: undefined }, events: [] };
    }
    if ((state.phase !== 'waiting' && state.phase !== 'round-waiting') || !state.earlyPlayer || state.waitingDeadlineAt === undefined || context.now < state.waitingDeadlineAt) return undefined;
    const winner = state.earlyPlayer;
    const score = { ...state.score, [winner]: RPS_TARGET_WINS };
    return {
      state: { ...state, phase: 'complete', score, pendingMoves: {}, winner, resultReason: 'forfeit', waitingDeadlineAt: undefined },
      events: [cue('move-timeout', context.now, RPS_REVEAL_MS, { winner, score })],
    };
  },
  project(state, viewer) {
    const ownPendingMove = state.pendingMoves[viewer];
    return {
      self: viewer, phase: state.phase, round: state.round, turn: state.turn, score: { ...state.score },
      ...(ownPendingMove ? { ownPendingMove } : {}),
      ...(state.pendingContinues?.[viewer] ? { ownPendingContinue: true as const } : {}),
      opponentReady: state.phase === 'round-waiting' ? Boolean(state.pendingContinues?.[otherPlayer(viewer)]) : Boolean(state.pendingMoves[otherPlayer(viewer)]),
      legalMoves: (state.phase !== 'choosing' && state.phase !== 'waiting') || ownPendingMove ? [] : RPS_MOVES,
      canContinue: state.phase === 'round-result' && state.resultRevealAt !== undefined && !state.pendingContinues?.[viewer]
        || state.phase === 'round-waiting' && !state.pendingContinues?.[viewer],
      ...(state.lastMoves ? { lastMoves: { ...state.lastMoves } } : {}),
      ...(state.lastWinner ? { lastWinner: state.lastWinner } : {}),
      ...(state.winner ? { winner: state.winner } : {}),
      ...(state.resultReason ? { resultReason: state.resultReason } : {}),
      ...(state.earlyPlayer ? { earlyPlayer: state.earlyPlayer } : {}),
      ...(state.waitingStartsAt === undefined ? {} : { waitingStartsAt: state.waitingStartsAt }),
      ...(state.waitingDeadlineAt === undefined ? {} : { waitingDeadlineAt: state.waitingDeadlineAt }),
      ...(state.resultRevealAt === undefined ? {} : { resultRevealAt: state.resultRevealAt }),
    };
  },
  result: (state) => state.phase === 'complete' && state.winner ? { winner: state.winner, scores: { ...state.score }, ...(state.resultReason ? { reason: state.resultReason } : {}) } : undefined,
};

function resolveTurn(state: RpsState, moves: Record<PlayerId, RpsMove>, context: DeterministicContext): VariantResolution<RpsState> {
  const winner = winnerFor(moves.p1, moves.p2);
  const score = { ...state.score };
  if (winner) score[winner]++;
  const gameWinner = score.p1 >= RPS_TARGET_WINS ? 'p1' : score.p2 >= RPS_TARGET_WINS ? 'p2' : undefined;
  return {
    state: {
      phase: gameWinner ? 'game-result' : winner ? 'round-result' : 'choosing',
      round: state.round,
      turn: winner ? state.turn : state.turn + 1,
      score, pendingMoves: {}, lastMoves: moves,
      ...(winner ? { lastWinner: winner, pendingContinues: {}, resultRevealAt: context.now + RPS_REVEAL_MS } : {}),
      ...(gameWinner ? { winner: gameWinner, gameCompleteAt: context.now + RPS_REVEAL_MS + RPS_GAME_RESULT_HOLD_MS } : {}),
    },
    events: [cue('reveal', context.now, RPS_REVEAL_MS, { moves, winner, score }),
      ...(winner ? [cue(gameWinner ? 'game-result' : 'round-result', context.now + RPS_REVEAL_MS,
        gameWinner ? RPS_GAME_RESULT_HOLD_MS : RPS_WAITING_MS, { winner, score, round: state.round })] : [])],
  };
}

function continueRound(state: RpsState, player: PlayerId, context: DeterministicContext): VariantResolution<RpsState> {
  if (state.phase !== 'round-result' && state.phase !== 'round-waiting') throw new Error('Continue is unavailable now.');
  if (state.resultRevealAt !== undefined && context.now < state.resultRevealAt) throw new Error('Continue is not available yet.');
  if (state.pendingContinues?.[player]) throw new Error('Player already continued.');
  const pendingContinues = { ...(state.pendingContinues ?? {}), [player]: true as const };
  const other = otherPlayer(player);
  if (!pendingContinues[other]) {
    const waitingStartsAt = context.now + RPS_READY_SPLIT_MS;
    return { state: { ...state, phase: 'round-waiting', pendingContinues, earlyPlayer: player, waitingStartsAt, waitingDeadlineAt: waitingStartsAt + RPS_WAITING_MS },
      events: [cue('ready', context.now, RPS_READY_SPLIT_MS + RPS_WAITING_MS, { player, waitingStartsAt, context: 'continue' })] };
  }
  return { state: { phase: 'choosing', round: state.round + 1, turn: 1, score: { ...state.score }, pendingMoves: {} },
    events: [cue('wipe', context.now, STARBURST_WIPE_MS, { scene: 'standoff', round: state.round + 1 })] };
}

export function winnerFor(p1: RpsMove, p2: RpsMove): PlayerId | undefined {
  if (p1 === p2) return undefined;
  return p1 === 'rock' && p2 === 'scissors' || p1 === 'paper' && p2 === 'rock' || p1 === 'scissors' && p2 === 'paper' ? 'p1' : 'p2';
}

function otherPlayer(player: PlayerId): PlayerId { return player === 'p1' ? 'p2' : 'p1'; }
function isMoveCommand(value: unknown): value is Extract<RpsCommand, { type: 'choose-move' }> {
  if (!value || typeof value !== 'object') return false;
  const command = value as Partial<RpsCommand>;
  return command.type === 'choose-move' && RPS_MOVES.includes(command.move as RpsMove);
}
function cue(type: 'ready' | 'reveal' | 'score' | 'move-timeout' | 'round-result' | 'game-result' | 'wipe', startsAt: number, duration: number, payload: unknown) {
  return { type, startsAt, endsAt: startsAt + duration, payload } as const;
}
