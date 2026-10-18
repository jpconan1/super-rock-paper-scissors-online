import type { OwnablePlayerEmblem } from './playerEmblem';

export interface MatchmakingQueueEntry { guestId: string; attemptId: string; name: string; rating: number; totalProgressUnits?: number; unlockAllClasses?: boolean; equippedEmblem: OwnablePlayerEmblem | null; queuedAt: number }

export function refreshMatchmakingQueue(
  queue: MatchmakingQueueEntry[], guestId: string, attemptId: string, name: string, rating: number, now: number, ttlMs: number, totalProgressUnits = 0, unlockAllClasses = false, equippedEmblem: OwnablePlayerEmblem | null = null,
): { queue: MatchmakingQueueEntry[]; opponent?: MatchmakingQueueEntry; ownedElsewhere?: boolean } {
  const active = queue.filter((entry) => now - entry.queuedAt < ttlMs);
  const existing = active.find((entry) => entry.guestId === guestId);
  if (existing && existing.attemptId !== attemptId) return { queue: active, ownedElsewhere: true };
  const opponent = active.find((entry) => entry.guestId !== guestId);
  if (opponent) return { opponent, queue: active.filter((entry) => entry.guestId !== opponent.guestId && entry.guestId !== guestId) };
  return { queue: [...active.filter((entry) => entry.guestId !== guestId), {
    guestId, attemptId, name, rating, ...(totalProgressUnits ? { totalProgressUnits } : {}), ...(unlockAllClasses ? { unlockAllClasses } : {}), equippedEmblem, queuedAt: now,
  }] };
}
