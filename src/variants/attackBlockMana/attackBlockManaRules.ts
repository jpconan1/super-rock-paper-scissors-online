import type { PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { ABM_CLASS_BY_ID } from './attackBlockManaCatalog';
import type {
  AbmClassId, AbmCommand, AbmMove, AbmPlayerState, AbmProjection, AbmResult, AbmState,
} from './attackBlockManaTypes';

const OTHER: Record<PlayerId, PlayerId> = { p1: 'p2', p2: 'p1' };

export const attackBlockManaRules: VariantRules<AbmState, AbmCommand, AbmProjection, AbmResult> = {
  variantId: 'attack-block-mana',
  rulesVersion: 1,
  initialize: () => ({
    phase: 'selecting-classes', turn: 0, round: 1, score: { p1: 0, p2: 0 },
    players: { p1: freshPlayer(), p2: freshPlayer() }, pendingClasses: {}, pendingMoves: {},
  }),
  resolve(state, player, command, context) {
    if (state.winner) throw new Error('Game is complete.');
    if (!command || typeof command !== 'object') throw new Error('Invalid ABM command.');
    if (command.type === 'lock-class') return lockClass(state, player, command.classId, context.now);
    if (command.type === 'choose-move') return chooseMove(state, player, command.move, context.now);
    throw new Error('Unknown ABM command.');
  },
  project(state, viewer) {
    const opponent = OTHER[viewer];
    const ownPendingClass = state.pendingClasses[viewer];
    const ownPendingMove = state.pendingMoves[viewer];
    return {
      self: viewer, phase: projectedPhase(state, viewer), turn: state.turn, round: state.round,
      score: { ...state.score }, players: clonePlayers(state.players),
      ...(ownPendingClass ? { ownPendingClass } : {}), ...(ownPendingMove ? { ownPendingMove } : {}),
      opponentReady: Boolean(state.pendingClasses[opponent] || state.pendingMoves[opponent]),
      legalActions: legalActions(state, viewer),
      ...(state.counterPicker ? { counterPicker: state.counterPicker } : {}),
      ...(state.lastRoundWinner ? { lastRoundWinner: state.lastRoundWinner } : {}),
      ...(state.winner ? { winner: state.winner } : {}),
    };
  },
  result: (state) => state.winner ? { winner: state.winner, scores: { ...state.score } } : undefined,
};

function lockClass(state: AbmState, player: PlayerId, classId: AbmClassId, now: number): VariantResolution<AbmState> {
  const definition = ABM_CLASS_BY_ID.get(classId);
  if (!definition) throw new Error('Unknown ABM class.');
  if (!definition.implemented) throw new Error(`${definition.name} is not playable yet.`);
  const selectingFirst = state.phase === 'selecting-classes' || state.phase === 'waiting-for-class';
  const counterPicking = state.phase === 'counter-picking' && state.counterPicker === player;
  if (!selectingFirst && !counterPicking) throw new Error('Class cannot be locked now.');
  if (state.pendingClasses[player]) throw new Error('Class is already locked.');

  if (counterPicking) {
    const players = clonePlayers(state.players);
    players[player] = freshPlayer(classId);
    players[OTHER[player]] = freshPlayer(players[OTHER[player]].classId);
    return {
      state: { ...state, phase: 'selecting-actions', turn: 1, players, pendingClasses: {}, pendingMoves: {}, counterPicker: undefined },
      events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })],
    };
  }

  const pendingClasses = { ...state.pendingClasses, [player]: classId };
  if (!pendingClasses.p1 || !pendingClasses.p2) return { state: { ...state, phase: 'waiting-for-class', pendingClasses } };
  const players = { p1: freshPlayer(pendingClasses.p1), p2: freshPlayer(pendingClasses.p2) };
  return {
    state: { ...state, phase: 'selecting-actions', turn: 1, players, pendingClasses: {}, pendingMoves: {} },
    events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })],
  };
}

function chooseMove(state: AbmState, player: PlayerId, move: AbmMove, now: number): VariantResolution<AbmState> {
  if (state.phase !== 'selecting-actions' && state.phase !== 'waiting-for-action') throw new Error('Move cannot be chosen now.');
  if (!isMove(move)) throw new Error('Unknown ABM move.');
  if (state.pendingMoves[player]) throw new Error('Move is already locked.');
  validateMove(state.players[player], move);
  const pendingMoves = { ...state.pendingMoves, [player]: move };
  if (!pendingMoves.p1 || !pendingMoves.p2) return { state: { ...state, phase: 'waiting-for-action', pendingMoves } };
  return resolveTurn(state, pendingMoves as Record<PlayerId, AbmMove>, now, false);
}

function resolveTurn(state: AbmState, moves: Record<PlayerId, AbmMove>, now: number, forced: boolean): VariantResolution<AbmState> {
  const players = clonePlayers(state.players);
  for (const id of ['p1', 'p2'] as const) applyMove(players[id], moves[id], state.turn, forced);
  const loser = moves.p1 === 'mana' && moves.p2 === 'attack' ? 'p1'
    : moves.p2 === 'mana' && moves.p1 === 'attack' ? 'p2' : undefined;
  const events = [cue('move-reveal', now, 800, { moves, turn: state.turn, forced })];

  if (loser) return finishRound({ ...state, players, pendingMoves: {} }, OTHER[loser], events, now + 800);

  const next = { ...state, phase: 'selecting-actions' as const, turn: state.turn + 1, players, pendingMoves: {} };
  if (players.p1.mana === 0 && players.p2.mana === 0) {
    const forcedTurn = next.turn;
    const forcedMoves = { p1: 'mana', p2: 'mana' } as const;
    const forcedPlayers = clonePlayers(players);
    applyMove(forcedPlayers.p1, 'mana', forcedTurn, true);
    applyMove(forcedPlayers.p2, 'mana', forcedTurn, true);
    events.push(cue('forced-mana', now + 800, 800, { moves: forcedMoves, turn: forcedTurn, forced: true }));
    return { state: { ...next, turn: forcedTurn + 1, players: forcedPlayers }, events };
  }
  return { state: next, events };
}

function finishRound(state: AbmState, winner: PlayerId, events: ReturnType<typeof cue>[], startsAt: number): VariantResolution<AbmState> {
  const score = { ...state.score, [winner]: state.score[winner] + 1 };
  events.push(cue('round-result', startsAt, 800, { winner, score, round: state.round }));
  if (score[winner] >= 3) {
    return { state: { ...state, phase: 'match-complete', score, winner, lastRoundWinner: winner }, events };
  }
  const loser = OTHER[winner];
  const players = clonePlayers(state.players);
  events.push(cue('counter-pick', startsAt + 800, 600, { winner, loser, classId: players[winner].classId }));
  return {
    state: {
      ...state, phase: 'counter-picking', turn: 0, round: state.round + 1, score, players,
      pendingClasses: {}, pendingMoves: {}, counterPicker: loser, lastRoundWinner: winner,
    },
    events,
  };
}

function applyMove(player: AbmPlayerState, move: AbmMove, turn: number, forced: boolean): void {
  const definition = player.classId ? ABM_CLASS_BY_ID.get(player.classId) : undefined;
  definition?.hooks.validateMove?.(move, player);
  if (move === 'attack') player.mana--;
  else if (move === 'block') player.blocks--;
  else player.mana += definition?.hooks.manaGain?.(turn, forced) ?? 1;
  if (move !== 'block') player.blocks = definition?.hooks.maximumBlocks ?? 5;
  player.lastMove = move;
}

function validateMove(player: AbmPlayerState, move: AbmMove): void {
  if (move === 'attack' && player.mana < 1) throw new Error('Attack requires 1 Mana.');
  if (move === 'block' && player.blocks < 1) throw new Error('No Blocks remain.');
}

function legalActions(state: AbmState, viewer: PlayerId) {
  if ((state.phase === 'selecting-classes' || state.phase === 'waiting-for-class') && !state.pendingClasses[viewer]) return ['lock-class'] as const;
  if (state.phase === 'counter-picking' && state.counterPicker === viewer) return ['lock-class'] as const;
  if ((state.phase === 'selecting-actions' || state.phase === 'waiting-for-action') && !state.pendingMoves[viewer]) {
    const player = state.players[viewer];
    return (['attack', 'block', 'mana'] as const).filter((move) => move !== 'attack' || player.mana > 0).filter((move) => move !== 'block' || player.blocks > 0);
  }
  return [];
}

function projectedPhase(state: AbmState, viewer: PlayerId): AbmState['phase'] {
  if (state.phase === 'waiting-for-class' && !state.pendingClasses[viewer]) return 'selecting-classes';
  if (state.phase === 'waiting-for-action' && !state.pendingMoves[viewer]) return 'selecting-actions';
  return state.phase;
}

function freshPlayer(classId?: AbmClassId): AbmPlayerState {
  const hooks = classId ? ABM_CLASS_BY_ID.get(classId)?.hooks : undefined;
  return { ...(classId ? { classId } : {}), mana: hooks?.initialMana ?? 1, blocks: hooks?.maximumBlocks ?? 5 };
}

function clonePlayers(players: Record<PlayerId, AbmPlayerState>): Record<PlayerId, AbmPlayerState> {
  return { p1: { ...players.p1 }, p2: { ...players.p2 } };
}

function classMap(players: Record<PlayerId, AbmPlayerState>) { return { p1: players.p1.classId, p2: players.p2.classId }; }
function isMove(value: unknown): value is AbmMove { return value === 'attack' || value === 'block' || value === 'mana'; }
function cue(type: 'class-reveal' | 'move-reveal' | 'forced-mana' | 'round-result' | 'counter-pick', startsAt: number, duration: number, payload: unknown) {
  return { type, startsAt, endsAt: startsAt + duration, payload } as const;
}
