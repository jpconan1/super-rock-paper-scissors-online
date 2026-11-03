import { describe, expect, test, vi } from 'vitest';
import type { BoilClock } from '../src/animation/boilClock';
import { createBoilingSprite, getVerticalSheetFrameSize, nextLoopFrame, splitChromaOutlinePixels } from '../src/renderer/boilingSprite';

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
    expect(getVerticalSheetFrameSize({ width: 256, height: 2_304 }, 18)).toEqual({ width: 256, height: 128 });
  });

  test('loops authored frame counts', () => {
    expect(nextLoopFrame(0, 18)).toBe(1);
    expect(nextLoopFrame(16, 18)).toBe(17);
    expect(nextLoopFrame(17, 18)).toBe(0);
    expect(nextLoopFrame(2, 3)).toBe(0);
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

describe('boiling sprite source changes', () => {
  test('repeated renders keep the existing image load and animation frame', () => {
    const originalDocument = globalThis.document;
    const originalImage = globalThis.Image;
    let loads = 0;
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      complete = false;
      naturalWidth = 100;
      naturalHeight = 300;
      set src(_value: string) { loads++; this.complete = true; this.onload?.(); }
      decode() { return Promise.resolve(); }
    }
    const context = { clearRect: vi.fn(), drawImage: vi.fn() };
    const element = () => ({
      className: '', style: { aspectRatio: '', removeProperty: vi.fn() }, width: 0, height: 0,
      setAttribute: vi.fn(), append: vi.fn(), remove: vi.fn(),
      getContext: () => context,
    });
    vi.stubGlobal('document', { createElement: element });
    vi.stubGlobal('Image', TestImage);
    try {
      const clock = { subscribe: (subscriber: (frame: 0 | 1 | 2) => void) => { subscriber(0); return () => {}; }, isEnabled: () => true } as BoilClock;
      const sprite = createBoilingSprite({ src: '/same.webp', clock });
      sprite.setFrame(2);
      const draws = context.drawImage.mock.calls.length;
      sprite.setSource('/same.webp');
      expect(loads).toBe(1);
      expect(context.drawImage).toHaveBeenCalledTimes(draws);
      sprite.setSource('/other.webp');
      expect(loads).toBe(2);
      sprite.destroy();
    } finally {
      vi.stubGlobal('document', originalDocument);
      vi.stubGlobal('Image', originalImage);
    }
  });
});
