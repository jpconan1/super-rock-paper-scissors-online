import { describe, expect, test } from 'vitest';
import { getServerVariant, getServerVariantForSlot } from '../src/core/serverVariantRegistry';

describe('server variant slot registry', () => {
  test('binds ABM only to the center slot', () => {
    expect(getServerVariantForSlot('slot-1').variantId).toBe('rock-paper-scissors');
    expect(getServerVariantForSlot('slot-5').variantId).toBe('attack-block-mana');
    expect(getServerVariantForSlot('slot-9').variantId).toBe('tap-tap-shoot');
    expect(getServerVariantForSlot('slot-4').variantId).toBe('gun-knife-fist');
  });

  test('deploys authoritative Tap Tap Shoot rules', () => {
    expect(getServerVariant('tap-tap-shoot', 1).variantId).toBe('tap-tap-shoot');
  });

  test('deploys authoritative Gun Knife Fist rules', () => {
    expect(getServerVariant('gun-knife-fist', 1).variantId).toBe('gun-knife-fist');
  });

  test('deploys authoritative RPS rules', () => {
    expect(getServerVariant('rock-paper-scissors', 1).variantId).toBe('rock-paper-scissors');
  });
});
