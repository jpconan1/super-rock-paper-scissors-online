import { describe, expect, test } from 'vitest';
import { gainToSliderPosition, sliderPositionToGain } from '../src/title/volumeSlider';

describe('volume slider curve', () => {
  test('gives the quiet end more physical range', () => {
    expect(sliderPositionToGain(0)).toBe(0);
    expect(sliderPositionToGain(0.25)).toBe(0.0625);
    expect(sliderPositionToGain(0.5)).toBe(0.25);
    expect(sliderPositionToGain(1)).toBe(1);
  });

  test('converts stored gain back to its matching slider position', () => {
    for (const gain of [0, 0.0625, 0.25, 0.5, 1]) {
      expect(sliderPositionToGain(gainToSliderPosition(gain))).toBeCloseTo(gain);
    }
  });

  test('clamps values outside the supported range', () => {
    expect(sliderPositionToGain(-1)).toBe(0);
    expect(sliderPositionToGain(2)).toBe(1);
    expect(gainToSliderPosition(-1)).toBe(0);
    expect(gainToSliderPosition(2)).toBe(1);
  });
});
