import { describe, expect, test } from 'vitest';
import { detectBrightTextAnchor } from '../src/renderer/textAnchorDetector';

describe('button text anchor detection', () => {
  test('averages bright face bounds across three vertical frames', () => {
    const width = 10;
    const frameHeight = 6;
    const pixels = new Uint8ClampedArray(width * frameHeight * 3 * 4);
    const faces = [
      { left: 2, right: 7, top: 1, bottom: 4 },
      { left: 3, right: 8, top: 1, bottom: 4 },
      { left: 2, right: 7, top: 2, bottom: 5 },
    ];
    faces.forEach((face, frame) => {
      for (let y = face.top; y <= face.bottom; y++) {
        for (let x = face.left; x <= face.right; x++) {
          const offset = (((frame * frameHeight) + y) * width + x) * 4;
          pixels.set([255, 255, 255, 255], offset);
        }
      }
    });

    const anchor = detectBrightTextAnchor(pixels, width, frameHeight * 3);
    expect(anchor?.xPercent).toBeCloseTo(53.333);
    expect(anchor?.yPercent).toBeCloseTo(55.556);
    expect(anchor?.widthPercent).toBeCloseTo(60);
    expect(anchor?.heightPercent).toBeCloseTo(66.667);
  });

  test('returns null when no bright face exists', () => {
    expect(detectBrightTextAnchor(new Uint8ClampedArray(4 * 9 * 4), 4, 9)).toBeNull();
  });
});
