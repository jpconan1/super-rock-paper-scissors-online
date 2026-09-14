import { describe, expect, test } from 'vitest';
import {
  createProgressAward, isClassUnlocked, MAX_PROGRESS_UNITS, progressGainForLevel, progressionForTotal,
} from '../src/core/progression';
import { ABM_CLASS_IDS } from '../src/variants/attackBlockMana/attackBlockManaTypes';

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
    const award = createProgressAward(9_000, 'win');
    expect(award.after).toMatchObject({ level: 3, totalProgressUnits: 24_000, progressUnitsInLevel: 4_000 });
    expect(award.unlockedClassIds).toEqual(['advantaged', 'thief']);
  });

  test('caps gains at level 21', () => {
    const award = createProgressAward(199_000, 'win');
    expect(award.gainedProgressUnits).toBe(1_000);
    expect(award.after.totalProgressUnits).toBe(MAX_PROGRESS_UNITS);
    expect(createProgressAward(MAX_PROGRESS_UNITS, 'loss').gainedProgressUnits).toBe(0);
  });

  test('class availability follows catalog order', () => {
    expect(isClassUnlocked(0, 'lucky')).toBe(true);
    expect(isClassUnlocked(0, 'advantaged')).toBe(false);
    expect(isClassUnlocked(10_000, 'advantaged')).toBe(true);
    expect(isClassUnlocked(MAX_PROGRESS_UNITS, 'joe')).toBe(true);
  });
});
