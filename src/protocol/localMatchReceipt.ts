export type LocalMatchKind = 'tutorial' | 'computer';

export interface LocalMatchGrant {
  receipt: string;
  kind: LocalMatchKind;
  issuedAt: number;
  expiresAt: number;
}

export interface StoredLocalMatchGrant {
  playerId: string;
  kind: LocalMatchKind;
  issuedAt: number;
  expiresAt: number;
  claimedAt: number | null;
}

export type LocalMatchGrantProblem = 'unknown' | 'wrong-player' | 'wrong-kind' | 'premature' | 'expired' | 'claimed';

export const LOCAL_MATCH_MINIMUM_MS = 15_000;
export const LOCAL_MATCH_GRANT_TTL_MS = 30 * 60_000;
export const LOCAL_MATCH_FULL_AWARDS_PER_HOUR = 30;
export const LOCAL_MATCH_AWARD_WINDOW_MS = 60 * 60_000;

export function localMatchGrantProblem(
  grant: StoredLocalMatchGrant | undefined,
  playerId: string,
  kind: LocalMatchKind,
  now: number,
): LocalMatchGrantProblem | undefined {
  if (!grant) return 'unknown';
  if (grant.playerId !== playerId) return 'wrong-player';
  if (grant.kind !== kind) return 'wrong-kind';
  if (now < grant.issuedAt + LOCAL_MATCH_MINIMUM_MS) return 'premature';
  if (now > grant.expiresAt) return 'expired';
  if (grant.claimedAt !== null) return 'claimed';
  return undefined;
}

export function hasFullLocalMatchAwardAllowance(recentFullAwards: number): boolean {
  return recentFullAwards < LOCAL_MATCH_FULL_AWARDS_PER_HOUR;
}
