import { describe, expect, test } from 'vitest';
import { STARBURST_WIPE_STEPS } from '../src/renderer/starburstWipe';

describe('starburst wipe', () => {
  test('preserves the original composite layer order and covered frame', () => {
    expect(STARBURST_WIPE_STEPS).toEqual([
      ['1-w'], ['2-w', '1'], ['3-w', '1', '2'], ['4-w', '2', '3'], ['4-w', '3'],
      ['4-w'], ['4', '3-w'], ['3', '2-w'], ['2', '1-w'], ['1'],
    ]);
    expect(STARBURST_WIPE_STEPS[5]).toEqual(['4-w']);
  });
});
