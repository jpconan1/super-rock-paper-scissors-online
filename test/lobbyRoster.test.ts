import { describe, expect, test } from 'vitest';
import { orderLobbyPlayers } from '../src/app/shellScreens';
import type { LobbyPlayer } from '../src/lobby/protocol';

describe('lobby roster', () => {
  test('orders self, ready, idle, then busy players alphabetically within groups', () => {
    const players: LobbyPlayer[] = [
      { playerId: 'match', displayName: 'Delta', presence: 'in-match' },
      { playerId: 'idle-b', displayName: 'Charlie', presence: 'idle' },
      { playerId: 'ready-b', displayName: 'Bravo', presence: 'ready' },
      { playerId: 'self', displayName: 'Zulu', presence: 'playing-computer' },
      { playerId: 'ready-a', displayName: 'Alpha', presence: 'ready' },
      { playerId: 'idle-a', displayName: 'Able', presence: 'idle' },
    ];
    expect(orderLobbyPlayers(players, 'self').map((player) => player.playerId)).toEqual([
      'self', 'ready-a', 'ready-b', 'idle-a', 'idle-b', 'match',
    ]);
  });
});
