import { describe, expect, test } from 'vitest';
import {
  createMatchTicketRecords, matchmakingTicketKey, recoverableMatchTicket,
} from '../src/core/matchmakingTickets';

describe('recoverable matchmaking tickets', () => {
  const expiresAt = 40_000;
  const records = createMatchTicketRecords('match-1', { p1: 'token-1', p2: 'token-2' }, {
    p1: { guestId: 'waiting-player', attemptId: 'waiting-attempt' },
    p2: { guestId: 'matching-player', attemptId: 'matching-attempt' },
  }, expiresAt);

  test('stores both players under their attempt keys with opposite seats', () => {
    expect(records).toEqual({
      'ticket:waiting-player:waiting-attempt': { matchId: 'match-1', seat: 'p1', token: 'token-1', expiresAt },
      'ticket:matching-player:matching-attempt': { matchId: 'match-1', seat: 'p2', token: 'token-2', expiresAt },
    });
  });

  test.each([
    ['waiting-player', 'waiting-attempt'],
    ['matching-player', 'matching-attempt'],
  ])('returns the same ticket on repeated polls for %s', (guestId, attemptId) => {
    const ticket = records[matchmakingTicketKey(guestId, attemptId)];
    expect(recoverableMatchTicket(ticket, 10_000)).toBe(ticket);
    expect(recoverableMatchTicket(ticket, 20_000)).toBe(ticket);
  });

  test('ignores tickets at or after expiry', () => {
    const ticket = records['ticket:waiting-player:waiting-attempt'];
    expect(recoverableMatchTicket(ticket, expiresAt)).toBeUndefined();
    expect(recoverableMatchTicket(ticket, expiresAt + 1)).toBeUndefined();
  });

  test('uses the same key for retrieval and cancellation', () => {
    const key = matchmakingTicketKey('waiting-player', 'waiting-attempt');
    expect(records[key]).toBeDefined();
    const remaining = { ...records };
    delete remaining[key];
    expect(recoverableMatchTicket(remaining[key], 10_000)).toBeUndefined();
  });
});
