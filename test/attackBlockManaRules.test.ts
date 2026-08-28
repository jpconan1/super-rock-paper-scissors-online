import { describe, expect, test, vi } from 'vitest';
import type { PlayerId } from '../src/core/variant';
import { ABM_LETHAL_TO_RESULT_MS, ABM_RESULT_TO_COUNTER_PICK_MS, attackBlockManaRules } from '../src/variants/attackBlockMana/attackBlockManaRules';
import type { AbmCommand, AbmMove, AbmState } from '../src/variants/attackBlockMana/attackBlockManaTypes';

const context = { now: 1_000, random: () => 0.5 };

describe('Attack Block Mana rules', () => {
  test('keeps both initial class choices private until both lock', () => {
    let state = attackBlockManaRules.initialize(context);
    state = send(state, 'p1', { type: 'lock-class', classId: 'advantaged' });
    const opponent = attackBlockManaRules.project(state, 'p2');
    expect(opponent).toMatchObject({ classReadyPlayer: 'p1', classReadyAt: 1_000 });
    expect(opponent.players.p1.classId).toBeUndefined();
    expect(opponent.opponentReady).toBe(true);
    expect(opponent.ownPendingClass).toBeUndefined();
    state = send(state, 'p2', { type: 'lock-class', classId: 'advantaged' });
    expect(state.players.p1.classId).toBe('advantaged');
    expect(state.phase).toBe('idle');
    expect(state.turn).toBe(1);
  });

  test.each([
    ['attack', 'attack', undefined, 0, 0, 5, 5],
    ['attack', 'block', undefined, 0, 1, 5, 4],
    ['attack', 'mana', 'p1', 0, 2, 5, 5],
    ['block', 'attack', undefined, 1, 0, 4, 5],
    ['block', 'block', undefined, 1, 1, 4, 4],
    ['block', 'mana', undefined, 1, 2, 4, 5],
    ['mana', 'attack', 'p2', 2, 0, 5, 5],
    ['mana', 'block', undefined, 2, 1, 5, 4],
    ['mana', 'mana', undefined, 2, 2, 5, 5],
  ] as const)('resolves %s versus %s', (p1, p2, winner, p1Mana, p2Mana, p1Blocks, p2Blocks) => {
    const state = playTurn(started(), p1, p2);
    expect(state.lastRoundWinner).toBe(winner);
    expect(state.players.p1.mana).toBe(p1Mana);
    expect(state.players.p2.mana).toBe(p2Mana);
    expect(state.players.p1.blocks).toBe(p1Blocks);
    expect(state.players.p2.blocks).toBe(p2Blocks);
  });

  test('plays a normal input turn with only Mana available when both players reach zero', () => {
    let state = playTurn(started(), 'attack', 'attack');
    expect(state).toMatchObject({ phase: 'idle', turn: 2 });
    expect(state.players.p1.mana).toBe(0);
    expect(state.players.p2.mana).toBe(0);
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toEqual(['mana']);
    expect(attackBlockManaRules.project(state, 'p2').legalActions).toEqual(['mana']);
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'block' })).toThrow('only move');

    state = send(state, 'p2', { type: 'choose-move', move: 'mana' }, 2_000);
    expect(state).toMatchObject({ phase: 'waiting', earlyPlayer: 'p2', latePlayer: 'p1' });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toEqual(['mana']);
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' }, 2_100);
    expect(state).toMatchObject({ phase: 'idle', turn: 3 });
    expect(state.players.p1).toMatchObject({ mana: 1, lastMove: 'mana' });
    expect(state.players.p2).toMatchObject({ mana: 1, lastMove: 'mana' });
  });

  test('rejects illegal and unfinished selections', () => {
    let state = started();
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
        expect(state.players.p2.classId).toBe(round === 1 ? 'advantaged' : 'thief');
        expect(() => send(state, 'p1', { type: 'lock-class', classId: 'advantaged' })).toThrow('cannot be locked');
        expect(() => send(state, 'p2', { type: 'lock-class', classId: 'advantaged' }, state.counterPickAvailableAt! - 1)).toThrow('not available');
        state = send(state, 'p2', { type: 'lock-class', classId: round === 1 ? 'thief' : 'advantaged' }, state.counterPickAvailableAt);
        expect(state.players.p1).toMatchObject({ classId: 'advantaged', mana: 1, blocks: 5 });
        expect(state.players.p2).toMatchObject({ classId: round === 1 ? 'thief' : 'advantaged', mana: 1, blocks: 5 });
      }
    }
    expect(state.winner).toBe('p1');
    expect(state.score).toEqual({ p1: 3, p2: 0 });
    expect(attackBlockManaRules.result(state)).toEqual({ winner: 'p1', scores: { p1: 3, p2: 0 } });
  });

  test('holds the lethal scene one visible beat and the round result two visible beats', () => {
    let state = started();
    state = send(state, 'p1', { type: 'choose-move', move: 'attack' }, 2_000);
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'mana' }, { ...context, now: 2_100 });
    expect(resolution.state.resultRevealAt).toBe(2_100 + ABM_LETHAL_TO_RESULT_MS);
    expect(resolution.state.counterPickAvailableAt).toBe(2_100 + ABM_LETHAL_TO_RESULT_MS + ABM_RESULT_TO_COUNTER_PICK_MS);
    expect(resolution.events?.map(({ type, startsAt, endsAt }) => ({ type, startsAt, endsAt }))).toEqual([
      { type: 'move-reveal', startsAt: 2_100, endsAt: 2_100 + ABM_LETHAL_TO_RESULT_MS },
      { type: 'round-result', startsAt: 2_100 + ABM_LETHAL_TO_RESULT_MS, endsAt: 2_100 + ABM_LETHAL_TO_RESULT_MS + ABM_RESULT_TO_COUNTER_PICK_MS },
      { type: 'counter-pick', startsAt: 2_100 + ABM_LETHAL_TO_RESULT_MS + ABM_RESULT_TO_COUNTER_PICK_MS, endsAt: 2_100 + ABM_LETHAL_TO_RESULT_MS + ABM_RESULT_TO_COUNTER_PICK_MS + 600 },
    ]);
  });

  test.each([
    ['p1', 'mana', 'attack'],
    ['p2', 'attack', 'mana'],
  ] as const)('lets %s Lucky survive Attack versus Mana on a successful roll', (lucky, p1Move, p2Move) => {
    let state = startedWith(lucky === 'p1' ? 'lucky' : 'advantaged', lucky === 'p2' ? 'lucky' : 'advantaged');
    state = send(state, 'p1', { type: 'choose-move', move: p1Move });
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: p2Move }, { ...context, random: () => 0.249 });

    expect(resolution.state).toMatchObject({ phase: 'idle', turn: 2, score: { p1: 0, p2: 0 }, luckyProcPlayer: lucky });
    expect(resolution.state.players[lucky].mana).toBe(2);
    expect(attackBlockManaRules.project(resolution.state, lucky).luckyProcPlayer).toBe(lucky);
  });

  test('Lucky loses normally when its roll fails', () => {
    let state = startedWith('lucky', 'advantaged');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'attack' }, { ...context, random: () => 0.25 });

    expect(resolution.state).toMatchObject({ phase: 'counter-picking', score: { p1: 0, p2: 1 } });
    expect(resolution.state.luckyProcPlayer).toBeUndefined();
    expect(resolution.state.players.p1.mana).toBe(2);
  });

  test('does not roll for a non-Lucky Mana player', () => {
    const random = vi.fn(() => 0);
    let state = startedWith('advantaged', 'advantaged');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'attack' }, { ...context, random });

    expect(random).not.toHaveBeenCalled();
    expect(resolution.state).toMatchObject({ phase: 'counter-picking', score: { p1: 0, p2: 1 } });
  });

  test('holds the Lucky proc through selection and clears it on the next reveal', () => {
    let state = startedWith('lucky', 'advantaged');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    state = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'attack' }, { ...context, random: () => 0 }).state;
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    expect(state).toMatchObject({ phase: 'waiting', luckyProcPlayer: 'p1' });
    state = send(state, 'p2', { type: 'choose-move', move: 'block' }, 2_100);
    expect(state.luckyProcPlayer).toBeUndefined();
  });

  test('makes all nine classes cosmetic with neutral starting resources', () => {
    for (const classId of ['lucky', 'advantaged', 'thief', 'investor', 'sumo', 'cheater', 'duplicator', 'stunner', 'juggernaut'] as const) {
      let state = attackBlockManaRules.initialize(context);
      state = send(state, 'p1', { type: 'lock-class', classId });
      state = send(state, 'p2', { type: 'lock-class', classId });
      expect(state.players.p1).toMatchObject({ classId, mana: 1, blocks: 5 });
      state = playTurn(state, 'mana', 'block');
      expect(state.players.p1.mana).toBe(2);
    }
  });

  test('exhausts Blocks and restores them after a non-Block move', () => {
    let state = started();
    for (let remaining = 4; remaining >= 0; remaining--) {
      state = playTurn(state, 'block', 'block');
      expect(state.players.p1.blocks).toBe(remaining);
    }
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'block' })).toThrow('No Blocks');
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.blocks).toBe(5);
  });

  test('records the absolute early and late players without revealing the early move', () => {
    let state = started();
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' }, 2_000);
    expect(state).toMatchObject({ phase: 'waiting', earlyPlayer: 'p2', latePlayer: 'p1', waitingStartsAt: 2_174, waitingDeadlineAt: 32_174 });
    expect(attackBlockManaRules.nextDeadline?.(state)).toBe(32_174);
    expect(attackBlockManaRules.project(state, 'p1')).toMatchObject({ opponentReady: true, legalActions: ['attack', 'block', 'mana'] });
    expect(attackBlockManaRules.project(state, 'p1').ownPendingMove).toBeUndefined();
    expect(attackBlockManaRules.project(state, 'p2').ownPendingMove).toBe('mana');
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_050);
    expect(state.phase).toBe('idle');
  });

  test('times out the late player with Skip, Mana loss, and persistent strikes', () => {
    let state = started();
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' }, 2_000);
    state = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!.state;
    expect(state).toMatchObject({ phase: 'idle', heldSplitFor: 'p1' });
    expect(state.players.p1).toMatchObject({ mana: 2, lastMove: 'mana' });
    expect(state.players.p2).toMatchObject({ mana: 0, strikes: 1, lastMove: 'skip' });

    state = send(state, 'p1', { type: 'choose-move', move: 'mana' }, 40_000);
    state = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!.state;
    expect(state).toMatchObject({ phase: 'match-complete', winner: 'p1', resultReason: 'forfeit', score: { p1: 0, p2: 0 } });
    expect(attackBlockManaRules.result(state)).toEqual({ winner: 'p1', scores: { p1: 0, p2: 0 }, reason: 'forfeit' });
  });

  test('Attack defeats Skip while a zero-zero timeout returns to a forced input turn', () => {
    let attackState = started();
    attackState = send(attackState, 'p1', { type: 'choose-move', move: 'attack' }, 2_000);
    attackState = attackBlockManaRules.advanceDeadline!(attackState, { ...context, now: attackState.waitingDeadlineAt! })!.state;
    expect(attackState).toMatchObject({ phase: 'counter-picking', score: { p1: 1, p2: 0 }, heldSplitFor: 'p1' });

    let blockState = started();
    blockState.players.p1.mana = 0;
    blockState = send(blockState, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    blockState = attackBlockManaRules.advanceDeadline!(blockState, { ...context, now: blockState.waitingDeadlineAt! })!.state;
    expect(blockState.turn).toBe(2);
    expect(blockState.players.p1).toMatchObject({ mana: 0, lastMove: 'block' });
    expect(blockState.players.p2).toMatchObject({ mana: 0, lastMove: 'skip', strikes: 1 });
    expect(attackBlockManaRules.project(blockState, 'p1').legalActions).toEqual(['mana']);
    expect(attackBlockManaRules.project(blockState, 'p2').legalActions).toEqual(['mana']);
  });
});

function started(): AbmState {
  return startedWith('advantaged', 'advantaged');
}

function startedWith(p1Class: AbmState['players']['p1']['classId'], p2Class: AbmState['players']['p2']['classId']): AbmState {
  let state = attackBlockManaRules.initialize(context);
  state = send(state, 'p1', { type: 'lock-class', classId: p1Class! });
  return send(state, 'p2', { type: 'lock-class', classId: p2Class! });
}

function playTurn(state: AbmState, p1: AbmMove, p2: AbmMove): AbmState {
  state = send(state, 'p1', { type: 'choose-move', move: p1 });
  expect(attackBlockManaRules.project(state, 'p2').ownPendingMove).toBeUndefined();
  expect(attackBlockManaRules.project(state, 'p2').opponentReady).toBe(true);
  return send(state, 'p2', { type: 'choose-move', move: p2 });
}

function send(state: AbmState, player: PlayerId, command: AbmCommand, now = context.now): AbmState {
  return attackBlockManaRules.resolve(state, player, command, { ...context, now }).state;
}
