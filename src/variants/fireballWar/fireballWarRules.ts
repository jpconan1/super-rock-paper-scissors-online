import type { PlayerId, VariantRules } from '../../core/variant';
import type { FireballWarMove } from './fireballWarTypes';

export interface FireballWarState {
  turn: number;
  charge: Record<PlayerId, number>;
  wins: Record<PlayerId, number>;
  pending: Partial<Record<PlayerId, FireballWarMove>>;
  winner?: PlayerId;
}

export interface FireballWarProjection extends Omit<FireballWarState, 'pending'> {
  ownPending?: FireballWarMove;
  opponentReady: boolean;
}

export const fireballWarRules: VariantRules<FireballWarState, FireballWarMove, FireballWarProjection, PlayerId> = {
  variantId: 'fireball-war',
  rulesVersion: 1,
  initialize: () => ({ turn: 1, charge: { p1: 0, p2: 0 }, wins: { p1: 0, p2: 0 }, pending: {} }),
  resolve(state, player, move, context) {
    if (state.winner) throw new Error('Game is complete.');
    if (!isMove(move)) throw new Error('Unknown move.');
    if (state.pending[player]) throw new Error('Player already submitted this turn.');
    if (move === 'fireball' && state.charge[player] === 0) throw new Error('Fireball requires charge.');
    const pending = { ...state.pending, [player]: move };
    if (!pending.p1 || !pending.p2) return { state: { ...state, pending } };

    const charge = { ...state.charge };
    if (pending.p1 === 'charge') charge.p1++;
    if (pending.p2 === 'charge') charge.p2++;
    if (pending.p1 === 'fireball') charge.p1--;
    if (pending.p2 === 'fireball') charge.p2--;
    const roundWinner = winnerOf(pending.p1, pending.p2);
    const wins = { ...state.wins };
    if (roundWinner) wins[roundWinner]++;
    const winner = wins.p1 >= 3 ? 'p1' : wins.p2 >= 3 ? 'p2' : undefined;
    const startsAt = context.now;
    return {
      state: { turn: state.turn + 1, charge, wins, pending: {}, ...(winner ? { winner } : {}) },
      events: [
        { type: 'reveal', startsAt, endsAt: startsAt + 800, payload: { moves: pending } },
        { type: 'score', startsAt: startsAt + 800, endsAt: startsAt + 1_400, payload: { roundWinner, wins } },
      ],
    };
  },
  project: (state, viewer) => ({
    turn: state.turn,
    charge: state.charge,
    wins: state.wins,
    ...(state.winner ? { winner: state.winner } : {}),
    ...(state.pending[viewer] ? { ownPending: state.pending[viewer] } : {}),
    opponentReady: Boolean(state.pending[viewer === 'p1' ? 'p2' : 'p1']),
  }),
  result: (state) => state.winner,
};

function isMove(value: unknown): value is FireballWarMove {
  return value === 'charge' || value === 'block' || value === 'fireball';
}

function winnerOf(p1: FireballWarMove, p2: FireballWarMove): PlayerId | undefined {
  if (p1 === p2) return undefined;
  if ((p1 === 'fireball' && p2 === 'charge') || (p1 === 'charge' && p2 === 'block') || (p1 === 'block' && p2 === 'fireball')) return 'p1';
  return 'p2';
}
