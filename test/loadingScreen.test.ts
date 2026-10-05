import { describe, expect, test } from 'vitest';
import { MINIMUM_LOADING_MS, readyPromptSource } from '../src/loading/loadingScreen';

describe('startup loading screen', () => {
  test('keeps the original minimum loading duration when boil speed changes', () => {
    expect(MINIMUM_LOADING_MS).toBe(1_125);
  });

  test('chooses tap for portrait and click for landscape', () => {
    expect(readyPromptSource(true)).toBe('/loading/tap_msg-sheet.webp');
    expect(readyPromptSource(false)).toBe('/loading/click_msg-sheet.webp');
  });

});
