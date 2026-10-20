import { describe, expect, test } from 'vitest';
import { PLAYER_NAME_MAX_LENGTH, isPlayerProfile, normalizePlayerDisplayName } from '../src/protocol/playerProfile';

describe('player profiles', () => {
  test('normalizes harmless whitespace without inventing a name', () => {
    expect(normalizePlayerDisplayName('  Player   One  ')).toBe('Player One');
    expect(normalizePlayerDisplayName('   ')).toBeNull();
  });

  test('rejects control characters and oversized names', () => {
    expect(normalizePlayerDisplayName('Player\nOne')).toBeNull();
    expect(normalizePlayerDisplayName('x'.repeat(PLAYER_NAME_MAX_LENGTH + 1))).toBeNull();
    expect(normalizePlayerDisplayName('x'.repeat(PLAYER_NAME_MAX_LENGTH))).toHaveLength(PLAYER_NAME_MAX_LENGTH);
  });

  test('accepts only complete, bounded server sessions', () => {
    const profile = { playerId: 'anchor-chill-pizza-turtle-00', accountType: 'guest', displayName: 'Player', rating: 1500, equippedEmblem: 'beta-og', ownedEmblems: ['beta-og'] };
    expect(isPlayerProfile(profile)).toBe(true);
    expect(isPlayerProfile({ ...profile, playerId: '' })).toBe(false);
    expect(isPlayerProfile({ ...profile, displayName: 'Player\nTwo' })).toBe(false);
    expect(isPlayerProfile({ playerId: profile.playerId, accountType: profile.accountType, displayName: profile.displayName, rating: profile.rating })).toBe(false);
    expect(isPlayerProfile({ ...profile, equippedEmblem: 'computer' })).toBe(false);
    expect(isPlayerProfile({ ...profile, equippedEmblem: 'unknown' })).toBe(false);
  });

  test('requires metadata for an equipped custom emblem', () => {
    const profile = { playerId: 'anchor-chill-pizza-turtle-00', accountType: 'guest', displayName: 'Player', rating: 1500, equippedEmblem: 'custom', ownedEmblems: [],
      customEmblem: { playerId: 'anchor-chill-pizza-turtle-00', version: 123, borderNumber: 28 } };
    expect(isPlayerProfile(profile)).toBe(true);
    expect(isPlayerProfile({ ...profile, customEmblem: null })).toBe(false);
  });
});
