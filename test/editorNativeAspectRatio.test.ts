import { describe, expect, test } from 'vitest';
import type { LayoutElement } from '../src/layout/layoutDocument';
import { correctElementRatio, nativeAssetPath, nativeFrameSize, resizeWithNativeRatio } from '../src/editor/nativeAspectRatio';

const artwork = (): LayoutElement => ({
  id: 'arrow', type: 'decoration', assets: { src: '/arrow-sheet.webp' },
  layouts: {
    landscape: { x: 10, y: 20, width: 65, height: 99 },
    portrait: { x: 30, y: 40, width: 32.5, height: 99 },
  },
});

describe('editor native aspect ratios', () => {
  test('uses one frame for a three-frame vertical sheet', () => {
    expect(nativeFrameSize('/arrow-sheet.webp', { width: 65, height: 213 })).toEqual({ width: 65, height: 71 });
    expect(nativeFrameSize('/static.webp', { width: 80, height: 60 })).toEqual({ width: 80, height: 60 });
  });

  test('corrects both orientations while preserving position and width', () => {
    const element = artwork();
    expect(correctElementRatio(element, 65 / 71)).toBe(true);
    expect(element.layouts.landscape).toMatchObject({ x: 10, y: 20, width: 65, height: 71, aspectLock: true });
    expect(element.layouts.portrait).toMatchObject({ x: 30, y: 40, width: 32.5, height: 35.5, aspectLock: true });
    expect(correctElementRatio(element, 65 / 71)).toBe(false);
  });

  test('width and height edits preserve the native ratio', () => {
    const geometry = artwork().layouts.landscape;
    resizeWithNativeRatio(geometry, 'width', 130, 65 / 71);
    expect(geometry).toMatchObject({ width: 130, height: 142, aspectLock: true });
    resizeWithNativeRatio(geometry, 'height', 71, 65 / 71);
    expect(geometry).toMatchObject({ width: 65, height: 71, aspectLock: true });
  });

  test('only asset-backed artwork requests native locking', () => {
    expect(nativeAssetPath(artwork())).toBe('/arrow-sheet.webp');
    expect(nativeAssetPath({ ...artwork(), type: 'group' })).toBeUndefined();
  });
});
