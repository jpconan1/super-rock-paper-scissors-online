import type { PlayerId } from '../core/variant';
import type { AbmClassId, AbmDisplayMove, AbmMove, AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';

export type PreviousMoveChoice = AbmDisplayMove | 'none';

export function createPreviousMoveProjection(
  viewer: PlayerId,
  moves: Readonly<Record<PlayerId, PreviousMoveChoice>>,
  classes: Readonly<Record<PlayerId, AbmClassId>> = { p1: 'advantaged', p2: 'thief' },
): AbmProjection {
  const completeMoves = moves.p1 !== 'none' && moves.p1 !== 'skip' && moves.p2 !== 'none' && moves.p2 !== 'skip'
    ? { p1: moves.p1 as AbmMove, p2: moves.p2 as AbmMove }
    : undefined;
  return {
    self: viewer, phase: 'idle', turn: 4, round: 2, score: { p1: 1, p2: 0 }, opponentReady: false,
    legalActions: ['attack', 'block', 'mana'], ...(completeMoves ? { lastCompleteMoves: completeMoves } : {}),
    players: {
      p1: { classId: classes.p1, mana: 3, blocks: 4, strikes: 0, ...(moves.p1 === 'none' ? {} : { lastMove: moves.p1 }) },
      p2: { classId: classes.p2, mana: 6, blocks: 2, strikes: 1, ...(moves.p2 === 'none' ? {} : { lastMove: moves.p2 }) },
    },
  };
}
