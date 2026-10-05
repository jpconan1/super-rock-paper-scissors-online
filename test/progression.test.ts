import { describe, expect, test } from 'vitest';
import {
  countNewestClassRoundWins, createNextLevelProgressAward, createProgressAward, createTokenProgressAward, createTutorialProgressAward, HUMAN_WIN_PROGRESS_BY_LEVEL, isClassUnlocked, MAX_PROGRESS_UNITS, progressGainForLevel, progressionForTotal,
} from '../src/core/progression';
import { ABM_CLASS_IDS } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { XP_BAR_CLIMB_MS, XP_BAR_DING_HOLD_MS, xpAnimationSegment, xpAnimationStops } from '../src/app/xpProgressBar';

describe('progression', () => {
  test('starts at level one with Lucky and ends at level 21 with Joe', () => {
    expect(progressionForTotal(0)).toMatchObject({ level: 1, progressUnitsInLevel: 0, unlockedClassIds: ['lucky'], nextUnlock: 'advantaged' });
    expect(progressionForTotal(MAX_PROGRESS_UNITS)).toMatchObject({ level: 21, progressUnitsInLevel: 10_000, unlockedClassIds: ABM_CLASS_IDS });
  });

  test('uses the explicit linear reward table and derives losses and computer awards', () => {
    expect(HUMAN_WIN_PROGRESS_BY_LEVEL).toEqual([
      10_000, 9_500, 9_000, 8_500, 8_000, 7_500, 7_000, 6_500, 6_000, 5_500,
      5_000, 4_500, 4_000, 3_500, 3_000, 2_500, 2_000, 1_500, 1_000, 500,
    ]);
    for (const [index, humanWin] of HUMAN_WIN_PROGRESS_BY_LEVEL.entries()) {
      const level = index + 1;
      const humanLoss = Math.round(humanWin / 2);
      expect(progressGainForLevel(level, 'win', 'human')).toBe(humanWin);
      expect(progressGainForLevel(level, 'loss', 'human')).toBe(humanLoss);
      expect(progressGainForLevel(level, 'win', 'computer')).toBe(Math.round(humanWin / 10));
      expect(progressGainForLevel(level, 'loss', 'computer')).toBe(Math.round(humanLoss / 10));
    }
    expect(progressGainForLevel(21, 'win')).toBe(0);
  });

  test('preserves overflow and reports every crossed unlock', () => {
    const award = createProgressAward(9_000, 'win', { opponent: 'human' });
    expect(award.after).toMatchObject({ level: 2, totalProgressUnits: 19_000, progressUnitsInLevel: 9_000 });
    expect(award.unlockedClassIds).toEqual(['advantaged']);
  });

  test('caps gains at level 21', () => {
    const award = createProgressAward(199_500, 'win', { opponent: 'human', newestClassRoundWins: 2 });
    expect(award).toMatchObject({ gainedProgressUnits: 500, baseProgressUnits: 500, bonusProgressUnits: 0 });
    expect(award.after.totalProgressUnits).toBe(MAX_PROGRESS_UNITS);
    expect(createProgressAward(MAX_PROGRESS_UNITS, 'loss', { opponent: 'human' }).gainedProgressUnits).toBe(0);
  });

  test('pauses awards without changing existing progression', () => {
    const award = createProgressAward(24_000, 'win', { opponent: 'human', paused: true });
    expect(award).toMatchObject({ gainedProgressUnits: 0, unlockedClassIds: [], before: { totalProgressUnits: 24_000 }, after: { totalProgressUnits: 24_000 } });
  });

  test('applies table opponent and outcome rates', () => {
    expect(createProgressAward(0, 'loss', { opponent: 'computer' }).baseProgressUnits).toBe(500);
    expect(createProgressAward(0, 'win', { opponent: 'computer' }).baseProgressUnits).toBe(1_000);
    expect(createProgressAward(0, 'loss', { opponent: 'human' }).baseProgressUnits).toBe(5_000);
    expect(createProgressAward(0, 'win', { opponent: 'human' }).baseProgressUnits).toBe(10_000);
    expect(createProgressAward(90_000, 'win', { opponent: 'human' }).baseProgressUnits).toBe(5_500);
    expect(createProgressAward(190_000, 'loss', { opponent: 'computer' }).baseProgressUnits).toBe(25);
    expect(createProgressAward(190_000, 'win', { opponent: 'human' }).baseProgressUnits).toBe(500);
  });

  test('gives losses exactly half the equal-level win base before class bonuses', () => {
    for (const totalProgressUnits of [0, 90_000, 190_000]) {
      for (const opponent of ['computer', 'human'] as const) {
        const win = createProgressAward(totalProgressUnits, 'win', { opponent });
        const loss = createProgressAward(totalProgressUnits, 'loss', { opponent });
        const humanWin = HUMAN_WIN_PROGRESS_BY_LEVEL[progressionForTotal(totalProgressUnits).level - 1]!;
        const expectedLoss = Math.round(humanWin / 2);
        expect(loss.baseProgressUnits).toBe(opponent === 'human' ? expectedLoss : Math.round(expectedLoss / 10));
      }
    }
  });

  test('rewards one or two newest-class round wins even on a match loss', () => {
    expect(createProgressAward(0, 'loss', { opponent: 'human', newestClassRoundWins: 1 })).toMatchObject({
      baseProgressUnits: 5_000, bonusProgressUnits: 1_250, gainedProgressUnits: 6_250, classBonusRate: 0.25,
      newestClassId: 'lucky', newestClassRoundWins: 1,
    });
    expect(createProgressAward(0, 'win', { opponent: 'human', newestClassRoundWins: 2 })).toMatchObject({
      baseProgressUnits: 10_000, bonusProgressUnits: 5_000, gainedProgressUnits: 15_000, classBonusRate: 0.5,
    });
  });

  test('counts only round wins earned with the newest unlocked class', () => {
    expect(countNewestClassRoundWins(20_000, ['lucky', 'thief'])).toBe(1);
    expect(countNewestClassRoundWins(20_000, ['thief', 'thief', 'thief'])).toBe(2);
    expect(countNewestClassRoundWins(20_000, ['lucky', 'advantaged'])).toBe(0);
  });

  test('class availability follows catalog order', () => {
    expect(isClassUnlocked(0, 'lucky')).toBe(true);
    expect(isClassUnlocked(0, 'advantaged')).toBe(false);
    expect(isClassUnlocked(10_000, 'advantaged')).toBe(true);
    expect(isClassUnlocked(MAX_PROGRESS_UNITS, 'joe')).toBe(true);
  });

  test('creates an exact one-level test award without discarding current progress', () => {
    expect(createNextLevelProgressAward(2_500)).toMatchObject({ gainedProgressUnits: 7_500, unlockedClassIds: ['advantaged'], after: { totalProgressUnits: 10_000 } });
    expect(createNextLevelProgressAward(MAX_PROGRESS_UNITS)).toBeUndefined();
  });

  test('awards a full level for a level-one tutorial and 100 XP afterward regardless of outcome', () => {
    expect(createTutorialProgressAward(0, 'loss')).toMatchObject({
      outcome: 'loss', gainedProgressUnits: 10_000, unlockedClassIds: ['advantaged'],
      after: { level: 2, totalProgressUnits: 10_000 },
    });
    expect(createTutorialProgressAward(9_500, 'win')).toMatchObject({
      outcome: 'win', gainedProgressUnits: 10_000, unlockedClassIds: ['advantaged'],
      after: { level: 2, totalProgressUnits: 19_500 },
    });
    expect(createTutorialProgressAward(10_000, 'loss')).toMatchObject({
      gainedProgressUnits: 100, unlockedClassIds: [], after: { totalProgressUnits: 10_100 },
    });
  });

  test('creates the capped one-XP award unless progression is paused or complete', () => {
    expect(createTokenProgressAward(10_000, 'win')).toMatchObject({ gainedProgressUnits: 1, after: { totalProgressUnits: 10_001 } });
    expect(createTokenProgressAward(10_000, 'loss', true)).toMatchObject({ gainedProgressUnits: 0, after: { totalProgressUnits: 10_000 } });
    expect(createTokenProgressAward(MAX_PROGRESS_UNITS, 'win')).toMatchObject({ gainedProgressUnits: 0 });
  });

  test('splits XP animation at every filled level bar', () => {
    expect(xpAnimationStops(9_000, 24_000)).toEqual([10_000, 20_000, 24_000]);
    expect(xpAnimationStops(2_000, 9_500)).toEqual([9_500]);
  });

  test('times XP animation linearly from the matching climb-sound position', () => {
    expect(XP_BAR_CLIMB_MS).toBe(2_090);
    expect(XP_BAR_DING_HOLD_MS).toBe(750);
    expect(xpAnimationSegment(0, 10_000)).toEqual({ durationMs: 2_090, offsetSeconds: 0, durationSeconds: 2.09 });
    expect(xpAnimationSegment(7_500, 10_000)).toEqual({ durationMs: 522.5, offsetSeconds: 1.5675, durationSeconds: 0.5225 });
    expect(xpAnimationSegment(10_000, 15_000)).toEqual({ durationMs: 1_045, offsetSeconds: 0, durationSeconds: 1.045 });
  });
});
