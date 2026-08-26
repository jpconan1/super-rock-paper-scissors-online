export type LobbyPresence = 'idle' | 'ready' | 'playing-computer' | 'in-match';

export interface LobbyPlayer {
  playerId: string;
  displayName: string;
  presence: LobbyPresence;
}

export type LobbyClientMessage = { type: 'presence'; presence: LobbyPresence };
export type LobbyServerMessage =
  | { type: 'roster'; selfId: string; players: LobbyPlayer[] }
  | { type: 'error'; message: string };

export function isLobbyServerMessage(value: unknown): value is LobbyServerMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value && ['roster', 'error'].includes(String(value.type)));
}

export function isLobbyPresence(value: unknown): value is LobbyPresence {
  return ['idle', 'ready', 'playing-computer', 'in-match'].includes(String(value));
}
