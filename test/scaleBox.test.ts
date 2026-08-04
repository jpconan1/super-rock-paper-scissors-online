import { describe, expect, test } from 'vitest';
import { fitScaleBox, fitStackedScaleBoxes } from '../src/layout/scaleBox';

describe('scale box fitting', () => {
  test('never upscales', () => {
    expect(fitScaleBox({ logicalWidth: 400, logicalHeight: 300, availableWidth: 1200, availableHeight: 900 }))
      .toEqual({ scale: 1, width: 400, height: 300 });
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

describe('stacked scale boxes', () => {
  const dimensions = {
    top: { width: 400, height: 100 },
    center: { width: 400, height: 300 },
    bottom: { width: 400, height: 100 },
  };

  test('shrinks center before fixed regions', () => {
    const result = fitStackedScaleBoxes({ ...dimensions, availableWidth: 400, availableHeight: 350, gap: 10 });
    expect(result.top.scale).toBe(1);
    expect(result.bottom.scale).toBe(1);
    expect(result.center.scale).toBeCloseTo(130 / 300);
  });

  test('shrinks top and bottom together after center is exhausted', () => {
    const result = fitStackedScaleBoxes({ ...dimensions, availableWidth: 400, availableHeight: 170, gap: 10 });
    expect(result.center.scale).toBe(0);
    expect(result.top.scale).toBe(0.75);
    expect(result.bottom.scale).toBe(0.75);
  });

  test('applies independent width ceilings before vertical priority', () => {
    const result = fitStackedScaleBoxes({ ...dimensions, availableWidth: 200, availableHeight: 1000, gap: 10 });
    expect(result.top.scale).toBe(0.5);
    expect(result.center.scale).toBe(0.5);
    expect(result.bottom.scale).toBe(0.5);
  });
});
