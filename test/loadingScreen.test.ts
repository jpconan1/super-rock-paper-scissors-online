import { describe, expect, test } from 'vitest';
import { BOIL_FRAME_MS } from '../src/animation/boilClock';
import { MINIMUM_LOADING_MS, readyPromptSource } from '../src/loading/loadingScreen';

describe('startup loading screen', () => {
  test('holds loading art for three complete boil cycles', () => {
    expect(MINIMUM_LOADING_MS).toBe(BOIL_FRAME_MS * 9);
  });

  test('chooses tap for portrait and click for landscape', () => {
    expect(readyPromptSource(true)).toBe('/loading/tap_msg-sheet.webp');
    expect(readyPromptSource(false)).toBe('/loading/click_msg-sheet.webp');
  });

});
