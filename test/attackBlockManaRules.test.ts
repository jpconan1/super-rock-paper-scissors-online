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
    ['attack', 'mana', 'p1', 1, 1, 5, 5],
    ['block', 'attack', undefined, 1, 0, 4, 5],
    ['block', 'block', undefined, 1, 1, 4, 4],
    ['block', 'mana', undefined, 1, 2, 4, 5],
    ['mana', 'attack', 'p2', 1, 1, 5, 5],
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

  test('resets both players to 1 Mana while the loser counter-picks', () => {
    let state = startedWith('lucky', 'advantaged');
    state.players.p1.mana = 4;
    state.players.p2.mana = 3;

    state = playTurn(state, 'attack', 'mana');

    expect(state).toMatchObject({ phase: 'counter-picking', players: { p1: { mana: 1 }, p2: { mana: 1 } } });
  });

  test('broadcasts only the active loser\'s available counter-pick previews', () => {
    const state = playTurn(startedWith('lucky', 'advantaged'), 'attack', 'mana');
    const availableAt = state.counterPickAvailableAt!;
    expect(() => attackBlockManaRules.resolve(state, 'p1', { type: 'preview-class', classId: 'investor' }, { ...context, now: availableAt }))
      .toThrow('cannot be previewed');
    expect(() => attackBlockManaRules.resolve(state, 'p2', { type: 'preview-class', classId: 'investor' }, { ...context, now: availableAt - 1 }))
      .toThrow('not available');

    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'preview-class', classId: 'investor' }, { ...context, now: availableAt });
    expect(resolution.state).toBe(state);
    expect(resolution.events).toEqual([{ type: 'class-preview', startsAt: availableAt, endsAt: availableAt + 600, payload: { player: 'p2', classId: 'investor' } }]);
    expect(resolution.state.players.p2.classId).toBe('advantaged');
    expect(attackBlockManaRules.project(resolution.state, 'p1').legalActions).toEqual([]);
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
    expect(resolution.state.players.p1.mana).toBe(1);
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

  test('keeps neutral starting resources across all playable classes', () => {
    for (const classId of ['lucky', 'advantaged', 'thief', 'juggernaut'] as const) {
      let state = attackBlockManaRules.initialize(context);
      state = send(state, 'p1', { type: 'lock-class', classId });
      state = send(state, 'p2', { type: 'lock-class', classId });
      expect(state.players.p1).toMatchObject({ classId, mana: 1, blocks: 5 });
      state = playTurn(state, 'mana', 'block');
      expect(state.players.p1.mana).toBe(classId === 'advantaged' ? 3 : 2);
    }
  });

  test('gives Retired its special resources and prevents Mana gains', () => {
    let state = startedWith('retired', 'lucky');
    expect(state.players.p1).toMatchObject({ classId: 'retired', mana: 7, blocks: 4 });

    state = playTurn(state, 'mana', 'block');
    expect(state.players.p1).toMatchObject({ mana: 7, blocks: 4, lastMove: 'mana' });

    state.players.p1.blocks = 1;
    state = playTurn(state, 'attack', 'block');
    expect(state.players.p1).toMatchObject({ mana: 6, blocks: 4 });
  });

  test('un-retires a depleted Retired mirror and holds both proc tags until the next reveal', () => {
    let state = startedWith('retired', 'retired');
    state.players.p1.mana = 1;
    state.players.p2.mana = 1;

    state = playTurn(state, 'attack', 'attack');
    expect(state).toMatchObject({ phase: 'idle', retiredProcPlayers: ['p1', 'p2'] });
    expect(state.players.p1).toMatchObject({ mana: 1, blocks: 5 });
    expect(state.players.p2).toMatchObject({ mana: 1, blocks: 5 });
    expect(state.players.p1.classId).toBeUndefined();
    expect(state.players.p2.classId).toBeUndefined();
    expect(attackBlockManaRules.project(state, 'p1').retiredProcPlayers).toEqual(['p1', 'p2']);

    state = send(state, 'p1', { type: 'choose-move', move: 'block' });
    expect(state.retiredProcPlayers).toEqual(['p1', 'p2']);
    state = send(state, 'p2', { type: 'choose-move', move: 'block' });
    expect(state.retiredProcPlayers).toBeUndefined();
  });

  test('does not un-retire a single Retired or a mirror above mutual zero', () => {
    let mixed = startedWith('retired', 'lucky');
    mixed.players.p1.mana = 1;
    mixed.players.p2.mana = 1;
    mixed = playTurn(mixed, 'attack', 'attack');
    expect(mixed.players.p1.classId).toBe('retired');
    expect(mixed.retiredProcPlayers).toBeUndefined();

    let mirror = startedWith('retired', 'retired');
    mirror.players.p1.mana = 2;
    mirror.players.p2.mana = 1;
    mirror = playTurn(mirror, 'attack', 'attack');
    expect(mirror.players.p1.classId).toBe('retired');
    expect(mirror.players.p2.classId).toBe('retired');
    expect(mirror.retiredProcPlayers).toBeUndefined();
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
    expect(resolution.state.players.p1.mana).toBe(1);
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

  test('starts and resets Investor at 5 Mana', () => {
    let state = startedWith('investor', 'lucky');
    expect(state.players).toMatchObject({ p1: { mana: 5 }, p2: { mana: 1 } });
    state = playTurn(state, 'attack', 'mana');
    expect(state).toMatchObject({ phase: 'counter-picking', players: { p1: { mana: 5 }, p2: { mana: 1 } } });
    state = send(state, 'p2', { type: 'lock-class', classId: 'investor' }, state.counterPickAvailableAt);
    expect(state.players).toMatchObject({ p1: { classId: 'investor', mana: 5 }, p2: { classId: 'investor', mana: 5 } });
  });

  test('starts Gambler with 3 Blocks and resets non-Block moves to its class maximum', () => {
    let state = startedWith('gambler', 'lucky');
    expect(state.players.p1).toMatchObject({ mana: 1, blocks: 3 });
    state.players.p1.blocks = 7;
    state = playTurn(state, 'mana', 'block');
    expect(state.players.p1.blocks).toBe(3);
    state = playTurn(state, 'attack', 'block');
    expect(state).toMatchObject({ phase: 'idle', players: { p1: { mana: 1, blocks: 3 } } });
  });

  test.each([
    [0, 'plus-2-mana', 3, 2],
    [0.01, 'plus-1-mana', 2, 2],
    [0.20, 'mana-drain', 0, 2],
    [0.30, 'mana-double', 2, 2],
    [0.40, 'plus-1-block', 1, 3],
    [0.55, 'plus-2-block', 1, 4],
    [0.60, 'minus-1-block', 1, 1],
    [0.70, 'nothing', 1, 2],
  ] as const)('resolves Gambler boundary roll %s as %s', (random, outcome, mana, blocks) => {
    let state = startedWith('gambler', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'block' });
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => random });
    expect(resolution.state.players.p1).toMatchObject({ mana, blocks });
    expect(resolution.state.gamblerOutcomes).toEqual({ p1: outcome });
    expect(attackBlockManaRules.project(resolution.state, 'p2').gamblerOutcomes).toEqual({ p1: outcome });
    expect(resolution.events?.[0]?.payload).toMatchObject({ gamblerOutcomes: { p1: outcome } });
  });

  test('lets Gambler exceed 3 Blocks and caps Mana outcomes at 9', () => {
    let blocks = startedWith('gambler', 'lucky');
    blocks.players.p1.blocks = 5;
    blocks = send(blocks, 'p1', { type: 'choose-move', move: 'block' });
    blocks = attackBlockManaRules.resolve(blocks, 'p2', { type: 'choose-move', move: 'attack' }, { ...context, random: () => 0.55 }).state;
    expect(blocks.players.p1.blocks).toBe(6);

    let mana = startedWith('gambler', 'lucky');
    mana.players.p1.mana = 8;
    mana = send(mana, 'p1', { type: 'choose-move', move: 'block' });
    mana = attackBlockManaRules.resolve(mana, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => 0 }).state;
    expect(mana.players.p1.mana).toBe(9);
    mana.players.p1.mana = 6;
    mana = send(mana, 'p1', { type: 'choose-move', move: 'block' });
    mana = attackBlockManaRules.resolve(mana, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => 0.30 }).state;
    expect(mana.players.p1.mana).toBe(9);
  });

  test('rolls simultaneous Gamblers in deterministic player order', () => {
    const random = vi.fn().mockReturnValueOnce(0.40).mockReturnValueOnce(0.55);
    let state = startedWith('gambler', 'gambler');
    state = send(state, 'p1', { type: 'choose-move', move: 'block' });
    state = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random }).state;
    expect(random).toHaveBeenCalledTimes(2);
    expect(state.players).toMatchObject({ p1: { blocks: 3 }, p2: { blocks: 4 } });
    expect(state.gamblerOutcomes).toEqual({ p1: 'plus-1-block', p2: 'plus-2-block' });
  });

  test('resolves an early Gambler Block when the opponent times out', () => {
    let state = startedWith('gambler', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    const resolution = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt!, random: () => 0 })!;
    expect(resolution.state.players.p1).toMatchObject({ mana: 3, blocks: 2 });
    expect(resolution.state.gamblerOutcomes).toEqual({ p1: 'plus-2-mana' });
    expect(resolution.events?.[0]?.payload).toMatchObject({ gamblerOutcomes: { p1: 'plus-2-mana' } });
  });

  test('gives Investor 2 Mana when both players Mana, including mirror and cap', () => {
    let state = playTurn(startedWith('investor', 'lucky'), 'mana', 'mana');
    expect(state.players).toMatchObject({ p1: { mana: 7 }, p2: { mana: 2 } });
    expect(state.investorBullPlayers).toEqual(['p1']);

    state = startedWith('investor', 'investor');
    state.players.p1.mana = 8; state.players.p2.mana = 9;
    state = playTurn(state, 'mana', 'mana');
    expect(state.players).toMatchObject({ p1: { mana: 9 }, p2: { mana: 9 } });
    expect(state.investorBullPlayers).toEqual(['p1', 'p2']);
  });

  test('applies Investor Bull on a forced zero-zero Mana turn', () => {
    let state = startedWith('investor', 'lucky');
    state.players.p1.mana = 0; state.players.p2.mana = 0;
    state = playTurn(state, 'mana', 'mana');
    expect(state.players).toMatchObject({ p1: { mana: 2 }, p2: { mana: 1 } });
    expect(state.investorBullPlayers).toEqual(['p1']);
  });

  test('taxes Investor after moves on absolute third turns and records Bear only for an actual drain', () => {
    let state = startedWith('investor', 'lucky');
    state = playTurn(state, 'block', 'block');
    state = playTurn(state, 'block', 'block');
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.mana).toBe(6);
    expect(state.investorBullPlayers).toEqual(['p1']);
    expect(state.investorBearPlayers).toEqual(['p1']);
    expect(attackBlockManaRules.project(state, 'p1')).toMatchObject({ investorBullPlayers: ['p1'], investorBearPlayers: ['p1'] });

    state = playTurn(state, 'block', 'block');
    expect(state.investorBullPlayers).toBeUndefined();
    expect(state.investorBearPlayers).toBeUndefined();

    state.turn = 6; state.players.p1.mana = 0;
    state = playTurn(state, 'block', 'block');
    expect(state.players.p1.mana).toBe(0);
    expect(state.investorBearPlayers).toBeUndefined();
  });

  test('taxes Investors after timeout move and strike deductions', () => {
    let state = startedWith('investor', 'investor');
    state.turn = 3; state.players.p1.mana = 2; state.players.p2.mana = 1;
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    state = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!.state;
    expect(state.players).toMatchObject({ p1: { mana: 1 }, p2: { mana: 0, strikes: 1 } });
    expect(state.investorBearPlayers).toEqual(['p1']);
  });

  test('grows Duplicator Mana gains 1, 2, 4, 8 and marks only duplicated gains', () => {
    let state = startedWith('duplicator', 'duplicator');
    for (const [mana, nextGain, proc] of [[2, 2, undefined], [4, 4, ['p1', 'p2']], [8, 8, ['p1', 'p2']], [9, 16, ['p1', 'p2']]] as const) {
      state = playTurn(state, 'mana', 'mana');
      expect(state.players.p1).toMatchObject({ mana, nextManaGain: nextGain });
      expect(state.players.p2).toMatchObject({ mana, nextManaGain: nextGain });
      expect(state.duplicatorProcPlayers).toEqual(proc);
    }
  });

  test('advances Duplicator on forced Mana and keeps advancing at the Mana cap', () => {
    let state = startedWith('duplicator', 'lucky');
    state.players.p1.mana = 0; state.players.p2.mana = 0;
    state.players.p1.nextManaGain = undefined;
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1).toMatchObject({ mana: 1, nextManaGain: 2 });
    expect(state.duplicatorProcPlayers).toBeUndefined();
    state.players.p1.mana = 9;
    state = playTurn(state, 'mana', 'block');
    expect(state.players.p1).toMatchObject({ mana: 9, nextManaGain: 4 });
    expect(state.duplicatorProcPlayers).toEqual(['p1']);
  });

  test('awards Copywriter on the third and every later matching opponent move', () => {
    let state = startedWith('copywriter', 'lucky');
    state = playTurn(state, 'block', 'block');
    state = playTurn(state, 'block', 'block');
    expect(state.copywriterProcPlayers).toBeUndefined();
    state = playTurn(state, 'block', 'block');
    expect(state.players.p1.mana).toBe(2);
    expect(state.copywriterProcPlayers).toEqual(['p1']);
    expect(attackBlockManaRules.project(state, 'p1').copywriterProcPlayers).toEqual(['p1']);
    state = playTurn(state, 'block', 'block');
    expect(state.players.p1.mana).toBe(3);
    expect(state.copywriterProcPlayers).toEqual(['p1']);

    state = send(state, 'p1', { type: 'choose-move', move: 'block' });
    expect(state.copywriterProcPlayers).toEqual(['p1']);
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'mana' }, context);
    expect(resolution.state.copywriterProcPlayers).toBeUndefined();
    expect(resolution.events?.[0]?.payload).toMatchObject({ copywriterProcPlayers: [] });
  });

  test('breaks Copywriter streaks and supports mirror procs', () => {
    let mixed = startedWith('copywriter', 'lucky');
    mixed = playTurn(mixed, 'block', 'block');
    mixed = playTurn(mixed, 'block', 'mana');
    mixed = playTurn(mixed, 'block', 'block');
    expect(mixed.copywriterProcPlayers).toBeUndefined();

    let mirror = startedWith('copywriter', 'copywriter');
    mirror = playTurn(mirror, 'block', 'block');
    mirror = playTurn(mirror, 'block', 'block');
    mirror = playTurn(mirror, 'block', 'block');
    expect(mirror.copywriterProcPlayers).toEqual(['p1', 'p2']);
    expect(mirror.players.p1.mana).toBe(2);
    expect(mirror.players.p2.mana).toBe(2);
  });

  test('applies Copywriter before move costs and caps the reward at 9 Mana', () => {
    let state = startedWith('copywriter', 'lucky');
    state.players.p1.mana = 1;
    state.players.p2.recentMoves = ['block', 'block'];
    state = playTurn(state, 'attack', 'block');
    expect(state.players.p1.mana).toBe(1);
    expect(state.copywriterProcPlayers).toEqual(['p1']);

    state.players.p1.mana = 9;
    state.players.p2.recentMoves = ['block', 'block'];
    state = playTurn(state, 'block', 'block');
    expect(state.players.p1.mana).toBe(9);
  });

  test('records timeout Skip and forced Mana for Copywriter streaks', () => {
    let timeout = startedWith('copywriter', 'lucky');
    timeout.players.p2.recentMoves = ['skip', 'skip'];
    timeout = send(timeout, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    timeout = attackBlockManaRules.advanceDeadline!(timeout, { ...context, now: timeout.waitingDeadlineAt! })!.state;
    expect(timeout.copywriterProcPlayers).toEqual(['p1']);
    expect(timeout.players.p2.recentMoves).toEqual(['skip', 'skip', 'skip']);

    let forced = startedWith('copywriter', 'lucky');
    forced.players.p1.mana = 0;
    forced.players.p2.mana = 0;
    forced.players.p2.recentMoves = ['mana', 'mana'];
    forced = playTurn(forced, 'mana', 'mana');
    expect(forced.copywriterProcPlayers).toEqual(['p1']);
    expect(forced.players.p2.recentMoves).toEqual(['mana', 'mana', 'mana']);
  });

  test('clears recent move history when a round resets', () => {
    let state = startedWith('copywriter', 'lucky');
    state.players.p1.recentMoves = ['block', 'block'];
    state.players.p2.recentMoves = ['mana', 'mana'];
    state = playTurn(state, 'attack', 'mana');
    expect(state.phase).toBe('counter-picking');
    expect(state.players.p1.recentMoves).toBeUndefined();
    expect(state.players.p2.recentMoves).toBeUndefined();
  });

  test('stages Conjurer behind the opponent move and gives only the Conjurer a fresh response window', () => {
    let state = startedWith('conjurer', 'lucky');
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('conjure');
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'conjure' })).toThrow('activated before');
    state = send(state, 'p1', { type: 'activate-ability', ability: 'conjure' }, 2_000);
    expect(state).toMatchObject({ phase: 'waiting', earlyPlayer: 'p1', latePlayer: 'p2' });
    expect(state.players.p1).toMatchObject({ mana: 0, abilityUses: { conjure: 1 } });
    expect(attackBlockManaRules.project(state, 'p1').ownPendingAbility).toBe('conjure');
    expect(attackBlockManaRules.project(state, 'p2').ownPendingAbility).toBeUndefined();
    expect(attackBlockManaRules.project(state, 'p2').legalActions).toEqual(['attack', 'block', 'mana']);

    const reveal = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, { ...context, now: 3_000 });
    state = reveal.state;
    expect(reveal.events?.[0]).toMatchObject({ type: 'conjure-reveal', payload: { conjurer: 'p1', move: 'block' } });
    expect(state).toMatchObject({ phase: 'conjurer-choosing', conjurer: 'p1', conjuredMove: 'block', waitingStartsAt: 3_580, waitingDeadlineAt: 33_580 });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toEqual(['block', 'mana']);
    expect(attackBlockManaRules.project(state, 'p2').legalActions).toEqual([]);
    expect(() => send(state, 'p2', { type: 'choose-move', move: 'mana' })).toThrow('already locked');

    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 4_000);
    expect(state).toMatchObject({ phase: 'idle', turn: 2, lastCompleteMoves: { p1: 'block', p2: 'block' } });
    expect(state.conjurer).toBeUndefined();
  });

  test('enters Conjurer choice when the opponent committed first', () => {
    let state = startedWith('conjurer', 'lucky');
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' }, 2_000);
    const resolution = attackBlockManaRules.resolve(state, 'p1', { type: 'activate-ability', ability: 'conjure' }, { ...context, now: 2_500 });
    expect(resolution.state).toMatchObject({ phase: 'conjurer-choosing', conjurer: 'p1', conjuredMove: 'mana', waitingDeadlineAt: 33_080 });
    expect(resolution.events?.[0]?.type).toBe('conjure-reveal');
  });

  test('lets Conjurer Attack a revealed Mana and consumes Fireborne shield', () => {
    let state = startedWith('conjurer', 'fireborne');
    state.players.p1.mana = 2;
    state.players.p2.fireShieldTurns = 2;
    state = send(state, 'p1', { type: 'activate-ability', ability: 'conjure' }, 2_000);
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' }, 3_000);
    expect(state).toMatchObject({ phase: 'conjurer-choosing', conjurer: 'p1', conjuredMove: 'mana' });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('attack');

    state = send(state, 'p1', { type: 'choose-move', move: 'attack' }, 4_000);
    expect(state).toMatchObject({
      phase: 'idle', turn: 2, score: { p1: 0, p2: 0 },
      lastCompleteMoves: { p1: 'attack', p2: 'mana' }, fireborneProcPlayer: 'p2',
      players: { p1: { mana: 0 }, p2: { fireShieldTurns: 0 } },
    });
  });

  test('cancels dual Conjure into ordinary simultaneous selection for the rest of the turn', () => {
    let state = startedWith('conjurer', 'conjurer');
    state = send(state, 'p1', { type: 'activate-ability', ability: 'conjure' }, 2_000);
    const stalemate = attackBlockManaRules.resolve(state, 'p2', { type: 'activate-ability', ability: 'conjure' }, { ...context, now: 2_500 });
    state = stalemate.state;
    expect(stalemate.events?.[0]?.type).toBe('conjure-stalemate');
    expect(state).toMatchObject({ phase: 'idle', conjureStalemate: true, players: {
      p1: { mana: 0, abilityUses: { conjure: 1 } }, p2: { mana: 0, abilityUses: { conjure: 1 } },
    } });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toEqual(['mana']);
    expect(() => send(state, 'p1', { type: 'activate-ability', ability: 'conjure' })).toThrow('cannot be repeated');
    state = playTurn(state, 'mana', 'mana');
    expect(state.conjureStalemate).toBeUndefined();
    expect(state.lastCompleteMoves).toEqual({ p1: 'mana', p2: 'mana' });
  });

  test('reveals opponent timeout Skip once and resolves after the Conjurer responds', () => {
    let state = startedWith('conjurer', 'lucky');
    state = send(state, 'p1', { type: 'activate-ability', ability: 'conjure' }, 2_000);
    const reveal = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!;
    state = reveal.state;
    expect(reveal.events?.[0]).toMatchObject({ type: 'conjure-reveal', payload: { conjurer: 'p1', move: 'skip' } });
    expect(state).toMatchObject({ phase: 'conjurer-choosing', conjuredMove: 'skip', players: { p2: { mana: 0, strikes: 1 } } });
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, state.waitingStartsAt! + 1_000);
    expect(state.players.p2).toMatchObject({ mana: 0, strikes: 1, lastMove: 'skip' });
    expect(state.players.p2.recentMoves).toEqual(['skip']);
  });

  test('turns a Conjurer response timeout into Skip against the committed opponent move', () => {
    let state = startedWith('conjurer', 'lucky');
    state = send(state, 'p1', { type: 'activate-ability', ability: 'conjure' }, 2_000);
    state = send(state, 'p2', { type: 'choose-move', move: 'block' }, 3_000);
    state = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!.state;
    expect(state).toMatchObject({ phase: 'idle', turn: 2, players: { p1: { mana: 0, strikes: 1, lastMove: 'skip' }, p2: { lastMove: 'block' } } });
  });

  test('resets Duplicator chain on Attack, Block, Skip, and round reset', () => {
    let attack = startedWith('duplicator', 'lucky');
    attack.players.p1.nextManaGain = 8;
    attack = playTurn(attack, 'attack', 'block');
    expect(attack.players.p1.nextManaGain).toBe(1);

    let block = startedWith('duplicator', 'lucky');
    block.players.p1.nextManaGain = 8;
    block = playTurn(block, 'block', 'block');
    expect(block.players.p1.nextManaGain).toBe(1);

    let skip = startedWith('lucky', 'duplicator');
    skip.players.p2.nextManaGain = 8;
    skip = send(skip, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    skip = attackBlockManaRules.advanceDeadline!(skip, { ...context, now: skip.waitingDeadlineAt! })!.state;
    expect(skip.players.p2.nextManaGain).toBe(1);

    let round = startedWith('duplicator', 'lucky');
    round.players.p1.nextManaGain = 8;
    round = playTurn(round, 'attack', 'mana');
    expect(round).toMatchObject({ phase: 'counter-picking', players: { p1: { nextManaGain: 1 } } });
  });

  test('holds Duplicator feedback while waiting and clears it on next reveal', () => {
    let state = startedWith('duplicator', 'lucky');
    state.players.p1.nextManaGain = 2;
    state = playTurn(state, 'mana', 'block');
    expect(state.duplicatorProcPlayers).toEqual(['p1']);
    expect(attackBlockManaRules.project(state, 'p1').duplicatorProcPlayers).toEqual(['p1']);
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    expect(state.duplicatorProcPlayers).toEqual(['p1']);
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, context);
    expect(resolution.state.duplicatorProcPlayers).toBeUndefined();
    expect(resolution.events?.[0]?.payload).toMatchObject({ duplicatorProcPlayers: [] });
  });

  test('gives Sumo three Attack-draw refunds with 2, 1, 0 charge feedback', () => {
    let state = startedWith('sumo', 'sumo');
    for (const remaining of [2, 1, 0] as const) {
      state = playTurn(state, 'attack', 'attack');
      expect(state.players.p1).toMatchObject({ mana: 1, refundsRemaining: remaining });
      expect(state.players.p2).toMatchObject({ mana: 1, refundsRemaining: remaining });
      expect(state.sumoProcRemaining).toEqual({ p1: remaining, p2: remaining });
    }
    state = playTurn(state, 'attack', 'attack');
    expect(state.players).toMatchObject({ p1: { mana: 0, refundsRemaining: 0 }, p2: { mana: 0, refundsRemaining: 0 } });
    expect(state.sumoProcRemaining).toBeUndefined();
  });

  test('charges Sumo normally outside Attack versus Attack and still requires Attack Mana', () => {
    let state = startedWith('sumo', 'lucky');
    state = playTurn(state, 'attack', 'block');
    expect(state.players.p1).toMatchObject({ mana: 0, refundsRemaining: 3 });
    expect(state.sumoProcRemaining).toBeUndefined();
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('attack');
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'attack' })).toThrow('Attack requires 1 Mana.');
  });

  test('refunds Sumo full Stunner-modified Attack cost', () => {
    let state = startedWith('sumo', 'stunner');
    state.players.p1.mana = 5; state.players.p2.mana = 5;
    state = playTurn(state, 'attack', 'attack');
    expect(state.players.p1).toMatchObject({ mana: 5, attackCost: 2, refundsRemaining: 2 });
    state = playTurn(state, 'attack', 'attack');
    expect(state.players.p1).toMatchObject({ mana: 5, attackCost: 4, refundsRemaining: 1 });
  });

  test('defaults and resets Sumo refunds to three', () => {
    let state = startedWith('sumo', 'lucky');
    state.players.p1.refundsRemaining = undefined;
    state = playTurn(state, 'attack', 'attack');
    expect(state.players.p1.refundsRemaining).toBe(2);

    state.players.p1.refundsRemaining = 0;
    state = playTurn(state, 'attack', 'mana');
    expect(state).toMatchObject({ phase: 'counter-picking', players: { p1: { mana: 1, refundsRemaining: 3 } } });
  });

  test('holds Sumo feedback while waiting and clears it next reveal', () => {
    let state = playTurn(startedWith('sumo', 'lucky'), 'attack', 'attack');
    expect(state.sumoProcRemaining).toEqual({ p1: 2 });
    expect(attackBlockManaRules.project(state, 'p1').sumoProcRemaining).toEqual({ p1: 2 });
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    expect(state.sumoProcRemaining).toEqual({ p1: 2 });
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, context);
    expect(resolution.state.sumoProcRemaining).toBeUndefined();
    expect(resolution.events?.[0]?.payload).toMatchObject({ sumoProcRemaining: {} });
  });

  test('gives Cheater 2 Mana below one third and 1 Mana at the boundary', () => {
    let success = startedWith('cheater', 'lucky');
    success = send(success, 'p1', { type: 'choose-move', move: 'mana' });
    const successResolution = attackBlockManaRules.resolve(success, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => 1 / 3 - .0001 });
    expect(successResolution.state.players.p1.mana).toBe(3);
    expect(successResolution.state.cheaterProcPlayers).toEqual(['p1']);
    expect(successResolution.events?.[0]?.payload).toMatchObject({ cheaterProcPlayers: ['p1'] });

    let failure = startedWith('cheater', 'lucky');
    failure = send(failure, 'p1', { type: 'choose-move', move: 'mana' });
    failure = attackBlockManaRules.resolve(failure, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => 1 / 3 }).state;
    expect(failure.players.p1.mana).toBe(2);
    expect(failure.cheaterProcPlayers).toBeUndefined();
  });

  test('does not roll Cheater RNG for other classes or non-Mana moves', () => {
    const random = vi.fn(() => 0);
    let ordinary = startedWith('lucky', 'lucky');
    ordinary = send(ordinary, 'p1', { type: 'choose-move', move: 'mana' });
    attackBlockManaRules.resolve(ordinary, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random });
    expect(random).not.toHaveBeenCalled();

    let cheater = startedWith('cheater', 'lucky');
    cheater = send(cheater, 'p1', { type: 'choose-move', move: 'block' });
    attackBlockManaRules.resolve(cheater, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random });
    expect(random).not.toHaveBeenCalled();
  });

  test('rolls mirror Cheaters independently in P1 then P2 order on forced Mana', () => {
    const random = vi.fn().mockReturnValueOnce(.1).mockReturnValueOnce(.9);
    let state = startedWith('cheater', 'cheater');
    state.players.p1.mana = 0; state.players.p2.mana = 0;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    state = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'mana' }, { ...context, random }).state;
    expect(state.players).toMatchObject({ p1: { mana: 2 }, p2: { mana: 1 } });
    expect(state.cheaterProcPlayers).toEqual(['p1']);
    expect(random).toHaveBeenCalledTimes(2);
  });

  test('rolls Cheater Mana on timeout and caps successful gain at 9', () => {
    let timeout = startedWith('cheater', 'lucky');
    timeout = send(timeout, 'p1', { type: 'choose-move', move: 'mana' }, 2_000);
    timeout = attackBlockManaRules.advanceDeadline!(timeout, { ...context, now: timeout.waitingDeadlineAt!, random: () => 0 })!.state;
    expect(timeout.players.p1.mana).toBe(3);
    expect(timeout.cheaterProcPlayers).toEqual(['p1']);

    let capped = startedWith('cheater', 'lucky');
    capped.players.p1.mana = 9;
    capped = send(capped, 'p1', { type: 'choose-move', move: 'mana' });
    capped = attackBlockManaRules.resolve(capped, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => 0 }).state;
    expect(capped.players.p1.mana).toBe(9);
    expect(capped.cheaterProcPlayers).toEqual(['p1']);
  });

  test('holds Cheater feedback while waiting and clears it next reveal', () => {
    let state = startedWith('cheater', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    state = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, { ...context, random: () => 0 }).state;
    expect(attackBlockManaRules.project(state, 'p1').cheaterProcPlayers).toEqual(['p1']);
    state = send(state, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    expect(state.cheaterProcPlayers).toEqual(['p1']);
    const resolution = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'block' }, context);
    expect(resolution.state.cheaterProcPlayers).toBeUndefined();
    expect(resolution.events?.[0]?.payload).toMatchObject({ cheaterProcPlayers: [] });
  });

  test('doubles Stunner Attack cost through 2, 4, and capped 8', () => {
    let state = startedWith('stunner', 'lucky');
    state.players.p1.mana = 9;
    state.players.p2.mana = 9;
    for (const cost of [2, 4, 8, 8]) {
      state = playTurn(state, 'attack', 'block');
      expect(state.players.p2.attackCost).toBe(cost);
      expect(state.stunnedPlayers).toEqual(['p2']);
    }
  });

  test('requires and spends the full stunned Attack cost before Stunner resets it', () => {
    let state = startedWith('stunner', 'lucky');
    state.players.p1.mana = 9;
    state.players.p2.mana = 9;
    state = playTurn(state, 'attack', 'block');
    state = playTurn(state, 'attack', 'block');
    expect(state.players.p2.attackCost).toBe(4);
    state.players.p2.mana = 3;
    expect(attackBlockManaRules.project(state, 'p2').legalActions).not.toContain('attack');
    expect(() => send(state, 'p2', { type: 'choose-move', move: 'attack' })).toThrow('Attack requires 4 Mana.');
    state.players.p2.mana = 9;
    state = playTurn(state, 'block', 'attack');
    expect(state.players.p2).toMatchObject({ mana: 5, attackCost: 1 });
    expect(state.stunnedPlayers).toBeUndefined();
  });

  test('resets Stunner cost with Mana and Skip', () => {
    let manaState = startedWith('stunner', 'lucky');
    manaState.players.p2.attackCost = 8;
    manaState = playTurn(manaState, 'mana', 'block');
    expect(manaState.players.p2.attackCost).toBe(1);

    let skipState = startedWith('lucky', 'stunner');
    skipState.players.p1.attackCost = 4;
    skipState = send(skipState, 'p1', { type: 'choose-move', move: 'block' }, 2_000);
    skipState = attackBlockManaRules.advanceDeadline!(skipState, { ...context, now: skipState.waitingDeadlineAt! })!.state;
    expect(skipState.players.p1.attackCost).toBe(1);
  });

  test('mirror Stunners stun each other independently', () => {
    let state = startedWith('stunner', 'stunner');
    state.players.p1.mana = 9;
    state.players.p2.mana = 9;
    state = playTurn(state, 'attack', 'attack');
    expect(state.players.p1.attackCost).toBe(2);
    expect(state.players.p2.attackCost).toBe(2);
    expect(state.stunnedPlayers).toEqual(['p2', 'p1']);
  });

  test('stacks Lucky survival with Stunner feedback and clears stale feedback next reveal', () => {
    let state = startedWith('lucky', 'stunner');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' });
    state = attackBlockManaRules.resolve(state, 'p2', { type: 'choose-move', move: 'attack' }, { ...context, random: () => 0 }).state;
    expect(state).toMatchObject({ phase: 'idle', luckyProcPlayer: 'p1', stunnedPlayers: ['p1'] });
    expect(state.players.p1.attackCost).toBe(2);
    state = playTurn(state, 'block', 'mana');
    expect(state.stunnedPlayers).toBeUndefined();
  });

  test('caps ordinary, Advantaged, forced, and stolen Mana at 9', () => {
    let ordinary = startedWith('lucky', 'lucky');
    ordinary.players.p1.mana = 9;
    ordinary = playTurn(ordinary, 'mana', 'block');
    expect(ordinary.players.p1.mana).toBe(9);

    let advantaged = startedWith('advantaged', 'lucky');
    advantaged.players.p1.mana = 8;
    advantaged = playTurn(advantaged, 'mana', 'block');
    expect(advantaged.players.p1.mana).toBe(9);

    let forced = startedWith('advantaged', 'lucky');
    forced.players.p1.mana = 0; forced.players.p2.mana = 0;
    forced = playTurn(forced, 'mana', 'mana');
    expect(forced.players.p1.mana).toBe(2);

    let thief = thiefTurnFive();
    thief.players.p1.mana = 9; thief.players.p2.mana = 2;
    thief = send(thief, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' });
    thief = send(thief, 'p2', { type: 'choose-move', move: 'block' });
    expect(thief.players.p1.mana).toBe(9);
    expect(thief.players.p2.mana).toBe(1);
  });

  test('keeps Steal unavailable through Turn 4 and private when armed on Turn 5', () => {
    let state = thiefTurnFive();
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('steal');
    const waiting = attackBlockManaRules.resolve(state, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' }, context).state;
    expect(attackBlockManaRules.project(waiting, 'p1').ownPendingAbility).toBe('steal');
    expect(attackBlockManaRules.project(waiting, 'p2').ownPendingAbility).toBeUndefined();
    expect(waiting.players.p1.abilityUses?.steal).toBe(0);

    state = startedWith('thief', 'lucky');
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('steal');
    expect(() => send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' })).toThrow('unavailable');
  });

  test('transfers Mana after moves and spends Thief Steal', () => {
    let state = thiefTurnFive();
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    expect(state.players.p1).toMatchObject({ mana: 2, abilityUses: { steal: 0 } });
    expect(state.players.p2.mana).toBe(1);
    expect(state).toMatchObject({ thiefAttemptPlayers: ['p1'], thiefTransferPlayer: 'p1' });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('steal');
  });

  test('spends Steal without transfer when target reaches zero', () => {
    let state = thiefTurnFive();
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' });
    state = send(state, 'p2', { type: 'choose-move', move: 'attack' });
    expect(state.players.p1.abilityUses?.steal).toBe(0);
    expect(state.players.p2.mana).toBe(0);
    expect(state.thiefAttemptPlayers).toEqual(['p1']);
    expect(state.thiefTransferPlayer).toBeUndefined();
  });

  test('cancels simultaneous Steals and spends both charges', () => {
    let state = thiefTurnFive('thief');
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' });
    state = send(state, 'p2', { type: 'choose-move', move: 'block', ability: 'steal' });
    expect(state.players.p1).toMatchObject({ mana: 1, abilityUses: { steal: 0 } });
    expect(state.players.p2).toMatchObject({ mana: 1, abilityUses: { steal: 0 } });
    expect(state.thiefAttemptPlayers).toEqual(['p1', 'p2']);
    expect(state.thiefTransferPlayer).toBeUndefined();
  });

  test('spends but skips Steal after an Attack-Mana round loss', () => {
    let state = thiefTurnFive();
    state.players.p2.mana = 2;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', ability: 'steal' });
    state = send(state, 'p2', { type: 'choose-move', move: 'attack' });
    expect(state).toMatchObject({ phase: 'counter-picking', score: { p1: 0, p2: 1 } });
    expect(state.thiefTransferPlayer).toBeUndefined();
    expect(state.players.p1.mana).toBe(1);
    expect(state.players.p2.mana).toBe(1);
  });

  test('allows Steal on a forced Mana turn and restores its charge next round', () => {
    let state = thiefTurnFive();
    state.players.p1.mana = 0; state.players.p2.mana = 0;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', ability: 'steal' });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    expect(state.players.p1.mana).toBe(2);
    expect(state.players.p2.mana).toBe(0);

    state.players.p2.mana = 1;
    state = send(state, 'p1', { type: 'choose-move', move: 'attack' });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    state = send(state, 'p2', { type: 'lock-class', classId: 'thief' }, state.counterPickAvailableAt);
    expect(state.players.p1.abilityUses?.steal).toBe(1);
    expect(state.players.p2.abilityUses?.steal).toBe(1);
  });

  test('resolves an armed Steal after timeout resources without showing turn feedback', () => {
    let state = thiefTurnFive();
    state.players.p2.mana = 2;
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', ability: 'steal' }, 2_000);
    const resolution = attackBlockManaRules.advanceDeadline!(state, { ...context, now: state.waitingDeadlineAt! })!;
    expect(resolution.state.players.p1).toMatchObject({ mana: 3, abilityUses: { steal: 0 } });
    expect(resolution.state.players.p2.mana).toBe(0);
    expect(resolution.state.thiefAttemptPlayers).toBeUndefined();
    expect(resolution.state.thiefTransferPlayer).toBeUndefined();
    expect(resolution.events?.[0]?.payload).toMatchObject({ thiefAttemptPlayers: ['p1'], thiefTransferPlayer: 'p1' });
  });

  test('holds Thief feedback through selection and clears it on the next reveal', () => {
    let state = thiefTurnFive();
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' });
    state = send(state, 'p2', { type: 'choose-move', move: 'mana' });
    state = send(state, 'p1', { type: 'choose-move', move: 'mana' }, 2_000);
    expect(state.thiefAttemptPlayers).toEqual(['p1']);
    state = send(state, 'p2', { type: 'choose-move', move: 'block' }, 2_100);
    expect(state.thiefAttemptPlayers).toBeUndefined();
    expect(state.thiefTransferPlayer).toBeUndefined();
  });

  test('offers Collect only to a funded Taxman and spends its generic charge on commitment', () => {
    let state = startedWith('taxman', 'lucky');
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('collect');
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'collect' });
    expect(state.players.p1.abilityUses?.collect).toBe(2);
    expect(attackBlockManaRules.project(state, 'p1').ownPendingAbility).toBe('collect');
    expect(attackBlockManaRules.project(state, 'p2').ownPendingAbility).toBeUndefined();

    let empty = startedWith('taxman', 'lucky');
    empty.players.p1.mana = 0;
    expect(attackBlockManaRules.project(empty, 'p1').legalActions).not.toContain('collect');
    expect(() => send(empty, 'p1', { type: 'choose-move', move: 'block', ability: 'collect' })).toThrow('unavailable');
  });

  test('resolves single and dual Collect in player order and records actual Mana losses', () => {
    let single = startedWith('taxman', 'lucky');
    single.players.p1.mana = 2; single.players.p2.mana = 1;
    single = send(single, 'p1', { type: 'choose-move', move: 'block', ability: 'collect' });
    single = send(single, 'p2', { type: 'choose-move', move: 'block' });
    expect(single.players.p1).toMatchObject({ mana: 1, abilityUses: { collect: 2 } });
    expect(single.players.p2.mana).toBe(0);
    expect(single.taxmanCollectPlayers).toEqual(['p1']);

    let dual = startedWith('taxman', 'taxman');
    dual.players.p1.mana = 3; dual.players.p2.mana = 3;
    dual = send(dual, 'p1', { type: 'choose-move', move: 'block', ability: 'collect' });
    dual = send(dual, 'p2', { type: 'choose-move', move: 'block', ability: 'collect' });
    expect(dual.players.p1.mana).toBe(1);
    expect(dual.players.p2.mana).toBe(1);
    expect(dual.taxmanCollectPlayers).toEqual(['p1', 'p2']);
  });

  test('runs Collect before Steal and can create the forced 0-0 state', () => {
    let ordered = thiefTurnFive('taxman');
    ordered.players.p1.mana = 1; ordered.players.p2.mana = 1;
    ordered = send(ordered, 'p1', { type: 'choose-move', move: 'block', ability: 'steal' });
    ordered = send(ordered, 'p2', { type: 'choose-move', move: 'block', ability: 'collect' });
    expect(ordered.players).toMatchObject({ p1: { mana: 0 }, p2: { mana: 0 } });
    expect(ordered.thiefTransferPlayer).toBeUndefined();
    expect(attackBlockManaRules.project(ordered, 'p1').legalActions).toEqual(['mana']);
    ordered = send(ordered, 'p1', { type: 'choose-move', move: 'mana' });
    ordered = send(ordered, 'p2', { type: 'choose-move', move: 'mana' });
    expect(ordered.players).toMatchObject({ p1: { mana: 1 }, p2: { mana: 1 } });
  });

  test('skips Collect effects on lethal and timeout losses', () => {
    let lethal = startedWith('taxman', 'lucky');
    lethal.players.p1.mana = 2; lethal.players.p2.mana = 2;
    lethal = send(lethal, 'p1', { type: 'choose-move', move: 'mana', ability: 'collect' });
    lethal = send(lethal, 'p2', { type: 'choose-move', move: 'attack' });
    expect(lethal.taxmanCollectPlayers).toBeUndefined();

    let timeout = startedWith('taxman', 'lucky');
    timeout.players.p1.mana = 2; timeout.players.p2.mana = 2;
    timeout = send(timeout, 'p1', { type: 'choose-move', move: 'attack', ability: 'collect' }, 2_000);
    const resolved = attackBlockManaRules.advanceDeadline!(timeout, { ...context, now: timeout.waitingDeadlineAt! })!.state;
    expect(resolved.taxmanCollectPlayers).toBeUndefined();
  });

  test('reads legacy stealUsed state through the generic ability counter', () => {
    const state = thiefTurnFive();
    state.players.p1.abilityUses = undefined;
    state.players.p1.stealUsed = true;
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('steal');
  });

  test('offers one free Parry and spends it when armed with a normal move', () => {
    let state = startedWith('parrymaster', 'lucky');
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('parry');
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'parry' });
    expect(state.players.p1.abilityUses?.parry).toBe(0);
    expect(attackBlockManaRules.project(state, 'p1')).toMatchObject({ ownPendingMove: 'block', ownPendingAbility: 'parry' });
  });

  test('Parry removes 2 Mana after ordinary Attack cost and floors at zero', () => {
    let state = startedWith('parrymaster', 'lucky');
    state.players.p2.mana = 4;
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'parry' });
    state = send(state, 'p2', { type: 'choose-move', move: 'attack' });
    expect(state.players.p2.mana).toBe(1);
    expect(state.parriedPlayers).toEqual(['p2']);
    expect(attackBlockManaRules.project(state, 'p1').parriedPlayers).toEqual(['p2']);

    let floor = startedWith('parrymaster', 'lucky');
    floor = send(floor, 'p1', { type: 'choose-move', move: 'block', ability: 'parry' });
    floor = send(floor, 'p2', { type: 'choose-move', move: 'attack' });
    expect(floor.players.p2.mana).toBe(0);
  });

  test('supports failed and dual Parries and clears feedback on the next reveal', () => {
    let failed = startedWith('parrymaster', 'lucky');
    failed = send(failed, 'p1', { type: 'choose-move', move: 'block', ability: 'parry' });
    failed = send(failed, 'p2', { type: 'choose-move', move: 'mana' });
    expect(failed.parriedPlayers).toBeUndefined();
    expect(failed.players.p1.abilityUses?.parry).toBe(0);

    let dual = startedWith('parrymaster', 'parrymaster');
    dual.players.p1.mana = 4; dual.players.p2.mana = 4;
    dual = send(dual, 'p1', { type: 'choose-move', move: 'attack', ability: 'parry' });
    dual = send(dual, 'p2', { type: 'choose-move', move: 'attack', ability: 'parry' });
    expect(dual.players).toMatchObject({ p1: { mana: 1 }, p2: { mana: 1 } });
    expect(dual.parriedPlayers).toEqual(['p2', 'p1']);
    dual = send(dual, 'p1', { type: 'choose-move', move: 'mana' });
    dual = send(dual, 'p2', { type: 'choose-move', move: 'mana' });
    expect(dual.parriedPlayers).toBeUndefined();
  });

  test('skips Parry on lethal resolution and resolves it before Collect and Steal', () => {
    let lethal = startedWith('parrymaster', 'lucky');
    lethal.score.p2 = 2;
    lethal.players.p2.mana = 4;
    lethal = send(lethal, 'p1', { type: 'choose-move', move: 'mana', ability: 'parry' });
    lethal = send(lethal, 'p2', { type: 'choose-move', move: 'attack' });
    expect(lethal).toMatchObject({ phase: 'match-complete', players: { p2: { mana: 3 } } });
    expect(lethal.parriedPlayers).toBeUndefined();

    let timeout = startedWith('parrymaster', 'lucky');
    timeout.score.p1 = 2;
    timeout.players.p1.mana = 2;
    timeout = send(timeout, 'p1', { type: 'choose-move', move: 'attack', ability: 'parry' }, 2_000);
    timeout = attackBlockManaRules.advanceDeadline!(timeout, { ...context, now: timeout.waitingDeadlineAt! })!.state;
    expect(timeout).toMatchObject({ phase: 'match-complete', players: { p1: { mana: 1, abilityUses: { parry: 0 } } } });
    expect(timeout.parriedPlayers).toBeUndefined();

    let steal = startedWith('thief', 'parrymaster');
    steal.turn = 5; steal.players.p1.mana = 3;
    steal = send(steal, 'p1', { type: 'choose-move', move: 'attack', ability: 'steal' });
    steal = send(steal, 'p2', { type: 'choose-move', move: 'block', ability: 'parry' });
    expect(steal.players.p1.mana).toBe(1);
    expect(steal.thiefTransferPlayer).toBe('p1');
    expect(steal.parriedPlayers).toEqual(['p1']);

    let collect = startedWith('taxman', 'parrymaster');
    collect.players.p1.mana = 4; collect.players.p2.mana = 2;
    collect = send(collect, 'p1', { type: 'choose-move', move: 'attack', ability: 'collect' });
    collect = send(collect, 'p2', { type: 'choose-move', move: 'block', ability: 'parry' });
    expect(collect.players).toMatchObject({ p1: { mana: 0 }, p2: { mana: 1 } });
    expect(collect.parriedPlayers).toEqual(['p1']);
    expect(collect.taxmanCollectPlayers).toEqual(['p1']);
  });

  test('arms Flame with a move, spends its Mana and charge, then installs a five-turn shield', () => {
    let state = startedWith('fireborne', 'lucky');
    expect(state.players.p1).toMatchObject({ mana: 1, blocks: 5, abilityUses: { flame: 1 } });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).toContain('flame');
    state = send(state, 'p1', { type: 'choose-move', move: 'block', ability: 'flame' });
    expect(state.players.p1).toMatchObject({ mana: 0, abilityUses: { flame: 0 } });
    expect(attackBlockManaRules.project(state, 'p1').ownPendingAbility).toBe('flame');
    state = send(state, 'p2', { type: 'choose-move', move: 'block' });
    expect(state.players.p1).toMatchObject({ fireShieldTurns: 5, abilityUses: { flame: 0 } });
    expect(attackBlockManaRules.project(state, 'p1').legalActions).not.toContain('flame');

    const empty = startedWith('fireborne', 'lucky');
    empty.players.p1.mana = 0;
    expect(attackBlockManaRules.project(empty, 'p1').legalActions).not.toContain('flame');
    expect(() => send(empty, 'p1', { type: 'choose-move', move: 'block', ability: 'flame' })).toThrow('requires 1 Mana');
  });

  test('pops Flame back up and submits Attack when there is not enough Mana for both', () => {
    let state = startedWith('fireborne', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'attack', ability: 'flame' });
    expect(state).toMatchObject({
      phase: 'waiting', pendingMoves: { p1: 'attack' },
      players: { p1: { mana: 1, abilityUses: { flame: 1 } } },
    });
    expect(state.pendingAbilities?.p1).toBeUndefined();
    expect(attackBlockManaRules.project(state, 'p1').ownPendingAbility).toBeUndefined();

    state = send(state, 'p2', { type: 'choose-move', move: 'block' });
    expect(state.players.p1).toMatchObject({ mana: 0, abilityUses: { flame: 1 } });
    expect(state.players.p1.fireShieldTurns ?? 0).toBe(0);
  });

  test('does not protect Fireborne on the Flame activation turn', () => {
    let state = startedWith('fireborne', 'lucky');
    state = send(state, 'p1', { type: 'choose-move', move: 'mana', ability: 'flame' });
    state = send(state, 'p2', { type: 'choose-move', move: 'attack' });
    expect(state).toMatchObject({ phase: 'counter-picking', score: { p1: 0, p2: 1 } });
    expect(state.fireborneProcPlayer).toBeUndefined();
    expect(state.players.p1.fireShieldTurns ?? 0).toBe(0);
  });

  test.each([
    ['p1', 'mana', 'attack'],
    ['p2', 'attack', 'mana'],
  ] as const)('lets %s Fireborne consume an existing shield against Attack versus Mana', (fireborne, p1Move, p2Move) => {
    let state = startedWith(fireborne === 'p1' ? 'fireborne' : 'lucky', fireborne === 'p2' ? 'fireborne' : 'lucky');
    state.players[fireborne].fireShieldTurns = 5;
    state = playTurn(state, p1Move, p2Move);
    expect(state).toMatchObject({ phase: 'idle', turn: 2, score: { p1: 0, p2: 0 }, fireborneProcPlayer: fireborne });
    expect(state.players[fireborne].fireShieldTurns).toBe(0);
    expect(attackBlockManaRules.project(state, fireborne).fireborneProcPlayer).toBe(fireborne);
  });

  test('decrements Fireborne shield through ordinary and forced Mana turns, then expires', () => {
    let state = startedWith('fireborne', 'lucky');
    state.players.p1.fireShieldTurns = 5;
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.fireShieldTurns).toBe(4);
    state.players.p1.mana = 0; state.players.p2.mana = 0;
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.fireShieldTurns).toBe(3);
    state = playTurn(state, 'mana', 'mana');
    state = playTurn(state, 'mana', 'mana');
    state = playTurn(state, 'mana', 'mana');
    expect(state.players.p1.fireShieldTurns).toBe(0);
  });

  test('saves a first Attack timeout but never prevents a second-strike forfeit', () => {
    let saved = startedWith('lucky', 'fireborne');
    saved.players.p2.fireShieldTurns = 5;
    saved = send(saved, 'p1', { type: 'choose-move', move: 'attack' }, 2_000);
    saved = attackBlockManaRules.advanceDeadline!(saved, { ...context, now: saved.waitingDeadlineAt! })!.state;
    expect(saved).toMatchObject({ phase: 'idle', fireborneProcPlayer: 'p2', players: { p2: { strikes: 1, fireShieldTurns: 0 } } });

    let forfeited = startedWith('lucky', 'fireborne');
    forfeited.players.p2.fireShieldTurns = 5;
    forfeited.players.p2.strikes = 1;
    forfeited = send(forfeited, 'p1', { type: 'choose-move', move: 'attack' }, 2_000);
    forfeited = attackBlockManaRules.advanceDeadline!(forfeited, { ...context, now: forfeited.waitingDeadlineAt! })!.state;
    expect(forfeited).toMatchObject({ phase: 'match-complete', winner: 'p1', resultReason: 'forfeit' });
    expect(forfeited.fireborneProcPlayer).toBeUndefined();
  });

  test('clears Fireborne shield and restores Flame when a new round begins', () => {
    let state = startedWith('fireborne', 'lucky');
    state.players.p1.fireShieldTurns = 0;
    state.players.p1.abilityUses = { flame: 0 };
    state = playTurn(state, 'mana', 'attack');
    expect(state).toMatchObject({ phase: 'counter-picking', players: { p1: { fireShieldTurns: 0, abilityUses: { flame: 1 } } } });
    state = send(state, 'p1', { type: 'lock-class', classId: 'fireborne' }, state.counterPickAvailableAt);
    expect(state.players.p1).toMatchObject({ classId: 'fireborne', abilityUses: { flame: 1 } });
    expect(state.players.p1.fireShieldTurns ?? 0).toBe(0);
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
