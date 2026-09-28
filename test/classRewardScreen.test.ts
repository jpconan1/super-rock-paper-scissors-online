import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  CLASS_UNLOCK_FRAME_MS,
  CLASS_UNLOCK_SETTLE_MS,
  classFlipFrames,
  classUnlockFrames,
  createClassRewardFlow,
  playClassUnlockAnimation,
} from '../src/app/classRewardScreen';
import { createProgressAward } from '../src/core/progression';

describe('class reward flow', () => {
  afterEach(() => vi.useRealTimers());

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

  test('builds the intro, three loops, and reverse exit sequence', () => {
    const root = '/rewards/unlock-animation';
    expect(classUnlockFrames()).toEqual([
      ...Array.from({ length: 6 }, (_, index) => `${root}/frame-${index + 1}-sheet.webp`),
      ...Array.from({ length: 3 }, () => [1, 2, 3].map((frame) => `${root}/frame-loop-${frame}-sheet.webp`)).flat(),
      ...[6, 5, 4, 3, 2, 1].map((frame) => `${root}/frame-m${frame}-sheet.webp`),
    ]);
    expect(classUnlockFrames()).toHaveLength(21);
  });

  test('reveals during settle and enables content only after settle completes', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const run = playClassUnlockAnimation({
      reducedMotion: false,
      commit: (source) => events.push(source),
      beginSettle: () => events.push('reveal'),
      complete: () => events.push('enable'),
    });

    expect(events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(classUnlockFrames().length * CLASS_UNLOCK_FRAME_MS);
    expect(events.at(-2)).toBe('/rewards/headers/class-unlocked-sheet.webp');
    expect(events.at(-1)).toBe('reveal');
    expect(events).not.toContain('enable');

    await vi.advanceTimersByTimeAsync(CLASS_UNLOCK_SETTLE_MS);
    await run.finished;
    expect(events.at(-1)).toBe('enable');
  });

  test('skips directly to enabled settled content for reduced motion', async () => {
    const events: string[] = [];
    const run = playClassUnlockAnimation({
      reducedMotion: true,
      commit: (source) => events.push(source),
      beginSettle: () => events.push('reveal'),
      complete: () => events.push('enable'),
    });
    await run.finished;
    expect(events).toEqual(['/rewards/headers/class-unlocked-sheet.webp', 'reveal', 'enable']);
  });

  test('cancellation prevents stale reveal and completion callbacks', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const run = playClassUnlockAnimation({
      reducedMotion: false,
      commit: (source) => events.push(source),
      beginSettle: () => events.push('reveal'),
      complete: () => events.push('enable'),
    });
    run.cancel();
    await vi.runAllTimersAsync();
    await run.finished;
    expect(events).toHaveLength(1);
    expect(events).not.toContain('reveal');
    expect(events).not.toContain('enable');
  });
});
