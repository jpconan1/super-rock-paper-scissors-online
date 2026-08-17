import { describe, expect, test } from 'vitest';
import {
  fitScaleBox,
  selectResponsiveScaleBoxLayout,
} from '../src/layout/scaleBox';

describe('scale box fitting', () => {
  test('never upscales', () => {
    expect(fitScaleBox({ logicalWidth: 400, logicalHeight: 300, availableWidth: 1200, availableHeight: 900 }))
      .toEqual({ scale: 1, width: 400, height: 300 });
  });

  test('upscales when an explicit maximum allows it', () => {
    expect(fitScaleBox({
      logicalWidth: 960,
      logicalHeight: 540,
      availableWidth: 1920,
      availableHeight: 1080,
      maxScale: Number.POSITIVE_INFINITY,
    })).toEqual({ scale: 2, width: 1920, height: 1080 });
  });

  test('respects a finite upscale cap', () => {
    expect(fitScaleBox({
      logicalWidth: 960,
      logicalHeight: 540,
      availableWidth: 1920,
      availableHeight: 1080,
      maxScale: 1.5,
    })).toEqual({ scale: 1.5, width: 1440, height: 810 });
  });

  test.each([
    [320, 800, 0.8],
    [1000, 150, 0.5],
    [0, 800, 0],
  ])('fits inside %sx%s', (availableWidth, availableHeight, scale) => {
    const result = fitScaleBox({ logicalWidth: 400, logicalHeight: 300, availableWidth, availableHeight });
    expect(result.scale).toBe(scale);
    expect(result.width).toBeLessThanOrEqual(availableWidth);
    expect(result.height).toBeLessThanOrEqual(availableHeight);
  });

  test('rejects invalid logical dimensions', () => {
    expect(() => fitScaleBox({ logicalWidth: 0, logicalHeight: 10, availableWidth: 10, availableHeight: 10 }))
      .toThrow(/positive finite/);
  });
});

describe('responsive scale-box layouts', () => {
  const layouts = [
    { name: 'landscape', width: 705, height: 540, minAspectRatio: 1 },
    { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
  ] as const;

  test.each([
    [999, 1000, 'portrait'],
    [1000, 1000, 'landscape'],
    [1200, 700, 'landscape'],
    [390, 844, 'portrait'],
  ])('selects %s x %s as %s', (width, height, expected) => {
    expect(selectResponsiveScaleBoxLayout(layouts, width, height).name).toBe(expected);
  });

  test('fits using the dimensions of the selected layout', () => {
    const layout = selectResponsiveScaleBoxLayout(layouts, 390, 844);
    expect(fitScaleBox({
      logicalWidth: layout.width,
      logicalHeight: layout.height,
      availableWidth: 390,
      availableHeight: 844,
    })).toEqual({ scale: 1, width: 390, height: 705 });
  });

  test('requires at least one layout', () => {
    expect(() => selectResponsiveScaleBoxLayout([], 390, 844)).toThrow(/At least one/);
  });
});
