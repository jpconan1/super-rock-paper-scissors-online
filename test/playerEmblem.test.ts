import { describe, expect, test } from 'vitest';
import { FREE_PLAYER_EMBLEM_IDS, isOwnablePlayerEmblem, isPlayerEmblem, nextOwnedPlayerEmblem, nextPlayerEmblem, PLAYER_EMBLEMS } from '../src/core/playerEmblem';

describe('player emblems', () => {
  test('defines the five authored emblems and their sheets', () => {
    expect(PLAYER_EMBLEMS).toEqual([
      { id: 'beta-og', name: 'Beta OG', sheet: '/emblems/beta-og-sheet.webp' },
      { id: 'new-player', name: 'New Player', sheet: '/emblems/new-player-sheet.webp' },
      { id: 'prestige', name: 'Prestige', sheet: '/emblems/prestige-sheet.webp' },
      { id: 'first-place', name: '1st Place', sheet: '/emblems/first-place-sheet.webp', frameCount: 18 },
      { id: 'computer', name: 'Computer', sheet: '/emblems/computer-sheet.webp' },
    ]);
  });

  test('validates IDs and cycles in display order', () => {
    expect(isPlayerEmblem('beta-og')).toBe(true);
    expect(isPlayerEmblem('unknown')).toBe(false);
    expect(nextPlayerEmblem('beta-og')).toBe('new-player');
    expect(nextPlayerEmblem('new-player')).toBe('prestige');
    expect(nextPlayerEmblem('prestige')).toBe('first-place');
    expect(nextPlayerEmblem('first-place')).toBe('computer');
    expect(nextPlayerEmblem('computer')).toBe('beta-og');
  });

  test('cycles only None and owned player emblems', () => {
    expect(isOwnablePlayerEmblem('computer')).toBe(false);
    expect(nextOwnedPlayerEmblem(null, [])).toBeNull();
    expect(nextOwnedPlayerEmblem(null, ['new-player'])).toBe('new-player');
    expect(nextOwnedPlayerEmblem('new-player', ['new-player'])).toBeNull();
  });

  test('makes Prestige a built-in free emblem', () => {
    expect(isOwnablePlayerEmblem('prestige')).toBe(true);
    expect(isOwnablePlayerEmblem('first-place')).toBe(true);
    expect(FREE_PLAYER_EMBLEM_IDS).toEqual(['prestige', 'first-place']);
  });
});
