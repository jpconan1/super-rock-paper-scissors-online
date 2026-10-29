import { describe, expect, test } from 'vitest';
import { progressRewardDestination, shouldShowClassRewards } from '../src/app/appController';
import { createProgressAward } from '../src/core/progression';

describe('progress reward routing', () => {
  const levelUp = createProgressAward(0, 'win', { opponent: 'human' });

  test('shows class rewards before first prestige', () => {
    expect(levelUp.unlockedClassIds.length).toBeGreaterThan(0);
    expect(shouldShowClassRewards(levelUp, 0)).toBe(true);
  });

  test('skips repeated class rewards after prestige', () => {
    expect(shouldShowClassRewards(levelUp, 1)).toBe(false);
  });

  test('routes only completed prestige into the prestige reward screen', () => {
    expect(progressRewardDestination({ ...levelUp, prestige: { state: 'completed', prestigeCount: 4 } }, 4)).toBe('prestige');
    expect(progressRewardDestination({ ...levelUp, unlockedClassIds: [], prestige: { state: 'pending' } }, 0)).toBe('lobby');
    expect(progressRewardDestination(levelUp, 0)).toBe('reward');
  });
});
