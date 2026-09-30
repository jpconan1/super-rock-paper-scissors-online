import { describe, expect, test } from 'vitest';
import {
  countNewestClassRoundWins, createNextLevelProgressAward, createProgressAward, createTutorialProgressAward, isClassUnlocked, MAX_PROGRESS_UNITS, progressGainForLevel, progressionForTotal, standardRateMultiplierForLevel,
} from '../src/core/progression';
import { ABM_CLASS_IDS } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { xpAnimationStops } from '../src/app/xpProgressBar';

describe('progression', () => {
  test('starts at level one with Lucky and ends at level 21 with Joe', () => {
    expect(progressionForTotal(0)).toMatchObject({ level: 1, progressUnitsInLevel: 0, unlockedClassIds: ['lucky'], nextUnlock: 'advantaged' });
    expect(progressionForTotal(MAX_PROGRESS_UNITS)).toMatchObject({ level: 21, progressUnitsInLevel: 10_000, unlockedClassIds: ABM_CLASS_IDS });
  });

  test('matches roadmap endpoint awards', () => {
    expect(progressGainForLevel(1, 'win')).toBe(15_000);
    expect(progressGainForLevel(1, 'loss')).toBe(7_500);
    expect(progressGainForLevel(20, 'win')).toBe(7_500);
    expect(progressGainForLevel(20, 'loss')).toBe(2_500);
  });

  test('rounds intermediate awards to the nearest unit', () => {
    expect(progressGainForLevel(2, 'win')).toBe(14_605);
    expect(progressGainForLevel(2, 'loss')).toBe(7_237);
  });

  test('preserves overflow and reports every crossed unlock', () => {
    const award = createProgressAward(9_000, 'win', { opponent: 'human' });
    expect(award.after).toMatchObject({ level: 2, totalProgressUnits: 16_500, progressUnitsInLevel: 6_500 });
    expect(award.unlockedClassIds).toEqual(['advantaged']);
  });

  test('caps gains at level 21', () => {
    const award = createProgressAward(199_000, 'win', { opponent: 'human', newestClassRoundWins: 2 });
    expect(award).toMatchObject({ gainedProgressUnits: 1_000, baseProgressUnits: 938, bonusProgressUnits: 62 });
    expect(award.after.totalProgressUnits).toBe(MAX_PROGRESS_UNITS);
    expect(createProgressAward(MAX_PROGRESS_UNITS, 'loss', { opponent: 'human' }).gainedProgressUnits).toBe(0);
  });

  test('pauses awards without changing existing progression', () => {
    const award = createProgressAward(24_000, 'win', { opponent: 'human', paused: true });
    expect(award).toMatchObject({ gainedProgressUnits: 0, unlockedClassIds: [], before: { totalProgressUnits: 24_000 }, after: { totalProgressUnits: 24_000 } });
  });

  test('scales the standard rate linearly from classic to one quarter', () => {
    expect(standardRateMultiplierForLevel(1)).toBe(1);
    expect(standardRateMultiplierForLevel(10)).toBeCloseTo(0.6447368421);
    expect(standardRateMultiplierForLevel(19)).toBeCloseTo(0.2894736842);
    expect(standardRateMultiplierForLevel(20)).toBe(0.25);
    expect(standardRateMultiplierForLevel(21)).toBe(0.25);
    const rates = Array.from({ length: 20 }, (_, index) => standardRateMultiplierForLevel(index + 1));
    expect(rates.every((rate, index) => index === 0 || rate < rates[index - 1]!)).toBe(true);
  });

  test('applies dynamic-standard opponent and outcome rates', () => {
    expect(createProgressAward(0, 'loss', { opponent: 'computer' }).baseProgressUnits).toBe(938);
    expect(createProgressAward(0, 'win', { opponent: 'computer' }).baseProgressUnits).toBe(1_875);
    expect(createProgressAward(0, 'loss', { opponent: 'human' }).baseProgressUnits).toBe(3_750);
    expect(createProgressAward(0, 'win', { opponent: 'human' }).baseProgressUnits).toBe(7_500);
    expect(createProgressAward(90_000, 'win', { opponent: 'human' }).baseProgressUnits).toBe(3_690);
    expect(createProgressAward(190_000, 'loss', { opponent: 'computer' }).baseProgressUnits).toBe(117);
    expect(createProgressAward(190_000, 'win', { opponent: 'human' }).baseProgressUnits).toBe(938);
  });

  test('gives losses exactly half the equal-level win base before class bonuses', () => {
    for (const totalProgressUnits of [0, 90_000, 190_000]) {
      for (const opponent of ['computer', 'human'] as const) {
        const win = createProgressAward(totalProgressUnits, 'win', { opponent });
        const loss = createProgressAward(totalProgressUnits, 'loss', { opponent });
        expect(loss.baseProgressUnits).toBe(Math.round(win.baseProgressUnits! / 2));
      }
    }
  });

  test('rewards one or two newest-class round wins even on a match loss', () => {
    expect(createProgressAward(0, 'loss', { opponent: 'human', newestClassRoundWins: 1 })).toMatchObject({
      baseProgressUnits: 3_750, bonusProgressUnits: 1_875, gainedProgressUnits: 5_625, classBonusMultiplier: 1.5,
      newestClassId: 'lucky', newestClassRoundWins: 1,
    });
    expect(createProgressAward(0, 'win', { opponent: 'human', newestClassRoundWins: 2 })).toMatchObject({
      baseProgressUnits: 7_500, bonusProgressUnits: 7_500, gainedProgressUnits: 15_000, classBonusMultiplier: 2,
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

  test('splits XP animation at every filled level bar', () => {
    expect(xpAnimationStops(9_000, 24_000)).toEqual([10_000, 20_000, 24_000]);
    expect(xpAnimationStops(2_000, 9_500)).toEqual([9_500]);
  });
});
