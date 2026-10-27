import { describe, expect, test } from 'vitest';
import { emblemArtworkFrameCount, emblemArtworkSource, isOwnablePlayerEmblem, isPlayerEmblem, nextOwnedPlayerEmblem, PLAYER_EMBLEM_BY_ID } from '../src/core/playerEmblem';

describe('player emblem runtime catalog', () => {
  test('validates IDs from the code-owned catalog', () => {
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
  test('supports static images and arbitrary authored sprite counts', () => {
    expect(emblemArtworkFrameCount(PLAYER_EMBLEM_BY_ID.get('beta-og')!)).toBe(10);
    expect(emblemArtworkFrameCount(PLAYER_EMBLEM_BY_ID.get('new-player')!)).toBe(15);
    const still = { id: 'still', name: 'Still', artwork: { kind: 'image' as const, src: '/still.webp' }, ownable: true, systemOnly: false, sortOrder: 1 };
    expect(emblemArtworkFrameCount(still)).toBe(1);
    expect(emblemArtworkSource(still)).toBe('/still.webp');
  });
});
