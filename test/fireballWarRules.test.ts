import { describe, expect, test } from 'vitest';
import {
  createFireballWarState,
  getLegalFireballMoves,
  resolveFireballWarTurn,
} from '../src/variants/fireballWar/rules';

describe('Fireball War rules', () => {
  test('starts both players with one charge and all moves legal', () => {
    const state = createFireballWarState();
    expect(state.resources).toEqual({ p1: 1, p2: 1 });
    expect(getLegalFireballMoves(state, 'p1')).toEqual(['charge', 'block', 'fireball']);
  });

  test('fireball beats charge and spends one charge', () => {
    const result = resolveFireballWarTurn(createFireballWarState(), {
      p1: 'fireball',
      p2: 'charge',
    });
    expect(result.hit).toBe('p1');
    expect(result.state.winner).toBe('p1');
    expect(result.state.resources).toEqual({ p1: 0, p2: 2 });
  });

  test('reaching three charge wins unless both players reach it together', () => {
    const nearlyFull = { turn: 2, resources: { p1: 2, p2: 1 }, winner: null } as const;
    expect(resolveFireballWarTurn(nearlyFull, { p1: 'charge', p2: 'block' }).state.winner).toBe('p1');

    const tied = { turn: 2, resources: { p1: 2, p2: 2 }, winner: null } as const;
    const result = resolveFireballWarTurn(tied, { p1: 'charge', p2: 'charge' });
    expect(result.state.winner).toBeNull();
    expect(result.state.resources).toEqual({ p1: 2, p2: 2 });
  });

  test('rejects resource-illegal choices', () => {
    const empty = { turn: 2, resources: { p1: 0, p2: 0 }, winner: null } as const;
    expect(getLegalFireballMoves(empty, 'p1')).toEqual(['charge']);
    expect(() => resolveFireballWarTurn(empty, { p1: 'fireball', p2: 'charge' })).toThrow(/cannot play/);
  });
});
