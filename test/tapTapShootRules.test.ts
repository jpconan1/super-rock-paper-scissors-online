import { describe, expect, test } from 'vitest';
import type { PlayerId } from '../src/core/variant';
import { TAP_TAP_SHOOT_GAME_RESULT_HOLD_MS, TAP_TAP_SHOOT_READY_SPLIT_MS, TAP_TAP_SHOOT_REVEAL_MS, TAP_TAP_SHOOT_WAITING_MS, legalMoves, tapTapShootRules, winnerForTapTapShoot } from '../src/variants/tapTapShoot/tapTapShootRules';
import { TAP_TAP_SHOOT_MOVES, type TapTapShootMove, type TapTapShootState } from '../src/variants/tapTapShoot/tapTapShootTypes';

const context = { now: 1_000, random: () => 0.5 };
const expectedWins = new Set(['shoot:stab','shoot:reload','shoot:counterstab','stab:duck','stab:reload']);

describe('Tap Tap Shoot authoritative rules', () => {
  test('starts both players at 1 AP and caps resources at 9', () => {
    expect(tapTapShootRules.initialize(context).resources).toEqual({ p1: 1, p2: 1 });
    expect(legalMoves(9, 1)).not.toContain('reload');
  });

  test('resolves the complete ordered hit table', () => {
    for (const p1 of TAP_TAP_SHOOT_MOVES) for (const p2 of TAP_TAP_SHOOT_MOVES) {
      const a = expectedWins.has(`${p1}:${p2}`), b = expectedWins.has(`${p2}:${p1}`);
      expect(winnerForTapTapShoot(p1, p2), `${p1} vs ${p2}`).toBe(a === b ? undefined : a ? 'p1' : 'p2');
    }
  });

  test('enforces AP costs, cap, forced reload, and opponent-zero defenses', () => {
    expect(legalMoves(1, 1)).toEqual(TAP_TAP_SHOOT_MOVES);
    expect(legalMoves(0, 0)).toEqual(['reload']);
    expect(legalMoves(0, 2)).toEqual(['reload','duck','counterstab']);
    expect(legalMoves(2, 0)).toEqual(['reload','shoot','stab']);
    expect(legalMoves(9, 2)).not.toContain('reload');
  });

  test('forces both players to Reload at 0–0 AP', () => {
    const empty: TapTapShootState = { ...tapTapShootRules.initialize(context), resources: { p1: 0, p2: 0 } };
    expect(() => choose(empty, 'p1', 'duck')).toThrow('not legal');
    const reloaded = turn(empty, 'reload', 'reload');
    expect(reloaded).toMatchObject({ phase: 'choosing', turn: 2, resources: { p1: 1, p2: 1 } });
  });

  test('keeps early choice private while exposing readiness and legal projection', () => {
    const state = choose(tapTapShootRules.initialize(context), 'p1', 'shoot');
    expect(tapTapShootRules.project(state, 'p1')).toMatchObject({ ownPendingMove: 'shoot', opponentReady: false });
    expect(tapTapShootRules.project(state, 'p2')).toMatchObject({ opponentReady: true });
    expect(tapTapShootRules.project(state, 'p2')).not.toHaveProperty('ownPendingMove');
    expect(() => choose(state, 'p1', 'stab')).toThrow('already chose');
  });

  test('spends and gains AP, preserving it across ties and resetting each round', () => {
    let state = turn(tapTapShootRules.initialize(context), 'reload', 'reload');
    expect(state).toMatchObject({ resources: { p1: 2, p2: 2 }, turn: 2, phase: 'choosing' });
    state = turn(state, 'stab', 'duck');
    expect(state).toMatchObject({ resources: { p1: 1, p2: 2 }, score: { p1: 1, p2: 0 }, phase: 'round-result' });
    state = continueBoth(state);
    expect(state).toMatchObject({ round: 2, turn: 1, resources: { p1: 1, p2: 1 }, phase: 'choosing' });
  });

  test('uses reconnect-safe move and Continue deadlines', () => {
    let state = choose(tapTapShootRules.initialize(context), 'p2', 'shoot');
    expect(state).toMatchObject({ waitingStartsAt: context.now + TAP_TAP_SHOOT_READY_SPLIT_MS, waitingDeadlineAt: context.now + TAP_TAP_SHOOT_READY_SPLIT_MS + TAP_TAP_SHOOT_WAITING_MS });
    const expired = tapTapShootRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!.state;
    expect(expired).toMatchObject({ phase: 'complete', winner: 'p2', resultReason: 'forfeit' });

    state = turn(tapTapShootRules.initialize(context), 'shoot', 'reload');
    expect(() => tapTapShootRules.resolve(state, 'p1', { type: 'continue' }, { ...context, now: state.resultRevealAt! - 1 })).toThrow('not available');
    state = tapTapShootRules.resolve(state, 'p1', { type: 'continue' }, { ...context, now: state.resultRevealAt! }).state;
    expect(state).toMatchObject({ phase: 'round-waiting', earlyPlayer: 'p1', pendingContinues: { p1: true } });
  });

  test('holds final result before exposing game result', () => {
    let state = tapTapShootRules.initialize(context);
    for (let i = 0; i < 3; i++) {
      state = turn(state, 'shoot', 'reload');
      if (i < 2) { state = continueBoth(state); state = turn(state, 'reload', 'reload'); }
    }
    expect(state.phase).toBe('game-result'); expect(tapTapShootRules.result(state)).toBeUndefined();
    expect(state.gameCompleteAt).toBe(context.now + TAP_TAP_SHOOT_REVEAL_MS + TAP_TAP_SHOOT_GAME_RESULT_HOLD_MS);
    state = tapTapShootRules.advanceDeadline!(state, { ...context, now: state.gameCompleteAt! })!.state;
    expect(tapTapShootRules.result(state)).toEqual({ winner: 'p1', scores: { p1: 3, p2: 0 } });
  });
});

function choose(state: TapTapShootState, player: PlayerId, move: TapTapShootMove) { return tapTapShootRules.resolve(state, player, { type: 'choose-move', move }, context).state; }
function turn(state: TapTapShootState, p1: TapTapShootMove, p2: TapTapShootMove) { return choose(choose(state, 'p1', p1), 'p2', p2); }
function continueBoth(state: TapTapShootState) { const now = state.resultRevealAt!; state = tapTapShootRules.resolve(state, 'p1', { type: 'continue' }, { ...context, now }).state; return tapTapShootRules.resolve(state, 'p2', { type: 'continue' }, { ...context, now }).state; }
