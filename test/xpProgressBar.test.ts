import { describe, expect, test } from 'vitest';
import { createProgressAward } from '../src/core/progression';
import { XP_COPY_BEATS, xpCopySteps } from '../src/app/xpProgressBar';

describe('post-match XP copy', () => {
  test('splits a player win without changing its award', () => {
    const award = createProgressAward(0, 'win', { opponent: 'human', newestClassRoundWins: 2 });
    expect(xpCopySteps(award)).toEqual([
      { text: 'VS Player: +5,000', color: '#181818' },
      { text: 'Class Bonus: +5,000', color: '#2A5733' },
      { text: 'Win Bonus: +5,000', color: '#AC3235' },
      { text: 'Total: +15,000', color: '#181818' },
    ]);
    expect(award.gainedProgressUnits).toBe(15_000);
  });

  test('shows computer loss and capped win amounts', () => {
    expect(xpCopySteps(createProgressAward(0, 'loss', { opponent: 'computer' }))).toEqual([
      { text: 'VS Computer: +5,000', color: '#181818' },
      { text: 'Total: +5,000', color: '#181818' },
    ]);
    expect(xpCopySteps(createProgressAward(199_000, 'win', { opponent: 'human', newestClassRoundWins: 2 }))).toEqual([
      { text: 'VS Player: +750', color: '#181818' },
      { text: 'Win Bonus: +250', color: '#AC3235' },
      { text: 'Total: +1,000', color: '#181818' },
    ]);
  });

  test('uses one persistent test-mode message', () => {
    expect(XP_COPY_BEATS).toBe(2);
    expect(xpCopySteps(createProgressAward(0, 'loss', { opponent: 'human', paused: true }))).toEqual([
      { text: 'Test Mode: +0 XP. Re-lock classes to earn XP!', color: '#821B92' },
    ]);
  });
});
