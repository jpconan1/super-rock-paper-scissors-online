import { describe, expect, test } from 'vitest';
import { dummyRules } from '../src/variants/dummy/dummyRules';

function context(seed: number) {
  let value = seed >>> 0;
  return { now: 100, random: () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000) };
}

describe('dummy rules', () => {
  test('hides the opponent move and reports one consistent 0-5 result', () => {
    const first = dummyRules.resolve(dummyRules.initialize(context(1)), 'p1', 'charge', context(2)).state;
    expect(dummyRules.project(first, 'p2').ownMove).toBeUndefined();
    expect(dummyRules.project(first, 'p2').ready.p1).toBe(true);
    const complete = dummyRules.resolve(first, 'p2', 'block', context(3)).state;
    const result = dummyRules.result(complete)!;
    expect(result.scores[result.winner]).toBeGreaterThan(result.scores[result.winner === 'p1' ? 'p2' : 'p1']);
    expect(result.scores.p1).toBeGreaterThanOrEqual(0);
    expect(result.scores.p2).toBeLessThanOrEqual(5);
    expect(() => dummyRules.resolve(complete, 'p1', 'fireball', context(4))).toThrow('complete');
  });

  test('is deterministic for the same random context', () => {
    const run = () => {
      const first = dummyRules.resolve(dummyRules.initialize(context(1)), 'p1', 'charge', context(2)).state;
      return dummyRules.resolve(first, 'p2', 'block', context(9)).state;
    };
    expect(run()).toEqual(run());
  });
});
