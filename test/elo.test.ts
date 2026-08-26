import { describe, expect, test } from 'vitest';
import { eloDeltas } from '../src/core/elo';

describe('Elo', () => {
  test('moves equal ratings symmetrically by sixteen', () => {
    expect(eloDeltas(1500, 1500, 'p1')).toEqual({ p1: 16, p2: -16 });
  });

  test('awards an underdog more than a favorite', () => {
    expect(eloDeltas(1200, 1800, 'p1')).toEqual({ p1: 31, p2: -31 });
    expect(eloDeltas(1800, 1200, 'p1')).toEqual({ p1: 1, p2: -1 });
  });
});
