import { describe, expect, test } from 'vitest';
import { classFlipFrames, createClassRewardFlow } from '../src/app/classRewardScreen';
import { createProgressAward } from '../src/core/progression';

describe('class reward flow', () => {
  test('keeps multiple unlocks in progression order and previews the next class', () => {
    expect(createClassRewardFlow(createProgressAward(9_000, 'win'))).toEqual({
      unlockedClassIds: ['advantaged', 'thief'], nextClassId: 'juggernaut',
    });
  });

  test('omits the preview after the final class unlock', () => {
    expect(createClassRewardFlow(createProgressAward(199_000, 'win'))).toEqual({ unlockedClassIds: ['joe'] });
  });

  test('plays seven ordered flip frames for the previewed class', () => {
    expect(classFlipFrames('advantaged')).toEqual(Array.from({ length: 7 }, (_, index) =>
      `/rewards/class-flips/advantaged/frame-${String(index + 1).padStart(2, '0')}.webp`));
  });
});
