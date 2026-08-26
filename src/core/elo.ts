import type { PlayerId } from './variant';

export function eloDeltas(p1Rating: number, p2Rating: number, winner: PlayerId): Record<PlayerId, number> {
  const expectedP1 = 1 / (1 + 10 ** ((p2Rating - p1Rating) / 400));
  const p1Delta = Math.round(32 * ((winner === 'p1' ? 1 : 0) - expectedP1));
  return { p1: p1Delta, p2: -p1Delta };
}
