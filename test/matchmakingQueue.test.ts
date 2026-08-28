import { describe, expect, test } from 'vitest';
import { refreshMatchmakingQueue, type MatchmakingQueueEntry } from '../src/core/matchmakingQueue';

const entry = (guestId: string, queuedAt: number, attemptId = `${guestId}-attempt`): MatchmakingQueueEntry => ({ guestId, attemptId, name: guestId, rating: 1500, queuedAt });

describe('matchmaking queue heartbeat', () => {
  test('does not match a guest whose heartbeat expired', () => {
    const result = refreshMatchmakingQueue([entry('ghost', 0)], 'live', 'live-attempt', 'Live', 1500, 5_000, 5_000);
    expect(result.opponent).toBeUndefined();
    expect(result.queue.map((item) => item.guestId)).toEqual(['live']);
  });

  test('refreshes an existing guest heartbeat and current player data', () => {
    const result = refreshMatchmakingQueue([entry('self', 1)], 'self', 'self-attempt', 'New Name', 1600, 4_000, 5_000);
    expect(result.queue).toEqual([{ guestId: 'self', attemptId: 'self-attempt', name: 'New Name', rating: 1600, queuedAt: 4_000 }]);
  });

  test('matches an active opponent and removes both queue entries', () => {
    const result = refreshMatchmakingQueue([entry('self', 2_000), entry('opponent', 3_000)], 'self', 'self-attempt', 'Self', 1500, 4_000, 5_000);
    expect(result.opponent?.guestId).toBe('opponent');
    expect(result.queue).toEqual([]);
  });

  test('does not let another tab steal the same guest queue position', () => {
    const original = entry('self', 3_000, 'first-tab');
    const result = refreshMatchmakingQueue([original], 'self', 'second-tab', 'Self', 1500, 4_000, 5_000);
    expect(result.ownedElsewhere).toBe(true);
    expect(result.queue).toEqual([original]);
  });
});
