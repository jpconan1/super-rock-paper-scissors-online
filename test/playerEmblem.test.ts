import { describe, expect, test } from 'vitest';
import { isPlayerEmblem, nextPlayerEmblem, PLAYER_EMBLEMS } from '../src/core/playerEmblem';

describe('player emblems', () => {
  test('defines the three authored emblems and their sheets', () => {
    expect(PLAYER_EMBLEMS).toEqual([
      { id: 'beta-og', name: 'Beta OG', sheet: '/emblems/beta-og-sheet.webp' },
      { id: 'new-player', name: 'New Player', sheet: '/emblems/new-player-sheet.webp' },
      { id: 'computer', name: 'Computer', sheet: '/emblems/computer-sheet.webp' },
    ]);
  });

  test('validates IDs and cycles in display order', () => {
    expect(isPlayerEmblem('beta-og')).toBe(true);
    expect(isPlayerEmblem('unknown')).toBe(false);
    expect(nextPlayerEmblem('beta-og')).toBe('new-player');
    expect(nextPlayerEmblem('new-player')).toBe('computer');
    expect(nextPlayerEmblem('computer')).toBe('beta-og');
  });
});
