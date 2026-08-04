import {
  createFireballWarState,
  getLegalFireballMoves,
  resolveFireballWarTurn,
  type FireballMove,
  type FireballWarState,
  type PlayerId,
} from '../variants/fireballWar/rules';

export interface FireballWarSnapshot {
  revision: number;
  state: FireballWarState;
  legalMoves: readonly FireballMove[];
  lastMoves: Record<PlayerId, FireballMove> | null;
}

export interface FireballWarAuthority {
  getSnapshot(): FireballWarSnapshot;
  submitMove(move: FireballMove, expectedRevision: number): Promise<FireballWarSnapshot>;
  restart(): FireballWarSnapshot;
}

const OPPONENT_SEQUENCE: readonly FireballMove[] = ['charge', 'block', 'fireball'];

export function createLocalFireballMatch(): FireballWarAuthority {
  let revision = 0;
  let state = createFireballWarState();
  let lastMoves: Record<PlayerId, FireballMove> | null = null;

  function snapshot(): FireballWarSnapshot {
    return structuredClone({
      revision,
      state,
      legalMoves: getLegalFireballMoves(state, 'p1'),
      lastMoves,
    });
  }

  return {
    getSnapshot: snapshot,
    async submitMove(move, expectedRevision) {
      if (expectedRevision !== revision) throw new Error('That turn is no longer current.');
      if (!getLegalFireballMoves(state, 'p1').includes(move)) throw new Error('Illegal move.');
      const opponentLegal = getLegalFireballMoves(state, 'p2');
      const preferred = OPPONENT_SEQUENCE[state.turn % OPPONENT_SEQUENCE.length];
      const opponentMove = preferred && opponentLegal.includes(preferred) ? preferred : opponentLegal[0];
      if (!opponentMove) throw new Error('Opponent has no legal move.');
      lastMoves = { p1: move, p2: opponentMove };
      state = resolveFireballWarTurn(state, lastMoves).state;
      revision++;
      return snapshot();
    },
    restart() {
      state = createFireballWarState();
      lastMoves = null;
      revision++;
      return snapshot();
    },
  };
}
