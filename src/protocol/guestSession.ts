import { progressionForTotal, type PlayerProgression } from '../core/progression';

export const GUEST_NAME_MAX_LENGTH = 24;

export function normalizeGuestDisplayName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized.length > 0 && normalized.length <= GUEST_NAME_MAX_LENGTH ? normalized : null;
}

export interface GuestSessionRequest {
  displayName?: string;
  guestId?: string;
  guestSecret?: string;
}

export interface GuestProfile extends PlayerProgression {
  playerId: string;
  displayName: string;
  rating: number;
  unlockAllClasses: boolean;
}

export interface GuestSessionResponse extends GuestProfile {
  guestSecret: string;
}

export function isGuestSessionResponse(value: unknown): value is GuestSessionResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GuestSessionResponse>;
  return typeof candidate.playerId === 'string' && candidate.playerId.length > 0 && candidate.playerId.length <= 100
    && typeof candidate.guestSecret === 'string' && candidate.guestSecret.length >= 32 && candidate.guestSecret.length <= 256
    && normalizeGuestDisplayName(candidate.displayName) === candidate.displayName
    && typeof candidate.rating === 'number' && Number.isFinite(candidate.rating)
    && ensureProgression(candidate);
}

export function guestProfile(playerId: string, displayName: string, rating: number, totalProgressUnits = 0, unlockAllClasses = false): GuestProfile {
  return { playerId, displayName, rating, unlockAllClasses, ...progressionForTotal(totalProgressUnits) };
}

function ensureProgression(candidate: Partial<GuestProfile>): boolean {
  if (candidate.totalProgressUnits === undefined) Object.assign(candidate, progressionForTotal(0));
  candidate.unlockAllClasses ??= false;
  if (!Number.isSafeInteger(candidate.totalProgressUnits) || (candidate.totalProgressUnits ?? -1) < 0) return false;
  const expected = progressionForTotal(candidate.totalProgressUnits!);
  return typeof candidate.unlockAllClasses === 'boolean' && candidate.level === expected.level && candidate.progressUnitsInLevel === expected.progressUnitsInLevel
    && candidate.nextUnlock === expected.nextUnlock && Array.isArray(candidate.unlockedClassIds)
    && candidate.unlockedClassIds.length === expected.unlockedClassIds.length
    && candidate.unlockedClassIds.every((id, index) => id === expected.unlockedClassIds[index]);
}
