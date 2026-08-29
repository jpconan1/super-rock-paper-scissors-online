import { describe, expect, test } from 'vitest';
import { getVerticalSheetFrameSize } from '../src/renderer/boilingSprite';

describe('vertical boiling sheet dimensions', () => {
  test.each([
    ['title logo', 512, 1104, 512, 368],
    ['ABM title logo', 512, 1188, 512, 396],
    ['button', 256, 384, 256, 128],
    ['juice', 384, 576, 384, 192],
    ['curtain', 960, 1620, 960, 540],
    ['starburst', 1100, 2475, 1100, 825],
  ])('%s', (_name, width, height, frameWidth, frameHeight) => {
    expect(getVerticalSheetFrameSize({ width, height })).toEqual({ width: frameWidth, height: frameHeight });
  });

  test('rejects malformed sheets', () => {
    expect(() => getVerticalSheetFrameSize({ width: 100, height: 100 })).toThrow(/3 equal vertical frames/);
  });
});
