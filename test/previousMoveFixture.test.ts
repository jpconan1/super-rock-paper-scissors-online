import { describe, expect, test } from 'vitest';
import { createPreviousMoveProjection, type PreviousMoveChoice } from '../src/editor/previousMoveFixture';

describe('previous move editor fixture', () => {
  test.each(['none', 'attack', 'block', 'mana', 'skip'] as PreviousMoveChoice[])('renders %s independently for either server seat', (move) => {
    const p1 = createPreviousMoveProjection('p1', { p1: move, p2: 'none' });
    const p2 = createPreviousMoveProjection('p2', { p1: 'none', p2: move });
    expect(p1.self).toBe('p1');
    expect(p2.self).toBe('p2');
    expect(p1.players.p1.lastMove).toBe(move === 'none' ? undefined : move);
    expect(p2.players.p2.lastMove).toBe(move === 'none' ? undefined : move);
  });

  test('only supplies complete scene moves when both choices are playable moves', () => {
    expect(createPreviousMoveProjection('p1', { p1: 'attack', p2: 'block' }).lastCompleteMoves).toEqual({ p1: 'attack', p2: 'block' });
    expect(createPreviousMoveProjection('p1', { p1: 'skip', p2: 'mana' }).lastCompleteMoves).toBeUndefined();
    expect(createPreviousMoveProjection('p1', { p1: 'attack', p2: 'none' }).lastCompleteMoves).toBeUndefined();
  });

  test('uses independently selected preview classes without changing gameplay state shape', () => {
    const projection = createPreviousMoveProjection('p2', { p1: 'mana', p2: 'skip' }, { p1: 'lucky', p2: 'gambler' });
    expect(projection.players.p1.classId).toBe('lucky');
    expect(projection.players.p2.classId).toBe('gambler');
    expect(projection.players.p1.lastMove).toBe('mana');
    expect(projection.players.p2.lastMove).toBe('skip');
  });
});
