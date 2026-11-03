import { describe, expect, test } from 'vitest';
import { CUSTOM_EMBLEM_BORDER_NUMBER, CUSTOM_EMBLEM_MAX_DOCUMENT_BYTES, DEFAULT_CUSTOM_EMBLEM_DOCUMENT, customEmblemImageUrl, isCustomEmblemDocument, nextCustomEmblemBorder, setCustomEmblemImageBaseUrl } from '../src/core/customEmblem';
import { clampCustomEmblemCrop } from '../src/app/customEmblemEditor';

describe('custom emblems', () => {
  test('accepts the default document and rejects invalid borders, crops, and points', () => {
    expect(DEFAULT_CUSTOM_EMBLEM_DOCUMENT.borderNumber).toBe(CUSTOM_EMBLEM_BORDER_NUMBER);
    expect(isCustomEmblemDocument(DEFAULT_CUSTOM_EMBLEM_DOCUMENT)).toBe(true);
    expect(isCustomEmblemDocument({ ...DEFAULT_CUSTOM_EMBLEM_DOCUMENT, borderNumber: 29 })).toBe(false);
    expect(isCustomEmblemDocument({ ...DEFAULT_CUSTOM_EMBLEM_DOCUMENT, crop: { x: 700, y: 0, width: 200, height: 100 } })).toBe(false);
    expect(isCustomEmblemDocument({ ...DEFAULT_CUSTOM_EMBLEM_DOCUMENT, operations: [{ kind: 'stroke', color: 'black', points: [{ x: 0, y: 0 }, { x: 761, y: 1 }] }] })).toBe(false);
  });

  test('upload size accommodates the maximum drawing allowed by the editor', () => {
    const points = Array.from({ length: 180 }, (_, index) => ({ x: Math.min(760, index * 5), y: Math.min(450, index * 3) }));
    const document = { ...DEFAULT_CUSTOM_EMBLEM_DOCUMENT, operations: Array.from({ length: 300 }, () => ({ kind: 'stroke' as const, color: 'black' as const, points })) };
    expect(isCustomEmblemDocument(document)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(document)).byteLength).toBeLessThan(CUSTOM_EMBLEM_MAX_DOCUMENT_BYTES);
  });

  test('clamps move and resize while preserving the 2:1 frame', () => {
    expect(clampCustomEmblemCrop({ x: -50, y: 500, width: 900, height: 1 })).toEqual({ x: 0, y: 70, width: 760, height: 380 });
    expect(clampCustomEmblemCrop({ x: 730, y: -10, width: 96, height: 48 })).toEqual({ x: 664, y: 0, width: 96, height: 48 });
  });

  test('versions custom artwork URLs independently from the player id', () => {
    setCustomEmblemImageBaseUrl('http://localhost:8787/');
    expect(customEmblemImageUrl({ playerId: 'player/name', version: 42, borderNumber: 5 }))
      .toBe('http://localhost:8787/custom-emblems/player%2Fname.webp?v=42&format=2');
    setCustomEmblemImageBaseUrl('');
  });

  test('cycles through all 28 borders in order', () => {
    expect(nextCustomEmblemBorder(1)).toBe(2);
    expect(nextCustomEmblemBorder(27)).toBe(28);
    expect(nextCustomEmblemBorder(28)).toBe(1);
  });
});
