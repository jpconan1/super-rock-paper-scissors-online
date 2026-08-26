import { getVerticalSheetFrameSize, type SheetDimensions } from '../renderer/boilingSprite';
import type { LayoutElement, LayoutGeometry } from '../layout/layoutDocument';

const NATIVE_ARTWORK_TYPES = new Set(['sprite', 'decoration', 'button', 'control', 'toggle']);
const SHEET_PATH = /(?:-|_)sheet\.[a-z0-9]+$/i;

export function nativeAssetPath(element: LayoutElement): string | undefined {
  if (!NATIVE_ARTWORK_TYPES.has(element.type)) return undefined;
  return element.assets?.src ?? element.assets?.up ?? element.assets?.off;
}

export function nativeFrameSize(path: string, image: SheetDimensions): SheetDimensions {
  return SHEET_PATH.test(path) ? getVerticalSheetFrameSize(image) : image;
}

export function nativeRatio(size: SheetDimensions): number { return size.width / size.height; }

export function correctElementRatio(element: LayoutElement, ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  let changed = false;
  for (const orientation of ['landscape', 'portrait'] as const) {
    const geometry = element.layouts[orientation]; const height = geometry.width / ratio;
    if (Math.abs(geometry.height - height) > 0.001 || geometry.aspectLock !== true) {
      geometry.height = height; geometry.aspectLock = true; changed = true;
    }
  }
  return changed;
}

export function resizeWithNativeRatio(geometry: LayoutGeometry, key: 'width' | 'height', value: number, ratio: number): void {
  if (key === 'width') { geometry.width = value; geometry.height = value / ratio; }
  else { geometry.height = value; geometry.width = value * ratio; }
  geometry.aspectLock = true;
}
