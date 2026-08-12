import { describe, expect, test } from 'vitest';
import { parseClientCommand, PROTOCOL_VERSION } from '../src/protocol/protocol';

describe('protocol validation', () => {
  test('accepts a valid versioned command', () => {
    expect(parseClientCommand({ protocolVersion: PROTOCOL_VERSION, commandId: '1', matchId: 'm', expectedRevision: 0, type: 'move', payload: {} }).matchId).toBe('m');
  });

  test('rejects unsupported versions and invalid revisions', () => {
    expect(() => parseClientCommand({ protocolVersion: 2 })).toThrow('Unsupported protocol version');
    expect(() => parseClientCommand({ protocolVersion: 1, commandId: '1', matchId: 'm', expectedRevision: -1, type: 'move' })).toThrow('expectedRevision');
  });
});
