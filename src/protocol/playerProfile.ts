import { progressionForTotal, type PlayerProgression } from '../core/progression';
import { isReadablePlayerId, type PlayerAccountType } from './playerId';
import { isEquippedPlayerEmblem, isOwnablePlayerEmblem, type EquippedPlayerEmblem, type OwnablePlayerEmblem } from '../core/playerEmblem';
import { isCustomEmblemMeta, type CustomEmblemMeta } from '../core/customEmblem';
import { ABM_CLASS_IDS } from '../variants/attackBlockMana/attackBlockManaTypes';

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
  prestigeCount: number;
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
    && Number.isSafeInteger(candidate.prestigeCount ?? 0) && (candidate.prestigeCount ?? 0) >= 0
    && (candidate.equippedEmblem === null || isEquippedPlayerEmblem(candidate.equippedEmblem))
    && Array.isArray(candidate.ownedEmblems) && candidate.ownedEmblems.every(isOwnablePlayerEmblem)
    && (candidate.equippedEmblem === null || candidate.equippedEmblem === 'custom' || candidate.ownedEmblems.includes(candidate.equippedEmblem))
    && (candidate.customEmblem === null || isCustomEmblemMeta(candidate.customEmblem))
    && (candidate.equippedEmblem !== 'custom' || candidate.customEmblem !== null)
    && ensureProgression(candidate);
}

export function playerProfile(playerId: string, accountType: PlayerAccountType, displayName: string, rating: number, totalProgressUnits = 0,
  unlockAllClasses = false, equippedEmblem: EquippedPlayerEmblem | null = null, ownedEmblems: OwnablePlayerEmblem[] = [], customEmblem: CustomEmblemMeta | null = null,
  prestigeCount = 0): PlayerProfile {
  const progression = progressionForTotal(totalProgressUnits);
  return { playerId, accountType, displayName, rating, unlockAllClasses, prestigeCount, equippedEmblem, ownedEmblems, customEmblem,
    ...progression, ...(prestigeCount > 0 ? { unlockedClassIds: ABM_CLASS_IDS, nextUnlock: undefined } : {}) };
}

function ensureProgression(candidate: Partial<PlayerProfile>): boolean {
  if (candidate.totalProgressUnits === undefined) Object.assign(candidate, progressionForTotal(0));
  candidate.unlockAllClasses ??= false;
  candidate.prestigeCount ??= 0;
  if (!Number.isSafeInteger(candidate.totalProgressUnits) || (candidate.totalProgressUnits ?? -1) < 0) return false;
  const expected = progressionForTotal(candidate.totalProgressUnits!);
  const expectedClasses = (candidate.prestigeCount ?? 0) > 0 ? ABM_CLASS_IDS : expected.unlockedClassIds;
  const expectedNext = (candidate.prestigeCount ?? 0) > 0 ? undefined : expected.nextUnlock;
  return typeof candidate.unlockAllClasses === 'boolean' && candidate.level === expected.level && candidate.progressUnitsInLevel === expected.progressUnitsInLevel
    && candidate.nextUnlock === expectedNext && Array.isArray(candidate.unlockedClassIds)
    && candidate.unlockedClassIds.length === expectedClasses.length
    && candidate.unlockedClassIds.every((id, index) => id === expectedClasses[index]);
}
