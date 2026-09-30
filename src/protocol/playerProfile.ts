import { progressionForTotal, type PlayerProgression } from '../core/progression';

export const PLAYER_NAME_MAX_LENGTH = 24;

export function normalizePlayerDisplayName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized.length > 0 && normalized.length <= PLAYER_NAME_MAX_LENGTH ? normalized : null;
}

export interface PlayerProfile extends PlayerProgression {
  playerId: string;
  displayName: string;
  rating: number;
  unlockAllClasses: boolean;
}

export function isPlayerProfile(value: unknown): value is PlayerProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlayerProfile>;
  return typeof candidate.playerId === 'string' && candidate.playerId.length > 0 && candidate.playerId.length <= 100
    && normalizePlayerDisplayName(candidate.displayName) === candidate.displayName
    && typeof candidate.rating === 'number' && Number.isFinite(candidate.rating)
    && ensureProgression(candidate);
}

export function playerProfile(playerId: string, displayName: string, rating: number, totalProgressUnits = 0, unlockAllClasses = false): PlayerProfile {
  return { playerId, displayName, rating, unlockAllClasses, ...progressionForTotal(totalProgressUnits) };
}

function ensureProgression(candidate: Partial<PlayerProfile>): boolean {
  if (candidate.totalProgressUnits === undefined) Object.assign(candidate, progressionForTotal(0));
  candidate.unlockAllClasses ??= false;
  if (!Number.isSafeInteger(candidate.totalProgressUnits) || (candidate.totalProgressUnits ?? -1) < 0) return false;
  const expected = progressionForTotal(candidate.totalProgressUnits!);
  return typeof candidate.unlockAllClasses === 'boolean' && candidate.level === expected.level && candidate.progressUnitsInLevel === expected.progressUnitsInLevel
    && candidate.nextUnlock === expected.nextUnlock && Array.isArray(candidate.unlockedClassIds)
    && candidate.unlockedClassIds.length === expected.unlockedClassIds.length
    && candidate.unlockedClassIds.every((id, index) => id === expected.unlockedClassIds[index]);
}
