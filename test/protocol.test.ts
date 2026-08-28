import { describe, expect, test } from 'vitest';
import { parseClientCommand, PROTOCOL_VERSION } from '../src/protocol/protocol';
import { LOBBY_SOCKET_PROTOCOL, socketCredential } from '../src/protocol/webSocketAuth';

describe('protocol validation', () => {
  test('accepts a valid versioned command', () => {
    expect(parseClientCommand({ protocolVersion: PROTOCOL_VERSION, commandId: '1', matchId: 'm', expectedRevision: 0, type: 'move', payload: {} }).matchId).toBe('m');
  });

  test('rejects unsupported versions and invalid revisions', () => {
    expect(() => parseClientCommand({ protocolVersion: 2 })).toThrow('Unsupported protocol version');
    expect(() => parseClientCommand({ protocolVersion: 1, commandId: '1', matchId: 'm', expectedRevision: -1, type: 'move' })).toThrow('expectedRevision');
  });
});

describe('WebSocket authentication protocols', () => {
  test('extracts only a credential paired with the expected public protocol', () => {
    expect(socketCredential(`${LOBBY_SOCKET_PROTOCOL}, private-secret`, LOBBY_SOCKET_PROTOCOL)).toBe('private-secret');
    expect(socketCredential('wrong-protocol, private-secret', LOBBY_SOCKET_PROTOCOL)).toBeUndefined();
    expect(socketCredential(`${LOBBY_SOCKET_PROTOCOL}, secret, extra`, LOBBY_SOCKET_PROTOCOL)).toBeUndefined();
    expect(socketCredential(null, LOBBY_SOCKET_PROTOCOL)).toBeUndefined();
  });
});
