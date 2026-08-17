import type { PlayerId, VariantGameResult, VariantRules } from '../../core/variant';

export type DummyMove = 'charge' | 'block' | 'fireball';
export interface DummyState { pending: Partial<Record<PlayerId, DummyMove>>; result?: VariantGameResult }
export interface DummyProjection {
  ownMove?: DummyMove;
  ready: Record<PlayerId, boolean>;
  result?: VariantGameResult;
}

export const dummyRules: VariantRules<DummyState, DummyMove, DummyProjection, VariantGameResult> = {
  variantId: 'dummy',
  rulesVersion: 1,
  initialize: () => ({ pending: {} }),
  resolve(state, player, move, context) {
    if (state.result) throw new Error('Game is complete.');
    if (!isDummyMove(move)) throw new Error('Unknown move.');
    if (state.pending[player]) throw new Error('Player already submitted.');
    const pending = { ...state.pending, [player]: move };
    const other: PlayerId = player === 'p1' ? 'p2' : 'p1';
    if (!pending[other]) {
      return {
        state: { pending },
        events: [{ type: 'ready', startsAt: context.now, endsAt: context.now + 86_400_000, payload: { player } }],
      };
    }
    const winner: PlayerId = context.random() < 0.5 ? 'p1' : 'p2';
    const loser: PlayerId = winner === 'p1' ? 'p2' : 'p1';
    const losingScore = Math.floor(context.random() * 5);
    const winningScore = losingScore + 1 + Math.floor(context.random() * (5 - losingScore));
    const result: VariantGameResult = { winner, scores: { p1: 0, p2: 0 } };
    result.scores[winner] = winningScore;
    result.scores[loser] = losingScore;
    return {
      state: { pending, result },
      events: [{ type: 'score', startsAt: context.now, endsAt: context.now + 600, payload: result }],
    };
  },
  project: (state, viewer) => ({
    ...(state.pending[viewer] ? { ownMove: state.pending[viewer] } : {}),
    ready: { p1: Boolean(state.pending.p1), p2: Boolean(state.pending.p2) },
    ...(state.result ? { result: state.result } : {}),
  }),
  result: (state) => state.result,
};

export function isDummyMove(value: unknown): value is DummyMove {
  return value === 'charge' || value === 'block' || value === 'fireball';
}
