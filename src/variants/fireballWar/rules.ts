export const FIREBALL_WAR_ID = 'fireball-war';
export const FIREBALL_WAR_RULES_VERSION = 1;
export const FIREBALL_WAR_MAX_CHARGE = 3;

export type PlayerId = 'p1' | 'p2';
export type FireballMove = 'charge' | 'block' | 'fireball';

export interface FireballWarState {
  turn: number;
  resources: Record<PlayerId, number>;
  winner: PlayerId | null;
}

export interface FireballWarTurnResult {
  state: FireballWarState;
  moves: Record<PlayerId, FireballMove>;
  hit: PlayerId | null;
}

export function createFireballWarState(): FireballWarState {
  return { turn: 0, resources: { p1: 1, p2: 1 }, winner: null };
}

export function getLegalFireballMoves(
  state: FireballWarState,
  player: PlayerId,
): readonly FireballMove[] {
  if (state.winner) return [];
  const opponent = player === 'p1' ? 'p2' : 'p1';
  const resource = state.resources[player];
  const opponentResource = state.resources[opponent];
  const moves: FireballMove[] = [];
  if (resource < FIREBALL_WAR_MAX_CHARGE) moves.push('charge');
  if (opponentResource > 0) moves.push('block');
  if (resource > 0) moves.push('fireball');
  return moves;
}

export function resolveFireballWarTurn(
  state: FireballWarState,
  moves: Record<PlayerId, FireballMove>,
): FireballWarTurnResult {
  if (state.winner) throw new Error('Fireball War round is already over.');
  for (const player of ['p1', 'p2'] as const) {
    if (!getLegalFireballMoves(state, player).includes(moves[player])) {
      throw new Error(`${player} cannot play ${moves[player]} in this state.`);
    }
  }

  const hit = moves.p1 === 'fireball' && moves.p2 === 'charge'
    ? 'p1'
    : moves.p2 === 'fireball' && moves.p1 === 'charge'
      ? 'p2'
      : null;
  const resources = {
    p1: updateResource(state.resources.p1, moves.p1),
    p2: updateResource(state.resources.p2, moves.p2),
  };
  let winner: PlayerId | null = hit;

  if (!winner) {
    const p1ReachedMax = state.resources.p1 < FIREBALL_WAR_MAX_CHARGE
      && resources.p1 === FIREBALL_WAR_MAX_CHARGE;
    const p2ReachedMax = state.resources.p2 < FIREBALL_WAR_MAX_CHARGE
      && resources.p2 === FIREBALL_WAR_MAX_CHARGE;
    if (p1ReachedMax !== p2ReachedMax) winner = p1ReachedMax ? 'p1' : 'p2';
    else if (p1ReachedMax && p2ReachedMax) {
      resources.p1--;
      resources.p2--;
    }
  }

  return {
    moves,
    hit,
    state: { turn: state.turn + 1, resources, winner },
  };
}

function updateResource(resource: number, move: FireballMove): number {
  if (move === 'charge') return Math.min(FIREBALL_WAR_MAX_CHARGE, resource + 1);
  if (move === 'fireball') return resource - 1;
  return resource;
}
