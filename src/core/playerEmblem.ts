import { isKnownOwnablePlayerEmblem, type EquippedPlayerEmblem, type OwnablePlayerEmblem, type PlayerEmblem } from './emblemIds';
export type { EquippedPlayerEmblem, OwnablePlayerEmblem, PlayerEmblem } from './emblemIds';

export type PlayerEmblemArtwork =
  | { kind: 'image'; src: string }
  | { kind: 'sprite-sheet'; src: string; frameCount: number };

export interface PlayerEmblemDefinition {
  id: PlayerEmblem;
  name: string;
  artwork: PlayerEmblemArtwork;
  ownable: boolean;
  systemOnly: boolean;
  sortOrder: number;
}

export const PLAYER_EMBLEM_CATALOG: readonly PlayerEmblemDefinition[] = [
  { id: 'beta-og', name: 'Beta OG', artwork: { kind: 'sprite-sheet', src: '/emblems/beta-og-sheet.webp', frameCount: 10 }, ownable: true, systemOnly: false, sortOrder: 10 },
  { id: 'new-player', name: 'New Player', artwork: { kind: 'sprite-sheet', src: '/emblems/new-player-sheet.webp', frameCount: 15 }, ownable: true, systemOnly: false, sortOrder: 20 },
  { id: 'prestige', name: 'Prestige', artwork: { kind: 'sprite-sheet', src: '/emblems/prestige-sheet.webp', frameCount: 3 }, ownable: true, systemOnly: false, sortOrder: 30 },
  ...(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'] as const).map((place, index) => ({
    id: `${place}-place`, name: `${index + 1}${index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'} Place`,
    artwork: { kind: 'sprite-sheet' as const, src: `/emblems/${place}-place-sheet.webp`, frameCount: 18 },
    ownable: true, systemOnly: false, sortOrder: 40 + index,
  })),
  { id: 'computer', name: 'Computer', artwork: { kind: 'sprite-sheet', src: '/emblems/computer-sheet.webp', frameCount: 3 }, ownable: false, systemOnly: true, sortOrder: 100 },
];

export const PLAYER_EMBLEM_BY_ID = new Map(PLAYER_EMBLEM_CATALOG.map((emblem) => [emblem.id, emblem]));

export function isPlayerEmblem(value: unknown): value is PlayerEmblem {
  return typeof value === 'string' && PLAYER_EMBLEM_BY_ID.has(value);
}

export function isOwnablePlayerEmblem(value: unknown): value is OwnablePlayerEmblem {
  return isKnownOwnablePlayerEmblem(value) && PLAYER_EMBLEM_BY_ID.get(value)?.ownable === true;
}

export function isEquippedPlayerEmblem(value: unknown): value is EquippedPlayerEmblem {
  return value === 'custom' || isOwnablePlayerEmblem(value);
}

export function emblemArtworkSource(definition: PlayerEmblemDefinition): string { return definition.artwork.src; }
export function emblemArtworkFrameCount(definition: PlayerEmblemDefinition): number { return definition.artwork.kind === 'image' ? 1 : definition.artwork.frameCount; }

export function nextOwnedPlayerEmblem(emblem: OwnablePlayerEmblem | null, owned: readonly OwnablePlayerEmblem[]): OwnablePlayerEmblem | null {
  const choices: readonly (OwnablePlayerEmblem | null)[] = [null, ...owned];
  const index = choices.indexOf(emblem);
  return choices[(index + 1) % choices.length] ?? null;
}
