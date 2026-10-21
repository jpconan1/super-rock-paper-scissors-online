export type PlayerEmblem = string;
export type OwnablePlayerEmblem = string;
export type EquippedPlayerEmblem = OwnablePlayerEmblem | 'custom';

export interface PlayerEmblemDefinition {
  id: PlayerEmblem;
  name: string;
  sheet: string;
  frameCount?: number;
  ownable: boolean;
  systemOnly: boolean;
}

export const PLAYER_EMBLEM_BY_ID = new Map<string, PlayerEmblemDefinition>();

const CLIENT_FRAME_COUNTS: Readonly<Record<string, number>> = {
  'beta-og': 10,
};

export function isPlayerEmblemDefinition(value: unknown): value is PlayerEmblemDefinition {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PlayerEmblemDefinition>;
  return typeof item.id === 'string' && item.id.length > 0 && typeof item.name === 'string' && item.name.length > 0
    && typeof item.sheet === 'string' && item.sheet.startsWith('/')
    && (item.frameCount === undefined || (Number.isSafeInteger(item.frameCount) && item.frameCount! > 0))
    && typeof item.ownable === 'boolean' && typeof item.systemOnly === 'boolean';
}

export function setPlayerEmblemCatalog(emblems: readonly PlayerEmblemDefinition[]): void {
  PLAYER_EMBLEM_BY_ID.clear();
  for (const emblem of emblems) {
    const frameCount = CLIENT_FRAME_COUNTS[emblem.id] ?? emblem.frameCount;
    PLAYER_EMBLEM_BY_ID.set(emblem.id, frameCount === undefined ? emblem : { ...emblem, frameCount });
  }
}

export function isPlayerEmblem(value: unknown): value is PlayerEmblem {
  return typeof value === 'string' && PLAYER_EMBLEM_BY_ID.has(value);
}

export function isOwnablePlayerEmblem(value: unknown): value is OwnablePlayerEmblem {
  if (typeof value !== 'string' || value.length === 0 || value === 'custom') return false;
  return PLAYER_EMBLEM_BY_ID.size === 0 ? true : PLAYER_EMBLEM_BY_ID.get(value)?.ownable === true;
}

export function isEquippedPlayerEmblem(value: unknown): value is EquippedPlayerEmblem {
  return value === 'custom' || isOwnablePlayerEmblem(value);
}

export function nextOwnedPlayerEmblem(emblem: OwnablePlayerEmblem | null, owned: readonly OwnablePlayerEmblem[]): OwnablePlayerEmblem | null {
  const choices: readonly (OwnablePlayerEmblem | null)[] = [null, ...owned];
  const index = choices.indexOf(emblem);
  return choices[(index + 1) % choices.length] ?? null;
}
