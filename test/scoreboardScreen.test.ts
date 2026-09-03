import { describe, expect, test } from 'vitest';
import type { CompletedGame, MatchProjection } from '../src/protocol/protocol';
import { SCOREBOARD_TIEBREAKER_PLACEHOLDER, isFinalScoreboard, scoreboardCounterSource, scoreboardRows } from '../src/scoreboard/scoreboardScreen';

function projection(overrides: Partial<MatchProjection> = {}): MatchProjection {
  return {
    phase: 'scoreboard', self: 'p2',
    players: { p1: { name: 'Left', platform: 'web', rating: 1 }, p2: { name: 'Right', platform: 'web', rating: 1 } },
    picks: {}, pickOrder: ['slot-1', 'slot-2'], games: [], unavailableSlots: [], ownBans: [], opponentBanCount: 0, bansLocked: false, reconnectingPlayers: [],
    ...overrides,
  };
}

describe('scoreboard rows', () => {
  test('puts picked variants first and an unselected tiebreaker placeholder third', () => {
    expect(scoreboardRows(projection())).toEqual([
      { slotId: 'slot-1', scores: { p1: 0, p2: 0 } },
      { slotId: 'slot-2', scores: { p1: 0, p2: 0 } },
      { placeholder: true },
    ]);
    expect(SCOREBOARD_TIEBREAKER_PLACEHOLDER).toBe('/visual-elements/scoreboard/tie-breaker-placeholder-sheet.webp');
  });

  test('uses completed scores and replaces the placeholder with the active tiebreaker', () => {
    const games: CompletedGame[] = [
      { slotId: 'slot-1', winner: 'p1' as const, scores: { p1: 3, p2: 1 } },
      { slotId: 'slot-2', winner: 'p2' as const, scores: { p1: 2, p2: 3 } },
    ];
    expect(scoreboardRows(projection({ games, activeSlot: 'slot-3' }))).toEqual([
      { slotId: 'slot-1', scores: { p1: 3, p2: 1 } },
      { slotId: 'slot-2', scores: { p1: 2, p2: 3 } },
      { slotId: 'slot-3', scores: { p1: 0, p2: 0 } },
    ]);
  });

  test('omits the placeholder when a two-game match has a winner', () => {
    expect(scoreboardRows(projection({ winner: 'p1' }))).toHaveLength(2);
  });

  test('clamps score counter artwork to supported frames', () => {
    expect(scoreboardCounterSource(-1)).toContain('counter-0');
    expect(scoreboardCounterSource(2)).toContain('counter-2');
    expect(scoreboardCounterSource(9)).toContain('counter-3');
  });

  test('offers lobby exit only on a finished scoreboard', () => {
    expect(isFinalScoreboard(projection())).toBe(false);
    expect(isFinalScoreboard(projection({ phase: 'final-scoreboard', winner: 'p1' }))).toBe(true);
    expect(isFinalScoreboard(projection({ phase: 'complete', winner: 'p1', completionReason: 'played' }))).toBe(true);
    expect(isFinalScoreboard(projection({ phase: 'complete', winner: 'p1', completionReason: 'disconnect' }))).toBe(false);
  });
});
