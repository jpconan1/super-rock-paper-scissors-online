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
    let state = startedWith('advantaged', 'advantaged');
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
    expect(resolution.events?.[0]?.payload).toMatchObject({ luckyProcPlayer: lucky });
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

  test('keeps neutral starting resources across all nine classes', () => {
    for (const classId of ['lucky', 'advantaged', 'thief', 'investor', 'sumo', 'cheater', 'duplicator', 'stunner', 'juggernaut'] as const) {
      let state = attackBlockManaRules.initialize(context);
      state = send(state, 'p1', { type: 'lock-class', classId });
      state = send(state, 'p2', { type: 'lock-class', classId });
      expect(state.players.p1).toMatchObject({ classId, mana: 1, blocks: 5 });
      state = playTurn(state, 'mana', 'block');
      expect(state.players.p1.mana).toBe(classId === 'advantaged' ? 3 : 2);
    }
  });

  test('gives Advantaged 2 Mana on turns 1-3 and ordinary Mana from turn 4', () => {
    let state = startedWith('advantaged', 'lucky');
    for (const expectedMana of [3, 5, 7, 8]) {
      state = playTurn(state, 'mana', 'block');
      expect(state.players.p1.mana).toBe(expectedMana);
    }
    expect(state.turn).toBe(5);
    expect(state.advantagedProcPlayers).toBeUndefined();
  });

  test('applies Advantaged against Mana and records both mirror procs', () => {
    let state = playTurn(startedWith('advantaged', 'lucky'), 'mana', 'mana');
    expect(state.players.p1.mana).toBe(3);
    expect(state.players.p2.mana).toBe(2);
    expect(state.advantagedProcPlayers).toEqual(['p1']);

    state = playTurn(startedWith('advantaged', 'advantaged'), 'mana', 'mana');
    expect(state.players.p1.mana).toBe(3);
    expect(state.players.p2.mana).toBe(3);
    expect(state.advantagedProcPlayers).toEqual(['p1', 'p2']);
  });

  test('applies Advantaged Mana before an Attack loss', () => {
    let state = startedWith('advantaged', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'attack' }, context);
    expect(resolution.state).toMatchObject({ phase: 'counter-picking', score: { p1: 0, p2: 1 }, advantagedProcPlayers: ['p1'] });
    expect(resolution.state.players.p1.mana).toBe(3);
  });

  test('applies Advantaged on a forced zero-zero Mana turn', () => {
    let state = playTurn(startedWith('advantaged', 'lucky'), 'attack', 'attack');
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.mana).toBe(2);
    expect(state.players.p2.mana).toBe(1);
    expect(state.advantagedProcPlayers).toEqual(['p1']);
  });

  test('applies Advantaged when the opponent times out', () => {
    let state = startedWith('advantaged', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' }, 2_000);
    const resolution = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!;
    expect(resolution.state.players.p1.mana).toBe(3);
    expect(resolution.state.advantagedProcPlayers).toEqual(['p1']);
    expect(resolution.events?.[0]?.payload).toMatchObject({ advantagedProcPlayers: ['p1'] });
  });

  test('holds the Advantaged proc through selection and clears it on the next reveal', () => {
    let state = playTurn(startedWith('advantaged', 'lucky'), 'mana', 'block');
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    expect(state).toMatchObject({ phase: 'waiting', advantagedProcPlayers: ['p1'] });
    state = send(state, 'p2', { type: 'choose-move', move: 'block' }, 2_100);
    expect(state.advantagedProcPlayers).toBeUndefined();
  });

  test('keeps Steal unavailable through Turn 4 and private when armed on Turn 5', () => {
    let state = thiefTurnFive();
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('steal');
    const waiting = attackBlockManaRules.resolve(state, 'p1', { type: 'choose-move', move: 'block', useSteal: true }, context).state;
    expect(attackBlockManaRules.project(waiting, 'p1').ownPendingSteal).toBe(true);
    expect(attackBlockManaRules.project(waiting, 'p2').ownPendingSteal).toBeUndefined();
    expect(waiting.players.p1.stealUsed).toBeUndefined();

    state = startedWith('thief', 'lucky');
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('steal');
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'block', useSteal: true })).toThrow('Turn 5');
  });

  test('transfers Mana after moves and spends Thief Steal', () => {
    let state = thiefTurnFive();
    state = send(state, 'p1', { type: 'choose-move', move: 'block', useSteal: true });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    expect(state.players.p1).toMatchObject({ mana: 2, stealUsed: true });
    expect(state.players.p2.mana).toBe(1);
    expect(state).toMatchObject({ thiefAttemptPlayers: ['p1'], thiefTransferPlayer: 'p1' });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('steal');
  });

  test('spends Steal without transfer when target reaches zero', () => {
    let state = thiefTurnFive();
    state = send(state, 'p1', { type: 'choose-move', move: 'block', useSteal: true });
    state = send(state, 'p2', { type: 'choose-move', move: 'attack' });
    expect(state.players.p1.stealUsed).toBe(true);
    expect(state.players.p2.mana).toBe(0);
    expect(state.thiefAttemptPlayers).toEqual(['p1']);
    expect(state.thiefTransferPlayer).toBeUndefined();
  });

  test('cancels simultaneous Steals and spends both charges', () => {
    let state = thiefTurnFive('thief');
    state = send(state, 'p1', { type: 'choose-move', move: 'block', useSteal: true });
    state = send(state, 'p2', { type: 'choose-move', move: 'block', useSteal: true });
    expect(state.players.p1).toMatchObject({ mana: 1, stealUsed: true });
    expect(state.players.p2).toMatchObject({ mana: 1, stealUsed: true });
    expect(state.thiefAttemptPlayers).toEqual(['p1', 'p2']);
    expect(state.thiefTransferPlayer).toBeUndefined();
  });

  test('resolves Steal before an Attack-Mana round loss', () => {
    let state = thiefTurnFive();
    state.players.p2.mana = 2;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', useSteal: true });
    state = send(state, 'p2', { type: 'choose-move', move: 'attack' });
    expect(state).toMatchObject({ phase: 'counter-picking', score: { p1: 0, p2: 1 }, thiefTransferPlayer: 'p1' });
    expect(state.players.p1.mana).toBe(3);
    expect(state.players.p2.mana).toBe(0);
  });

  test('allows Steal on a forced Mana turn and restores its charge next round', () => {
    let state = thiefTurnFive();
    state.players.p1.mana = 0; state.players.p2.mana = 0;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', useSteal: true });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    expect(state.players.p1.mana).toBe(2);
    expect(state.players.p2.mana).toBe(0);

    state.players.p2.mana = 1;
    state = send(state, 'p1', { type: 'choose-move', move: 'attack' });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    state = send(state, 'p2', { type: 'lock-class', classId: 'thief' }, state.counterPickAvailableAt);
    expect(state.players.p1.stealUsed).toBeUndefined();
    expect(state.players.p2.stealUsed).toBeUndefined();
  });

  test('resolves an armed Steal after timeout resources without showing turn feedback', () => {
    let state = thiefTurnFive();
    state.players.p2.mana = 2;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', useSteal: true }, 2_000);
    const resolution = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!;
    expect(resolution.state.players.p1).toMatchObject({ mana: 3, stealUsed: true });
    expect(resolution.state.players.p2.mana).toBe(0);
    expect(resolution.state.thiefAttemptPlayers).toBeUndefined();
    expect(resolution.state.thiefTransferPlayer).toBeUndefined();
    expect(resolution.events?.[0]?.payload).toMatchObject({ thiefAttemptPlayers: ['p1'], thiefTransferPlayer: 'p1' });
  });

  test('holds Thief feedback through selection and clears it on the next reveal', () => {
    let state = thiefTurnFive();
    state = send(state, 'p1', { type: 'choose-move', move: 'block', useSteal: true });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' }, 2_000);
    expect(state.thiefAttemptPlayers).toEqual(['p1']);
    state = send(state, 'p2', { type: 'choose-move', move: 'block' }, 2_100);
    expect(state.thiefAttemptPlayers).toBeUndefined();
    expect(state.thiefTransferPlayer).toBeUndefined();
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

  test('Juggernaut disables Block after each even consecutive Attack', () => {
    let state = startedWith('juggernaut', 'lucky');
    state.players.p1.mana = 5;

    state = playTurn(state, 'attack', 'block');
    expect(state.players.p1.attackStreak).toBe(1);
    expect(attackBlockManaRules.project(state, 'p2').legalActions).toContain('block');

    state = playTurn(state, 'attack', 'block');
    expect(state.players.p1.attackStreak).toBe(2);
    expect(state.juggernautProcPlayers).toEqual(['p1']);
    expect(attackBlockManaRules.project(state, 'p2').legalActions).not.toContain('block');
    expect(() => send(state, 'p2', { type: 'choose-move', move: 'block' })).toThrow('prevents Blocking');

    state = playTurn(state, 'attack', 'attack');
    expect(state.players.p1.attackStreak).toBe(3);
    expect(attackBlockManaRules.project(state, 'p2').legalActions).toContain('block');

    state = playTurn(state, 'attack', 'block');
    expect(state.players.p1.attackStreak).toBe(4);
    expect(state.juggernautProcPlayers).toEqual(['p1']);
    expect(attackBlockManaRules.project(state, 'p2').legalActions).not.toContain('block');
  });

  test('Juggernaut Mana or Block breaks its streak without draining opponent Blocks', () => {
    let state = startedWith('juggernaut', 'lucky');
    state.players.p1.mana = 4;
    state = playTurn(state, 'attack', 'block');
    state = playTurn(state, 'attack', 'block');
    expect(state.players.p2.blocks).toBe(3);
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.attackStreak).toBe(0);
    expect(state.players.p2.blocks).toBe(5);
    state = playTurn(state, 'block', 'block');
    expect(state.players.p1.attackStreak).toBe(0);
  });

  test('mirror Juggernauts both proc and both lose Block on the restricted turn', () => {
    let state = startedWith('juggernaut', 'juggernaut');
    state.players.p1.mana = 4;
    state.players.p2.mana = 4;
    state = playTurn(state, 'attack', 'attack');
    state = playTurn(state, 'attack', 'attack');
    expect(state.juggernautProcPlayers).toEqual(['p1', 'p2']);
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('block');
    expect(attackBlockManaRules.project(state, 'p2').legalActions).not.toContain('block');
  });

  test('Juggernaut Skip breaks its Attack streak', () => {
    let state = startedWith('lucky', 'juggernaut');
    state.players.p2.attackStreak = 1;
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    state = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!.state;
    expect(state.players.p2).toMatchObject({ lastMove: 'skip', attackStreak: 0 });
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
  return startedWith('lucky', 'lucky');
}

function startedWith(p1Class: AbmState['players']['p1']['classId'], p2Class: AbmState['players']['p2']['classId']): AbmState {
  let state = attackBlockManaRules.initialize(context);
  state = send(state, 'p1', { type: 'lock-class', classId: p1Class! });
  return send(state, 'p2', { type: 'lock-class', classId: p2Class! });
}

function thiefTurnFive(p2Class: AbmState['players']['p2']['classId'] = 'lucky'): AbmState {
  let state = startedWith('thief', p2Class);
  for (let turn = 1; turn < 5; turn++) state = playTurn(state, 'block', 'block');
  return state;
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
