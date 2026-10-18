export const PLAYER_EMBLEM_IDS = ['beta-og', 'new-player', 'computer'] as const;
export type PlayerEmblem = typeof PLAYER_EMBLEM_IDS[number];

export interface PlayerEmblemDefinition {
  id: PlayerEmblem;
  name: string;
  sheet: string;
}

export const PLAYER_EMBLEMS: readonly PlayerEmblemDefinition[] = [
  { id: 'beta-og', name: 'Beta OG', sheet: '/emblems/beta-og-sheet.webp' },
  { id: 'new-player', name: 'New Player', sheet: '/emblems/new-player-sheet.webp' },
  { id: 'computer', name: 'Computer', sheet: '/emblems/computer-sheet.webp' },
];

export const PLAYER_EMBLEM_BY_ID = new Map(PLAYER_EMBLEMS.map((emblem) => [emblem.id, emblem]));

export function isPlayerEmblem(value: unknown): value is PlayerEmblem {
  return typeof value === 'string' && PLAYER_EMBLEM_BY_ID.has(value as PlayerEmblem);
}

export function nextPlayerEmblem(emblem: PlayerEmblem): PlayerEmblem {
  const index = PLAYER_EMBLEM_IDS.indexOf(emblem);
  return PLAYER_EMBLEM_IDS[(index + 1) % PLAYER_EMBLEM_IDS.length]!;
}
