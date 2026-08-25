import { describe, expect, test } from 'vitest';
import type { PlayerId } from '../src/core/variant';
import { attackBlockManaRules } from '../src/variants/attackBlockMana/attackBlockManaRules';
import type { AbmCommand, AbmMove, AbmState } from '../src/variants/attackBlockMana/attackBlockManaTypes';

const context = { now: 1_000, random: () => 0.5 };

describe('Attack Block Mana rules', () => {
  test('keeps both initial class choices private until both lock', () => {
    let state = attackBlockManaRules.initialize(context);
    state = send(state, 'p1', { type: 'lock-class', classId: 'advantaged' });
    const opponent = attackBlockManaRules.project(state, 'p2');
    expect(opponent.players.p1.classId).toBeUndefined();
    expect(opponent.opponentReady).toBe(true);
    expect(opponent.ownPendingClass).toBeUndefined();
    state = send(state, 'p2', { type: 'lock-class', classId: 'advantaged' });
    expect(state.players.p1.classId).toBe('advantaged');
    expect(state.phase).toBe('selecting-actions');
    expect(state.turn).toBe(1);
  });

  test.each([
    ['attack', 'attack', undefined, 2, 2, 5, 5],
    ['attack', 'block', undefined, 0, 1, 5, 4],
    ['attack', 'mana', 'p1', 0, 3, 5, 5],
    ['block', 'attack', undefined, 1, 0, 4, 5],
    ['block', 'block', undefined, 1, 1, 4, 4],
    ['block', 'mana', undefined, 1, 3, 4, 5],
    ['mana', 'attack', 'p2', 3, 0, 5, 5],
    ['mana', 'block', undefined, 3, 1, 5, 4],
    ['mana', 'mana', undefined, 3, 3, 5, 5],
  ] as const)('resolves %s versus %s', (p1, p2, winner, p1Mana, p2Mana, p1Blocks, p2Blocks) => {
    const state = playTurn(started(), p1, p2);
    expect(state.lastRoundWinner).toBe(winner);
    expect(state.players.p1.mana).toBe(p1Mana);
    expect(state.players.p2.mana).toBe(p2Mana);
    expect(state.players.p1.blocks).toBe(p1Blocks);
    expect(state.players.p2.blocks).toBe(p2Blocks);
  });

  test('runs an Advantaged forced Mana turn when both attacks spend the last Mana', () => {
    const state = playTurn(started(), 'attack', 'attack');
    expect(state.turn).toBe(3);
    expect(state.players.p1.mana).toBe(2);
    expect(state.players.p2.mana).toBe(2);
    expect(state.players.p1.lastMove).toBe('mana');
  });

  test('rejects illegal and unfinished selections', () => {
    let state = attackBlockManaRules.initialize(context);
    expect(() => send(state, 'p1', { type: 'lock-class', classId: 'thief' })).toThrow('not playable');
    state = started();
    state.players.p1.mana = 0;
    state.players.p1.blocks = 0;
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'attack' })).toThrow('requires');
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'block' })).toThrow('No Blocks');
  });

  test('locks winner, allows only loser counter-pick, and reports a 3-N result', () => {
    let state = started();
    for (let round = 1; round <= 3; round++) {
      state = playTurn(state, 'attack', 'mana');
      if (round < 3) {
        expect(state.counterPicker).toBe('p2');
        expect(state.players.p1.classId).toBe('advantaged');
        expect(state.players.p2.classId).toBe('advantaged');
        expect(() => send(state, 'p1', { type: 'lock-class', classId: 'advantaged' })).toThrow('cannot be locked');
        state = send(state, 'p2', { type: 'lock-class', classId: 'advantaged' });
      }
    }
    expect(state.winner).toBe('p1');
    expect(state.score).toEqual({ p1: 3, p2: 0 });
    expect(attackBlockManaRules.result(state)).toEqual({ winner: 'p1', scores: { p1: 3, p2: 0 } });
  });
});

function started(): AbmState {
  let state = attackBlockManaRules.initialize(context);
  state = send(state, 'p1', { type: 'lock-class', classId: 'advantaged' });
  return send(state, 'p2', { type: 'lock-class', classId: 'advantaged' });
}

function playTurn(state: AbmState, p1: AbmMove, p2: AbmMove): AbmState {
  state = send(state, 'p1', { type: 'choose-move', move: p1 });
  expect(attackBlockManaRules.project(state, 'p2').ownPendingMove).toBeUndefined();
  expect(attackBlockManaRules.project(state, 'p2').opponentReady).toBe(true);
  return send(state, 'p2', { type: 'choose-move', move: p2 });
}

function send(state: AbmState, player: PlayerId, command: AbmCommand): AbmState {
  return attackBlockManaRules.resolve(state, player, command, context).state;
}
