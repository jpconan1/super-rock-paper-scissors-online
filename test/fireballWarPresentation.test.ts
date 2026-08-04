import { describe, expect, test } from 'vitest';
import { resolveFireballWarScene } from '../src/variants/fireballWar/presentation';

describe('Fireball War presentation', () => {
  test('resolves symmetric scenes and mirrors asymmetric P1 roles', () => {
    expect(resolveFireballWarScene({ p1: 'block', p2: 'charge' })).toEqual({
      src: '/variants/fireball-war/block-charge-sheet.webp',
      mirrored: false,
    });
    expect(resolveFireballWarScene({ p1: 'charge', p2: 'block' }).mirrored).toBe(true);
  });
});
