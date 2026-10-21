import { describe, expect, test, vi } from 'vitest';
import { readArtworkBounds } from '../src/renderer/buttonFaceArtwork';

describe('button face artwork bounds', () => {
  test('finds visible artwork pixels', () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    pixels[3] = 255;
    pixels[((2 * 4 + 3) * 4) + 3] = 255;
    const context = { getImageData: vi.fn(() => ({ data: pixels })) };

    expect(readArtworkBounds(context as never, 4, 3)).toEqual({ left: 0, right: 3, top: 0, bottom: 2 });
  });

  test('uses the full frame when cross-origin data cannot be inspected', () => {
    const context = { getImageData: vi.fn(() => { throw new DOMException('Tainted canvas', 'SecurityError'); }) };

    expect(readArtworkBounds(context as never, 256, 128)).toEqual({ left: 0, right: 255, top: 0, bottom: 127 });
  });
});
