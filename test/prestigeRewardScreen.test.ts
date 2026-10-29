import { describe, expect, test } from 'vitest';
import {
  PRESTIGE_ANIMATION_FPS,
  PRESTIGE_TEXT_REVEAL_MS,
  prestigeAnimationFrame,
  prestigeRewardText,
  prestigeTextVisible,
} from '../src/app/prestigeRewardScreen';

describe('prestige reward screen', () => {
  test('uses the completed award prestige count in its copy', () => {
    expect(prestigeRewardText(7)).toBe('Prestige Level 7!');
  });

  test('plays 48 authored frames and then boils over the final three', () => {
    const frameTime = 1_000 / PRESTIGE_ANIMATION_FPS;
    expect(prestigeAnimationFrame(0)).toBe(0);
    expect(prestigeAnimationFrame(Math.ceil(47 * frameTime))).toBe(47);
    expect(prestigeAnimationFrame(Math.ceil(48 * frameTime))).toBe(45);
    expect(prestigeAnimationFrame(Math.ceil(49 * frameTime))).toBe(46);
    expect(prestigeAnimationFrame(Math.ceil(50 * frameTime))).toBe(47);
    expect(prestigeAnimationFrame(Math.ceil(51 * frameTime))).toBe(45);
  });

  test('reveals prestige copy and Continue at the authored sound cue', () => {
    expect(prestigeTextVisible(PRESTIGE_TEXT_REVEAL_MS - 1)).toBe(false);
    expect(prestigeTextVisible(PRESTIGE_TEXT_REVEAL_MS)).toBe(true);
  });
});
