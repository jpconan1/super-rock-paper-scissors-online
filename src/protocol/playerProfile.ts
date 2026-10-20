import { progressionForTotal, type PlayerProgression } from '../core/progression';
import { isReadablePlayerId, type PlayerAccountType } from './playerId';
import { isEquippedPlayerEmblem, isOwnablePlayerEmblem, type EquippedPlayerEmblem, type OwnablePlayerEmblem } from '../core/playerEmblem';
import { isCustomEmblemMeta, type CustomEmblemMeta } from '../core/customEmblem';

export const PLAYER_NAME_MAX_LENGTH = 24;

export function normalizePlayerDisplayName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized.length > 0 && normalized.length <= PLAYER_NAME_MAX_LENGTH ? normalized : null;
}

export interface PlayerProfile extends PlayerProgression {
  playerId: string;
  accountType: PlayerAccountType;
  displayName: string;
  rating: number;
  unlockAllClasses: boolean;
  equippedEmblem: EquippedPlayerEmblem | null;
  ownedEmblems: OwnablePlayerEmblem[];
  customEmblem?: CustomEmblemMeta | null;
}

export function isPlayerProfile(value: unknown): value is PlayerProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlayerProfile>;
  if (candidate.ownedEmblems === undefined) candidate.ownedEmblems = isOwnablePlayerEmblem(candidate.equippedEmblem) ? [candidate.equippedEmblem] : [];
  candidate.customEmblem ??= null;
  return isReadablePlayerId(candidate.playerId)
    && (candidate.accountType === 'guest' || candidate.accountType === 'google' || candidate.accountType === 'apple' || candidate.accountType === 'email')
    && normalizePlayerDisplayName(candidate.displayName) === candidate.displayName
    && typeof candidate.rating === 'number' && Number.isFinite(candidate.rating)
    && (candidate.equippedEmblem === null || isEquippedPlayerEmblem(candidate.equippedEmblem))
    && Array.isArray(candidate.ownedEmblems) && candidate.ownedEmblems.every(isOwnablePlayerEmblem)
    && (candidate.equippedEmblem === null || candidate.equippedEmblem === 'custom' || candidate.ownedEmblems.includes(candidate.equippedEmblem))
    && (candidate.customEmblem === null || isCustomEmblemMeta(candidate.customEmblem))
    && (candidate.equippedEmblem !== 'custom' || candidate.customEmblem !== null)
    && ensureProgression(candidate);
}

export function playerProfile(playerId: string, accountType: PlayerAccountType, displayName: string, rating: number, totalProgressUnits = 0,
  unlockAllClasses = false, equippedEmblem: EquippedPlayerEmblem | null = null, ownedEmblems: OwnablePlayerEmblem[] = [], customEmblem: CustomEmblemMeta | null = null): PlayerProfile {
  return { playerId, accountType, displayName, rating, unlockAllClasses, equippedEmblem, ownedEmblems, customEmblem, ...progressionForTotal(totalProgressUnits) };
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
