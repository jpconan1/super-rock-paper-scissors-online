import { describe, expect, test } from 'vitest';
import { createProgressAward, createTutorialProgressAward } from '../src/core/progression';
import { XP_COPY_BEATS, xpCopySteps, xpGainPercent } from '../src/app/xpProgressBar';

describe('post-match XP copy', () => {
  test('labels the first tutorial reward during the XP climb', () => {
    expect(xpCopySteps(createTutorialProgressAward(0, 'loss', true))).toEqual([
      { text: 'First Time Tutorial Bonus: +100%', color: '#181818' },
      { text: 'Total: +100%', color: '#181818' },
    ]);
  });
  test('splits a player win without changing its award', () => {
    const award = createProgressAward(0, 'win', { opponent: 'human', newestClassRoundWins: 2 });
    expect(xpCopySteps(award)).toEqual([
      { text: 'VS Player: +50%', color: '#181818' },
      { text: 'Class Bonus: +50%', color: '#2A5733' },
      { text: 'Win Bonus: +50%', color: '#AC3235' },
      { text: 'Total: +150%', color: '#181818' },
    ]);
    expect(award.gainedProgressUnits).toBe(15_000);
  });

  test('shows computer loss and capped win amounts', () => {
    expect(xpCopySteps(createProgressAward(0, 'loss', { opponent: 'computer' }))).toEqual([
      { text: 'VS Computer: +50%', color: '#181818' },
      { text: 'Total: +50%', color: '#181818' },
    ]);
    expect(xpCopySteps(createProgressAward(199_000, 'win', { opponent: 'human', newestClassRoundWins: 2 }))).toEqual([
      { text: 'VS Player: +7.5%', color: '#181818' },
      { text: 'Win Bonus: +2.5%', color: '#AC3235' },
      { text: 'Total: +10%', color: '#181818' },
    ]);
  });

  test('uses one persistent test-mode message', () => {
    expect(XP_COPY_BEATS).toBe(2);
    expect(xpCopySteps(createProgressAward(0, 'loss', { opponent: 'human', paused: true }))).toEqual([
      { text: 'Test Mode: +0 XP. Re-lock classes to earn XP!', color: '#821B92' },
    ]);
  });

  test('keeps precision for small gains', () => {
    expect(xpGainPercent(4_200)).toBe('42%');
    expect(xpGainPercent(75)).toBe('0.75%');
    expect(xpGainPercent(1)).toBe('0.01%');
  });
});
