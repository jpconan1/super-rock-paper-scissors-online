import { describe, expect, test } from 'vitest';
import {
  CURTAIN_CLOSED_HOLD_MS,
  CURTAIN_FRAME_MS,
  curtainAnimationFrames,
  selectCurtainLayout,
} from '../src/renderer/curtainWipe';

describe('curtain wipe', () => {
  test('closes and opens in semantic artwork order', () => {
    expect(curtainAnimationFrames('closed', 5)).toEqual({
      frames: [0, 0.25, 0.5, 0.75],
      finalFrame: 1,
    });
    expect(curtainAnimationFrames('open', 5)).toEqual({
      frames: [1, 0.75, 0.5, 0.25],
      finalFrame: 0,
    });
  });

  test('supports the six-state portrait sequence without changing landscape timing', () => {
    expect(curtainAnimationFrames('closed', 6)).toEqual({
      frames: [0, 0.2, 0.4, 0.6, 0.8],
      finalFrame: 1,
    });
  });

  test('uses portrait only below the square breakpoint', () => {
    expect(selectCurtainLayout(539, 540)).toBe('portrait');
    expect(selectCurtainLayout(540, 540)).toBe('landscape');
    expect(selectCurtainLayout(960, 540)).toBe('landscape');
  });

  test('uses the old curtain pace and holds closed for one boil cycle', () => {
    expect(CURTAIN_FRAME_MS).toBe(84);
    expect(CURTAIN_CLOSED_HOLD_MS).toBe(375);
  });
});
