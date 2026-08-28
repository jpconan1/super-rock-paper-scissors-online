import type { DeterministicContext, PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { beats, STARBURST_WIPE_MS } from '../../core/time';
import { ABM_CLASS_BY_ID } from './attackBlockManaCatalog';
import type { AbmClassId, AbmCommand, AbmMove, AbmPlayerState, AbmProjection, AbmResult, AbmState } from './attackBlockManaTypes';

const OTHER: Record<PlayerId, PlayerId> = { p1: 'p2', p2: 'p1' };
export const ABM_READY_SPLIT_MS = 3 * 58;
export const ABM_WAITING_MS = 30_000;
export const ABM_LETHAL_TO_RESULT_MS = STARBURST_WIPE_MS + beats(1);
export const ABM_RESULT_TO_COUNTER_PICK_MS = STARBURST_WIPE_MS + beats(2);

export const attackBlockManaRules: VariantRules<AbmState, AbmCommand, AbmProjection, AbmResult> = {
  variantId: 'attack-block-mana', rulesVersion: 1,
  initialize: () => ({
    phase: 'selecting-classes', turn: 0, round: 1, score: { p1: 0, p2: 0 },
    players: { p1: freshPlayer(), p2: freshPlayer() }, pendingClasses: {}, pendingMoves: {},
  }),
  resolve(state, player, command, context) {
    if (state.winner) throw new Error('Game is complete.');
    if (!command || typeof command !== 'object') throw new Error('Invalid ABM command.');
    if (command.type === 'lock-class') return lockClass(state, player, command.classId, context.now);
    if (command.type === 'choose-move') return chooseMove(state, player, command.move, context);
    throw new Error('Unknown ABM command.');
  },
  nextDeadline: (state) => state.phase === 'waiting' ? state.waitingDeadlineAt : undefined,
  advanceDeadline(state, context) {
    if (state.phase !== 'waiting' || state.waitingDeadlineAt === undefined || context.now < state.waitingDeadlineAt) return undefined;
    return resolveTimeout(state, context.now);
  },
  project(state, viewer) {
    const opponent = OTHER[viewer];
    const ownPendingClass = state.pendingClasses[viewer];
    const ownPendingMove = state.pendingMoves[viewer];
    return {
      self: viewer, phase: projectedPhase(state, viewer), turn: state.turn, round: state.round,
      score: { ...state.score }, players: clonePlayers(state.players),
      ...(ownPendingClass ? { ownPendingClass } : {}), ...(ownPendingMove ? { ownPendingMove } : {}),
      ...(state.classReadyPlayer ? { classReadyPlayer: state.classReadyPlayer } : {}),
      ...(state.classReadyAt !== undefined ? { classReadyAt: state.classReadyAt } : {}),
      opponentReady: Boolean(state.pendingClasses[opponent] || state.pendingMoves[opponent]),
      legalActions: legalActions(state, viewer),
      ...(state.lastCompleteMoves ? { lastCompleteMoves: { ...state.lastCompleteMoves } } : {}),
      ...(state.luckyProcPlayer ? { luckyProcPlayer: state.luckyProcPlayer } : {}),
      ...(state.earlyPlayer ? { earlyPlayer: state.earlyPlayer } : {}), ...(state.latePlayer ? { latePlayer: state.latePlayer } : {}),
      ...(state.waitingStartsAt !== undefined ? { waitingStartsAt: state.waitingStartsAt } : {}),
      ...(state.waitingDeadlineAt !== undefined ? { waitingDeadlineAt: state.waitingDeadlineAt } : {}),
      ...(state.heldSplitFor ? { heldSplitFor: state.heldSplitFor } : {}),
      ...(state.counterPicker ? { counterPicker: state.counterPicker } : {}),
      ...(state.counterPickAvailableAt ? { counterPickAvailableAt: state.counterPickAvailableAt } : {}),
      ...(state.resultRevealAt ? { resultRevealAt: state.resultRevealAt } : {}),
      ...(state.lastRoundWinner ? { lastRoundWinner: state.lastRoundWinner } : {}),
      ...(state.winner ? { winner: state.winner } : {}), ...(state.resultReason ? { resultReason: state.resultReason } : {}),
    };
  },
  result: (state) => state.winner ? {
    winner: state.winner, scores: { ...state.score }, ...(state.resultReason ? { reason: state.resultReason } : {}),
  } : undefined,
};

function lockClass(state: AbmState, player: PlayerId, classId: AbmClassId, now: number): VariantResolution<AbmState> {
  const definition = ABM_CLASS_BY_ID.get(classId);
  if (!definition) throw new Error('Unknown ABM class.');
  if (!definition.implemented) throw new Error(`${definition.name} is not playable yet.`);
  const selectingFirst = state.phase === 'selecting-classes' || state.phase === 'waiting-for-class';
  const counterPicking = state.phase === 'counter-picking' && state.counterPicker === player;
  if (!selectingFirst && !counterPicking) throw new Error('Class cannot be locked now.');
  if (counterPicking && state.counterPickAvailableAt !== undefined && now < state.counterPickAvailableAt) throw new Error('Counter-pick is not available yet.');
  if (state.pendingClasses[player]) throw new Error('Class is already locked.');

  if (counterPicking) {
    const players = clonePlayers(state.players);
    players[player] = resetPlayer(players[player], classId);
    players[OTHER[player]] = resetPlayer(players[OTHER[player]], players[OTHER[player]].classId);
    return {
      state: { ...state, phase: 'idle', turn: 1, players, pendingClasses: {}, pendingMoves: {}, counterPicker: undefined,
        counterPickAvailableAt: undefined, resultRevealAt: undefined, lastCompleteMoves: undefined, heldSplitFor: undefined, luckyProcPlayer: undefined },
      events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })],
    };
  }

  const pendingClasses = { ...state.pendingClasses, [player]: classId };
  if (!pendingClasses.p1 || !pendingClasses.p2) return {
    state: { ...state, phase: 'waiting-for-class', pendingClasses, classReadyPlayer: player, classReadyAt: now },
    events: [cue('class-ready', now, 7 * 58, { player })],
  };
  const players = { p1: freshPlayer(pendingClasses.p1), p2: freshPlayer(pendingClasses.p2) };
  return { state: { ...state, phase: 'idle', turn: 1, players, pendingClasses: {}, pendingMoves: {}, classReadyPlayer: undefined, classReadyAt: undefined },
    events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })] };
}

function chooseMove(state: AbmState, player: PlayerId, move: AbmMove, context: DeterministicContext): VariantResolution<AbmState> {
  const { now } = context;
  if (!isActionPhase(state.phase)) throw new Error('Move cannot be chosen now.');
  if (!isMove(move)) throw new Error('Unknown ABM move.');
  if (state.pendingMoves[player]) throw new Error('Move is already locked.');
  const forcedMana = bothPlayersHaveNoMana(state);
  if (forcedMana && move !== 'mana') throw new Error('Mana is the only move available at 0–0 Mana.');
  validateMove(state.players[player], move);
  const pendingMoves = { ...state.pendingMoves, [player]: move };
  if (!pendingMoves.p1 || !pendingMoves.p2) {
    const earlyPlayer = player;
    const waitingStartsAt = now + ABM_READY_SPLIT_MS;
    const waitingDeadlineAt = waitingStartsAt + ABM_WAITING_MS;
    return { state: { ...state, phase: 'waiting', pendingMoves, earlyPlayer, latePlayer: OTHER[player], waitingStartsAt, waitingDeadlineAt },
      events: [cue('move-ready', now, ABM_READY_SPLIT_MS + ABM_WAITING_MS, { earlyPlayer, waitingStartsAt, waitingDeadlineAt })] };
  }
  return resolveTurn(clearWaiting(state), pendingMoves as Record<PlayerId, AbmMove>, context, forcedMana);
}

function resolveTurn(state: AbmState, moves: Record<PlayerId, AbmMove>, context: DeterministicContext, forced: boolean): VariantResolution<AbmState> {
  const { now } = context;
  const players = clonePlayers(state.players);
  for (const id of ['p1', 'p2'] as const) applyMove(players[id], moves[id]);
  const loser: PlayerId | undefined = moves.p1 === 'mana' && moves.p2 === 'attack' ? 'p1' : moves.p2 === 'mana' && moves.p1 === 'attack' ? 'p2' : undefined;
  const luckyProcPlayer = loser && players[loser].classId === 'lucky' && context.random() < 0.25 ? loser : undefined;
  const defeatedPlayer = luckyProcPlayer ? undefined : loser;
  const revealDuration = defeatedPlayer ? ABM_LETHAL_TO_RESULT_MS : 800;
  const events = [cue('move-reveal', now, revealDuration, { moves, turn: state.turn, forced })];
  const revealed = { ...state, players, pendingMoves: {}, lastCompleteMoves: moves, heldSplitFor: undefined, luckyProcPlayer };
  if (defeatedPlayer) return finishRound(revealed, OTHER[defeatedPlayer], events, now + revealDuration);
  return { state: { ...revealed, phase: 'idle', turn: state.turn + 1 }, events };
}

function resolveTimeout(state: AbmState, now: number): VariantResolution<AbmState> {
  const early = state.earlyPlayer!; const late = state.latePlayer!; const move = state.pendingMoves[early]!;
  const players = clonePlayers(state.players);
  applyMove(players[early], move);
  players[late].mana = Math.max(0, players[late].mana - 1);
  players[late].strikes = (players[late].strikes ?? 0) + 1;
  players[late].lastMove = 'skip';
  const revealDuration = move === 'attack' || players[late].strikes >= 2 ? ABM_LETHAL_TO_RESULT_MS : 800;
  const events = [cue('move-timeout', now, revealDuration, { earlyPlayer: early, latePlayer: late, move, strikes: players[late].strikes, turn: state.turn })];
  const timedOut = { ...clearWaiting(state), players, pendingMoves: {}, heldSplitFor: early };
  if (players[late].strikes >= 2) return { state: { ...timedOut, phase: 'match-complete', winner: early, resultReason: 'forfeit', resultRevealAt: now + revealDuration }, events };
  if (move === 'attack') return finishRound(timedOut, early, events, now + revealDuration);
  return { state: { ...timedOut, phase: 'idle', turn: state.turn + 1 }, events };
}

function finishRound(state: AbmState, winner: PlayerId, events: ReturnType<typeof cue>[], startsAt: number): VariantResolution<AbmState> {
  const score = { ...state.score, [winner]: state.score[winner] + 1 };
  events.push(cue('round-result', startsAt, ABM_RESULT_TO_COUNTER_PICK_MS, { winner, score, round: state.round }));
  if (score[winner] >= 3) return { state: { ...state, phase: 'match-complete', score, winner, lastRoundWinner: winner, resultRevealAt: startsAt }, events };
  const loser = OTHER[winner];
  events.push(cue('counter-pick', startsAt + ABM_RESULT_TO_COUNTER_PICK_MS, 600, { winner, loser, classId: state.players[winner].classId }));
  return { state: { ...state, phase: 'counter-picking', turn: 0, round: state.round + 1, score, pendingClasses: {}, pendingMoves: {},
    counterPicker: loser, counterPickAvailableAt: startsAt + ABM_RESULT_TO_COUNTER_PICK_MS, resultRevealAt: startsAt, lastRoundWinner: winner }, events };
}

function applyMove(player: AbmPlayerState, move: AbmMove, record = true): void {
  if (move === 'attack') player.mana--; else if (move === 'block') player.blocks--; else player.mana++;
  if (move !== 'block') player.blocks = 5;
  if (record) player.lastMove = move;
}
function validateMove(player: AbmPlayerState, move: AbmMove): void {
  if (move === 'attack' && player.mana < 1) throw new Error('Attack requires 1 Mana.');
  if (move === 'block' && player.blocks < 1) throw new Error('No Blocks remain.');
}
function legalActions(state: AbmState, viewer: PlayerId) {
  if ((state.phase === 'selecting-classes' || state.phase === 'waiting-for-class') && !state.pendingClasses[viewer]) return ['lock-class'] as const;
  if (state.phase === 'counter-picking' && state.counterPicker === viewer) return ['lock-class'] as const;
  if (isActionPhase(state.phase) && !state.pendingMoves[viewer]) {
    if (bothPlayersHaveNoMana(state)) return ['mana'] as const;
    const target = state.players[viewer];
    return (['attack', 'block', 'mana'] as const).filter((move) => move !== 'attack' || target.mana > 0).filter((move) => move !== 'block' || target.blocks > 0);
  }
  return [];
}
function projectedPhase(state: AbmState, viewer: PlayerId): AbmState['phase'] {
  if (state.phase === 'waiting-for-class' && !state.pendingClasses[viewer]) return 'selecting-classes';
  return state.phase;
}
function freshPlayer(classId?: AbmClassId): AbmPlayerState { return { ...(classId ? { classId } : {}), mana: 1, blocks: 5, strikes: 0 }; }
function resetPlayer(player: AbmPlayerState, classId?: AbmClassId): AbmPlayerState { return { ...(classId ? { classId } : {}), mana: 1, blocks: 5, strikes: player.strikes ?? 0 }; }
function clearWaiting(state: AbmState): AbmState { return { ...state, earlyPlayer: undefined, latePlayer: undefined, waitingStartsAt: undefined, waitingDeadlineAt: undefined }; }
function clonePlayers(players: Record<PlayerId, AbmPlayerState>): Record<PlayerId, AbmPlayerState> { return { p1: { ...players.p1 }, p2: { ...players.p2 } }; }
function classMap(players: Record<PlayerId, AbmPlayerState>) { return { p1: players.p1.classId, p2: players.p2.classId }; }
function isMove(value: unknown): value is AbmMove { return value === 'attack' || value === 'block' || value === 'mana'; }
function bothPlayersHaveNoMana(state: AbmState): boolean { return state.players.p1.mana === 0 && state.players.p2.mana === 0; }
function isActionPhase(phase: AbmState['phase']): boolean { return ['idle', 'waiting', 'selecting-actions', 'waiting-for-action'].includes(phase as string); }
function cue(type: 'class-ready' | 'class-reveal' | 'move-ready' | 'move-reveal' | 'move-timeout' | 'forced-mana' | 'round-result' | 'counter-pick', startsAt: number, duration: number, payload: unknown) {
  return { type, startsAt, endsAt: startsAt + duration, payload } as const;
}
