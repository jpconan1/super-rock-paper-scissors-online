import { describe, expect, test } from 'vitest';
import { detectBrightTextAnchor, detectColoredTextAnchor, detectOpaqueTextAnchor } from '../src/renderer/textAnchorDetector';

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

  test('detects a colored face from opacity instead of brightness', () => {
    const width = 8;
    const frameHeight = 4;
    const pixels = new Uint8ClampedArray(width * frameHeight * 3 * 4);
    for (let frame = 0; frame < 3; frame++) {
      for (let y = 1; y <= 2; y++) {
        for (let x = 2 + frame; x <= 5 + frame; x++) {
          const offset = (((frame * frameHeight) + y) * width + x) * 4;
          pixels.set([110, 45, 35, 255], offset);
        }
      }
    }

    expect(detectBrightTextAnchor(pixels, width, frameHeight * 3)).toBeNull();
    const anchor = detectOpaqueTextAnchor(pixels, width, frameHeight * 3);
    expect(anchor?.xPercent).toBeCloseTo(62.5);
    expect(anchor?.yPercent).toBe(50);
  });

  test('colored detection excludes opaque black outline and shadow', () => {
    const width = 8;
    const frameHeight = 4;
    const pixels = new Uint8ClampedArray(width * frameHeight * 3 * 4);
    for (let frame = 0; frame < 3; frame++) {
      for (let x = 0; x < width; x++) pixels.set([0, 0, 0, 255], (((frame * frameHeight) + 3) * width + x) * 4);
      for (let y = 1; y <= 2; y++) {
        for (let x = 2; x <= 5; x++) pixels.set([175, 175, 105, 255], (((frame * frameHeight) + y) * width + x) * 4);
      }
    }

    const anchor = detectColoredTextAnchor(pixels, width, frameHeight * 3);
    expect(anchor?.xPercent).toBe(50);
    expect(anchor?.yPercent).toBe(50);
    expect(anchor?.widthPercent).toBe(50);
  });
});
