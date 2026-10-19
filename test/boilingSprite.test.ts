import { describe, expect, test } from 'vitest';
import { getVerticalSheetFrameSize, splitChromaOutlinePixels } from '../src/renderer/boilingSprite';

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

  test('supports authored frame counts', () => {
    expect(getVerticalSheetFrameSize({ width: 512, height: 3_072 }, 12)).toEqual({ width: 512, height: 256 });
  });
});

describe('emblem outline chroma key', () => {
  test('turns exact magenta into a cutout while retaining visible outline pixels', () => {
    const pixels = new Uint8ClampedArray([
      255, 64, 255, 255,
      0, 0, 0, 255,
      0, 0, 0, 0,
      252, 1, 252, 255,
      38, 0, 38, 255,
    ]);
    const { mask, visible } = splitChromaOutlinePixels(pixels, [255, 64, 255]);
    expect([...mask]).toEqual([
      255, 255, 255, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]);
    expect([...visible]).toEqual([
      255, 64, 255, 0,
      0, 0, 0, 255,
      0, 0, 0, 0,
      252, 1, 252, 0,
      38, 0, 38, 0,
    ]);
  });
});
