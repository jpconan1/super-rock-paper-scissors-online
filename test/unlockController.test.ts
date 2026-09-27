import { describe, expect, test } from 'vitest';
import { advanceUnlockCode, UNLOCK_CODE, type ControllerButton } from '../src/app/unlockController';

function enter(buttons: readonly ControllerButton[]): number {
  let progress = 0; let completions = 0;
  for (const button of buttons) {
    const next = advanceUnlockCode(progress, button); progress = next.progress;
    if (next.complete) completions++;
  }
  return completions;
}

describe('unlock controller code', () => {
  test('completes the Konami sequence without a timing dependency', () => {
    expect(enter(UNLOCK_CODE)).toBe(1);
  });

  test('ignores unrelated input and preserves a useful overlapping Up', () => {
    expect(enter(['left', 'a', ...UNLOCK_CODE])).toBe(1);
    expect(enter(['up', ...UNLOCK_CODE])).toBe(1);
  });

  test('does not complete partial or incorrect sequences', () => {
    expect(enter(UNLOCK_CODE.slice(0, -1))).toBe(0);
    expect(enter(['up', 'up', 'down', 'left', 'right', 'b', 'a', 'select'])).toBe(0);
  });

  test('resets after completion and requires another full entry', () => {
    expect(enter([...UNLOCK_CODE, ...UNLOCK_CODE])).toBe(2);
  });
});
