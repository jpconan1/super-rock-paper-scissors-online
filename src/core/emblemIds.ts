export type PlayerEmblem = string;
export type OwnablePlayerEmblem = string;
export type EquippedPlayerEmblem = OwnablePlayerEmblem | 'custom';

export const OWNABLE_PLAYER_EMBLEM_ORDER = [
  'beta-og', 'guma', 'new-player', 'prestige',
  'first-place', 'second-place', 'third-place', 'fourth-place', 'fifth-place',
  'sixth-place', 'seventh-place', 'eighth-place', 'ninth-place', 'tenth-place',
] as const;
export const OWNABLE_PLAYER_EMBLEM_IDS = new Set<string>(OWNABLE_PLAYER_EMBLEM_ORDER);

export function isKnownOwnablePlayerEmblem(value: unknown): value is OwnablePlayerEmblem {
  return typeof value === 'string' && OWNABLE_PLAYER_EMBLEM_IDS.has(value);
}
