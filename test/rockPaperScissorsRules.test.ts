import { describe, expect, test } from 'vitest';
import type { PlayerId } from '../src/core/variant';
import { RPS_GAME_RESULT_HOLD_MS, RPS_READY_SPLIT_MS, RPS_REVEAL_MS, RPS_TARGET_WINS, RPS_WAITING_MS, rockPaperScissorsRules, winnerFor } from '../src/variants/rockPaperScissors/rockPaperScissorsRules';
import type { RpsMove, RpsState } from '../src/variants/rockPaperScissors/rockPaperScissorsTypes';

const context = { now: 1_000, random: () => 0.5 };

describe('Rock Paper Scissors rules', () => {
  test.each([
    ['rock', 'rock', undefined], ['rock', 'paper', 'p2'], ['rock', 'scissors', 'p1'],
    ['paper', 'rock', 'p1'], ['paper', 'paper', undefined], ['paper', 'scissors', 'p2'],
    ['scissors', 'rock', 'p2'], ['scissors', 'paper', 'p1'], ['scissors', 'scissors', undefined],
  ] as const)('resolves %s versus %s', (p1, p2, winner) => expect(winnerFor(p1, p2)).toBe(winner));

  test('keeps the first choice private and rejects a second choice', () => {
    let state = choose(rockPaperScissorsRules.initialize(context), 'p1', 'rock');
    expect(rockPaperScissorsRules.project(state, 'p2')).toMatchObject({ opponentReady: true });
    expect(rockPaperScissorsRules.project(state, 'p2')).not.toHaveProperty('ownPendingMove');
    expect(rockPaperScissorsRules.project(state, 'p2')).not.toHaveProperty('lastMoves');
    expect(() => choose(state, 'p1', 'paper')).toThrow('already chose');
  });

  test('scores wins, leaves ties unscored, and completes first-to-three', () => {
    let state = rockPaperScissorsRules.initialize(context);
    state = turn(state, 'rock', 'rock');
    expect(state).toMatchObject({ round: 1, turn: 2, score: { p1: 0, p2: 0 }, phase: 'choosing' });
    state = turn(state, 'paper', 'rock');
    expect(state).toMatchObject({ round: 1, turn: 2, score: { p1: 1, p2: 0 }, phase: 'round-result' });
    state = continueAfterResult(state);
    expect(state).toMatchObject({ round: 2, turn: 1, score: { p1: 1, p2: 0 }, phase: 'choosing' });
    for (let index = 1; index < RPS_TARGET_WINS; index++) {
      state = turn(state, 'paper', 'rock');
      if (index < RPS_TARGET_WINS - 1) state = continueAfterResult(state);
    }
    expect(state).toMatchObject({ phase: 'game-result', winner: 'p1', score: { p1: 3, p2: 0 } });
    expect(rockPaperScissorsRules.result(state)).toBeUndefined();
    state = finishGameResult(state);
    expect(state).toMatchObject({ phase: 'complete', winner: 'p1', score: { p1: 3, p2: 0 } });
    expect(rockPaperScissorsRules.result(state)).toEqual({ winner: 'p1', scores: { p1: 3, p2: 0 } });
  });

  test('holds the decisive scene, shows the game result for two beats, then completes', () => {
    let state = rockPaperScissorsRules.initialize(context);
    for (let index = 0; index < RPS_TARGET_WINS; index++) {
      const resolution = rockPaperScissorsRules.resolve(choose(state, 'p1', 'rock'), 'p2', { type: 'choose-move', move: 'scissors' }, context);
      state = resolution.state;
      if (index < RPS_TARGET_WINS - 1) {
        state = continueAfterResult(state);
      } else {
        expect(resolution.events?.map((event) => event.type)).toEqual(['reveal', 'game-result']);
        expect(resolution.events?.[1]).toMatchObject({ startsAt: context.now + RPS_REVEAL_MS, endsAt: context.now + RPS_REVEAL_MS + RPS_GAME_RESULT_HOLD_MS });
      }
    }
    const completeAt = context.now + RPS_REVEAL_MS + RPS_GAME_RESULT_HOLD_MS;
    expect(rockPaperScissorsRules.nextDeadline?.(state)).toBe(completeAt);
    expect(rockPaperScissorsRules.advanceDeadline?.(state, { ...context, now: completeAt - 1 })).toBeUndefined();
    state = rockPaperScissorsRules.advanceDeadline!(state, { ...context, now: completeAt })!.state;
    expect(state.phase).toBe('complete');
  });

  test('reveals the round result after one beat and requires both players to continue', () => {
    let state = turn(rockPaperScissorsRules.initialize(context), 'rock', 'scissors');
    const resultRevealAt = context.now + RPS_REVEAL_MS;
    expect(state).toMatchObject({ phase: 'round-result', resultRevealAt, lastWinner: 'p1' });
    expect(() => rockPaperScissorsRules.resolve(state, 'p1', { type: 'continue' }, { ...context, now: resultRevealAt - 1 })).toThrow('not available');
    let resolution = rockPaperScissorsRules.resolve(state, 'p1', { type: 'continue' }, { ...context, now: resultRevealAt });
    state = resolution.state;
    expect(state).toMatchObject({ phase: 'round-waiting', pendingContinues: { p1: true }, earlyPlayer: 'p1' });
    expect(resolution.events?.[0]?.type).toBe('ready');
    resolution = rockPaperScissorsRules.resolve(state, 'p2', { type: 'continue' }, { ...context, now: resultRevealAt + 250 });
    expect(resolution.state).toMatchObject({ phase: 'choosing', round: 2, turn: 1 });
    expect(resolution.state).not.toHaveProperty('lastMoves');
    expect(resolution.events?.[0]?.type).toBe('wipe');
  });

  test('starts a server deadline and awards a forfeit when it expires', () => {
    const state = choose(rockPaperScissorsRules.initialize(context), 'p2', 'scissors');
    const deadline = context.now + RPS_READY_SPLIT_MS + RPS_WAITING_MS;
    expect(rockPaperScissorsRules.nextDeadline?.(state)).toBe(deadline);
    expect(rockPaperScissorsRules.advanceDeadline?.(state, { ...context, now: deadline - 1 })).toBeUndefined();
    const expired = rockPaperScissorsRules.advanceDeadline?.(state, { ...context, now: deadline })!;
    expect(expired.state).toMatchObject({ phase: 'complete', winner: 'p2', resultReason: 'forfeit', score: { p1: 0, p2: 3 } });
    expect(expired.events?.[0]?.type).toBe('move-timeout');
  });

  test('rejects malformed commands and input after completion', () => {
    const fresh = rockPaperScissorsRules.initialize(context);
    expect(() => rockPaperScissorsRules.resolve(fresh, 'p1', { type: 'choose-move', move: 'lizard' } as never, context)).toThrow('Unknown');
    let complete = fresh;
    for (let index = 0; index < RPS_TARGET_WINS; index++) {
      complete = turn(complete, 'rock', 'scissors');
      if (index < RPS_TARGET_WINS - 1) complete = continueAfterResult(complete);
    }
    complete = finishGameResult(complete);
    expect(() => choose(complete, 'p2', 'paper')).toThrow('complete');
  });
});

function choose(state: RpsState, player: PlayerId, move: RpsMove, now = context.now): RpsState {
  return rockPaperScissorsRules.resolve(state, player, { type: 'choose-move', move }, { ...context, now }).state;
}
function turn(state: RpsState, p1: RpsMove, p2: RpsMove): RpsState { return choose(choose(state, 'p1', p1), 'p2', p2); }
function continueAfterResult(state: RpsState): RpsState {
  const now = state.resultRevealAt!;
  state = rockPaperScissorsRules.resolve(state, 'p1', { type: 'continue' }, { ...context, now }).state;
  return rockPaperScissorsRules.resolve(state, 'p2', { type: 'continue' }, { ...context, now }).state;
}
function finishGameResult(state: RpsState): RpsState {
  return rockPaperScissorsRules.advanceDeadline!(state, { ...context, now: state.gameCompleteAt! })!.state;
}
