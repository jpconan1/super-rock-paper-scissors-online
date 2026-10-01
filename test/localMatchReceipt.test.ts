import { describe, expect, test } from 'vitest';
import {
  hasFullLocalMatchAwardAllowance, LOCAL_MATCH_GRANT_TTL_MS, LOCAL_MATCH_MINIMUM_MS, localMatchGrantProblem,
  type StoredLocalMatchGrant,
} from '../src/protocol/localMatchReceipt';

const issuedAt = 100_000;
const grant: StoredLocalMatchGrant = {
  playerId: 'player-1', kind: 'computer', issuedAt, expiresAt: issuedAt + LOCAL_MATCH_GRANT_TTL_MS, claimedAt: null,
};

describe('local match receipts', () => {
  test('accepts only a mature, unexpired, unclaimed receipt for its player and kind', () => {
    expect(localMatchGrantProblem(grant, 'player-1', 'computer', issuedAt + LOCAL_MATCH_MINIMUM_MS)).toBeUndefined();
    expect(localMatchGrantProblem(undefined, 'player-1', 'computer', issuedAt + LOCAL_MATCH_MINIMUM_MS)).toBe('unknown');
    expect(localMatchGrantProblem(grant, 'player-2', 'computer', issuedAt + LOCAL_MATCH_MINIMUM_MS)).toBe('wrong-player');
    expect(localMatchGrantProblem(grant, 'player-1', 'tutorial', issuedAt + LOCAL_MATCH_MINIMUM_MS)).toBe('wrong-kind');
    expect(localMatchGrantProblem(grant, 'player-1', 'computer', issuedAt + LOCAL_MATCH_MINIMUM_MS - 1)).toBe('premature');
    expect(localMatchGrantProblem(grant, 'player-1', 'computer', grant.expiresAt + 1)).toBe('expired');
    expect(localMatchGrantProblem({ ...grant, claimedAt: issuedAt + LOCAL_MATCH_MINIMUM_MS }, 'player-1', 'computer', issuedAt + LOCAL_MATCH_MINIMUM_MS)).toBe('claimed');
  });

  test('allows exactly thirty full awards in each independently queried rolling window', () => {
    expect(hasFullLocalMatchAwardAllowance(29)).toBe(true);
    expect(hasFullLocalMatchAwardAllowance(30)).toBe(false);
    expect(hasFullLocalMatchAwardAllowance(31)).toBe(false);
  });
});
