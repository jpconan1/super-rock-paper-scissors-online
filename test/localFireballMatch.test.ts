import { describe, expect, test } from 'vitest';
import { createLocalFireballMatch } from '../src/match/localFireballMatch';

describe('local Fireball War authority', () => {
  test('returns snapshots without exposing mutable authority state', async () => {
    const match = createLocalFireballMatch();
    const initial = match.getSnapshot();
    initial.state.resources.p1 = 99;

    const next = await match.submitMove('block', 0);
    expect(next.revision).toBe(1);
    expect(next.state.resources.p1).toBe(1);
    expect(next.lastMoves).toEqual({ p1: 'block', p2: 'charge' });
  });

  test('rejects stale revisions', async () => {
    const match = createLocalFireballMatch();
    await match.submitMove('charge', 0);
    await expect(match.submitMove('charge', 0)).rejects.toThrow(/no longer current/);
  });
});
