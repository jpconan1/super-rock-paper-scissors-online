import { describe, expect, test } from 'vitest';
import { GUEST_NAME_MAX_LENGTH, isGuestSessionResponse, normalizeGuestDisplayName } from '../src/protocol/guestSession';

describe('guest sessions', () => {
  test('normalizes harmless whitespace without inventing a name', () => {
    expect(normalizeGuestDisplayName('  Player   One  ')).toBe('Player One');
    expect(normalizeGuestDisplayName('   ')).toBeNull();
  });

  test('rejects control characters and oversized names', () => {
    expect(normalizeGuestDisplayName('Player\nOne')).toBeNull();
    expect(normalizeGuestDisplayName('x'.repeat(GUEST_NAME_MAX_LENGTH + 1))).toBeNull();
    expect(normalizeGuestDisplayName('x'.repeat(GUEST_NAME_MAX_LENGTH))).toHaveLength(GUEST_NAME_MAX_LENGTH);
  });

  test('accepts only complete, bounded server sessions', () => {
    const session = { playerId: 'guest', guestSecret: 's'.repeat(64), displayName: 'Player', rating: 1500 };
    expect(isGuestSessionResponse(session)).toBe(true);
    expect(isGuestSessionResponse({ ...session, guestSecret: 'short' })).toBe(false);
    expect(isGuestSessionResponse({ ...session, displayName: 'Player\nTwo' })).toBe(false);
  });
});
