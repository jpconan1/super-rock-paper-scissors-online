import { describe, expect, test } from 'vitest';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { LabMatch, opponentActions } from '../src/matchupLab/labMatch';

describe('matchup lab match', () => {
  test('starts any chosen pair in fresh playable production state', () => {
    const projections: AbmProjection[] = [];
    const match = new LabMatch({ yours: 'investor', opponent: 'gambler', publish: (projection) => projections.push(projection), now: () => 1_000 });
    expect(projections.at(-1)).toMatchObject({ phase: 'idle', round: 1, turn: 1, score: { p1: 0, p2: 0 }, players: {
      p1: { classId: 'investor', mana: 5, blocks: 5 }, p2: { classId: 'gambler', mana: 1, blocks: 3 },
    } });
    match.destroy();
  });

  test('accepts human and opponent commands then resets the same pair after a round', () => {
    const projections: AbmProjection[] = []; let reset!: () => void;
    const match = new LabMatch({ yours: 'advantaged', opponent: 'thief', publish: (projection) => projections.push(projection), now: () => 1_000,
      random: () => .5, setTimer: (run) => { reset = run; return 1 as unknown as ReturnType<typeof setTimeout>; }, clearTimer: () => {} });
    match.sendHuman({ type: 'choose-move', move: 'attack' });
    expect(projections.at(-1)).toMatchObject({ phase: 'waiting', ownPendingMove: 'attack' });
    match.sendOpponent({ type: 'choose-move', move: 'mana' });
    expect(projections.at(-1)).toMatchObject({ phase: 'counter-picking', lastRoundWinner: 'p1' });
    reset();
    expect(projections.at(-1)).toMatchObject({ phase: 'idle', round: 1, turn: 1, score: { p1: 0, p2: 0 }, players: {
      p1: { classId: 'advantaged' }, p2: { classId: 'thief' },
    } });
    match.destroy();
  });
});

describe('opponent actions', () => {
  const projection = (classId: 'fireborne' | 'conjurer' | 'null', legalActions: AbmProjection['legalActions']): AbmProjection => ({
    self: 'p2', phase: classId === 'conjurer' && !legalActions.includes('conjure') ? 'conjurer-choosing' : 'idle', turn: 5, round: 1,
    score: { p1: 0, p2: 0 }, players: { p1: { classId: 'lucky', mana: 2, blocks: 5, strikes: 0 }, p2: { classId, mana: 2, blocks: 5, strikes: 0 } },
    opponentReady: false, legalActions,
  });

  test('offers only legal plain moves and move-plus-ability commands', () => {
    const actions = opponentActions(projection('fireborne', ['block', 'mana', 'flame']));
    expect(actions.map(({ label }) => label)).toEqual(['Block', 'Mana', 'Flame + Block', 'Flame + Mana']);
    expect(actions.at(-1)?.command).toEqual({ type: 'choose-move', move: 'mana', ability: 'flame' });
  });

  test('offers Conjure, its follow-up moves, and standalone Reset', () => {
    expect(opponentActions(projection('conjurer', ['attack', 'block', 'mana', 'conjure'])).at(-1)).toMatchObject({ label: 'Conjure', command: { type: 'activate-ability', ability: 'conjure' } });
    expect(opponentActions(projection('conjurer', ['block', 'mana'])).map(({ label }) => label)).toEqual(['Block', 'Mana']);
    expect(opponentActions(projection('null', ['mana', 'reset'])).at(-1)).toMatchObject({ label: 'Reset', command: { type: 'activate-ability', ability: 'reset' } });
  });
});
