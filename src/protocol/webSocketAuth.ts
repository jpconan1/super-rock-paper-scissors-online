export const LOBBY_SOCKET_PROTOCOL = 'super-rps-lobby-v1';
export const WHITEBOARD_SOCKET_PROTOCOL = 'super-rps-whiteboard-v1';
export const MATCH_SOCKET_PROTOCOL = 'super-rps-match-v1';

export function socketCredential(header: string | null, expectedProtocol: string): string | undefined {
  if (!header) return;
  const offered = header.split(',').map((value) => value.trim()).filter(Boolean);
  if (offered.length !== 2 || offered[0] !== expectedProtocol) return;
  return offered[1];
}
