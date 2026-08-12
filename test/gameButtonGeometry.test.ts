import { describe, expect, test } from 'vitest';
import { getButtonFrameAspectRatio } from '../src/input/gameButton';

describe('game button geometry', () => {
  test.each([
    ['standard', { width: 256, height: 128 }, 2],
    ['charge', { width: 272, height: 181 }, 272 / 181],
    ['tall', { width: 128, height: 192 }, 2 / 3],
  ])('uses the %s frame aspect ratio', (_name, size, ratio) => {
    expect(getButtonFrameAspectRatio(size)).toBeCloseTo(ratio);
  });

  test.each([
    null,
    { width: 0, height: 128 },
    { width: 256, height: 0 },
    { width: Number.NaN, height: 128 },
  ])('falls back to 2:1 for invalid frame geometry', (size) => {
    expect(getButtonFrameAspectRatio(size)).toBe(2);
  });
});
