export interface MatchmakingQueueEntry { guestId: string; name: string; rating: number; queuedAt: number }

export function refreshMatchmakingQueue(
  queue: MatchmakingQueueEntry[], guestId: string, name: string, rating: number, now: number, ttlMs: number,
): { queue: MatchmakingQueueEntry[]; opponent?: MatchmakingQueueEntry } {
  const active = queue.filter((entry) => now - entry.queuedAt < ttlMs);
  const opponent = active.find((entry) => entry.guestId !== guestId);
  if (opponent) return { opponent, queue: active.filter((entry) => entry.guestId !== opponent.guestId && entry.guestId !== guestId) };
  return { queue: [...active.filter((entry) => entry.guestId !== guestId), { guestId, name, rating, queuedAt: now }] };
}
