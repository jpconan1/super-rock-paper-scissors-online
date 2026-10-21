import { describe, expect, test } from 'vitest';
import { isOwnablePlayerEmblem, isPlayerEmblem, nextOwnedPlayerEmblem, PLAYER_EMBLEM_BY_ID, setPlayerEmblemCatalog } from '../src/core/playerEmblem';

describe('player emblem runtime catalog', () => {
  test('validates IDs from the server-owned catalog', () => {
    setPlayerEmblemCatalog([
      { id: 'new-player', name: 'New Player', sheet: '/emblems/new-player-sheet.webp', ownable: true, systemOnly: false },
      { id: 'computer', name: 'Computer', sheet: '/emblems/computer-sheet.webp', ownable: false, systemOnly: true },
    ]);
    expect(isPlayerEmblem('new-player')).toBe(true);
    expect(isOwnablePlayerEmblem('new-player')).toBe(true);
    expect(isOwnablePlayerEmblem('computer')).toBe(false);
    expect(isPlayerEmblem('unknown')).toBe(false);
  });
  test('cycles only None and owned emblems', () => {
    expect(nextOwnedPlayerEmblem(null, [])).toBeNull();
    expect(nextOwnedPlayerEmblem(null, ['new-player'])).toBe('new-player');
    expect(nextOwnedPlayerEmblem('new-player', ['new-player'])).toBeNull();
  });
  test('uses the authored Beta OG frame count without a server migration', () => {
    setPlayerEmblemCatalog([
      { id: 'beta-og', name: 'Beta OG', sheet: '/emblems/beta-og-sheet.webp', ownable: true, systemOnly: false },
    ]);
    expect(PLAYER_EMBLEM_BY_ID.get('beta-og')?.frameCount).toBe(10);
  });
});
