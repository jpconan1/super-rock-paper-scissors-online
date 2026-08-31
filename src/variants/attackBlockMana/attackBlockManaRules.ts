import type { DeterministicContext, PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { beats, STARBURST_WIPE_MS } from '../../core/time';
import { ABM_CLASS_BY_ID } from './attackBlockManaCatalog';
import type { AbmClassId, AbmCommand, AbmMove, AbmPlayerState, AbmProjection, AbmResult, AbmState } from './attackBlockManaTypes';

const OTHER: Record<PlayerId, PlayerId> = { p1: 'p2', p2: 'p1' };
const MAX_MANA = 9;
const MAX_STUNNED_ATTACK_COST = 8;
export const ABM_READY_SPLIT_MS = 3 * 58;
export const ABM_WAITING_MS = 30_000;
export const ABM_LETHAL_TO_RESULT_MS = STARBURST_WIPE_MS + beats(1);
export const ABM_RESULT_TO_COUNTER_PICK_MS = STARBURST_WIPE_MS + beats(2);

export const attackBlockManaRules: VariantRules<AbmState, AbmCommand, AbmProjection, AbmResult> = {
  variantId: 'attack-block-mana', rulesVersion: 1,
  initialize: () => ({
    phase: 'selecting-classes', turn: 0, round: 1, score: { p1: 0, p2: 0 },
    players: { p1: freshPlayer(), p2: freshPlayer() }, pendingClasses: {}, pendingMoves: {}, pendingSteals: {},
  }),
  resolve(state, player, command, context) {
    if (state.winner) throw new Error('Game is complete.');
    if (!command || typeof command !== 'object') throw new Error('Invalid ABM command.');
    if (command.type === 'lock-class') return lockClass(state, player, command.classId, context.now);
    if (command.type === 'choose-move') return chooseMove(state, player, command.move, command.useSteal, context);
    throw new Error('Unknown ABM command.');
  },
  nextDeadline: (state) => state.phase === 'waiting' ? state.waitingDeadlineAt : undefined,
  advanceDeadline(state, context) {
    if (state.phase !== 'waiting' || state.waitingDeadlineAt === undefined || context.now < state.waitingDeadlineAt) return undefined;
    return resolveTimeout(state, context);
  },
  project(state, viewer) {
    const opponent = OTHER[viewer];
    const ownPendingClass = state.pendingClasses[viewer];
    const ownPendingMove = state.pendingMoves[viewer];
    const ownPendingSteal = state.pendingSteals?.[viewer];
    return {
      self: viewer, phase: projectedPhase(state, viewer), turn: state.turn, round: state.round,
      score: { ...state.score }, players: clonePlayers(state.players),
      ...(ownPendingClass ? { ownPendingClass } : {}), ...(ownPendingMove ? { ownPendingMove } : {}),
      ...(ownPendingSteal ? { ownPendingSteal } : {}),
      ...(state.classReadyPlayer ? { classReadyPlayer: state.classReadyPlayer } : {}),
      ...(state.classReadyAt !== undefined ? { classReadyAt: state.classReadyAt } : {}),
      opponentReady: Boolean(state.pendingClasses[opponent] || state.pendingMoves[opponent]),
      legalActions: legalActions(state, viewer),
      ...(state.lastCompleteMoves ? { lastCompleteMoves: { ...state.lastCompleteMoves } } : {}),
      ...(state.luckyProcPlayer ? { luckyProcPlayer: state.luckyProcPlayer } : {}),
      ...(state.advantagedProcPlayers?.length ? { advantagedProcPlayers: [...state.advantagedProcPlayers] } : {}),
      ...(state.thiefAttemptPlayers?.length ? { thiefAttemptPlayers: [...state.thiefAttemptPlayers] } : {}),
      ...(state.thiefTransferPlayer ? { thiefTransferPlayer: state.thiefTransferPlayer } : {}),
      ...(state.juggernautProcPlayers?.length ? { juggernautProcPlayers: [...state.juggernautProcPlayers] } : {}),
      ...(state.stunnedPlayers?.length ? { stunnedPlayers: [...state.stunnedPlayers] } : {}),
      ...(state.investorBullPlayers?.length ? { investorBullPlayers: [...state.investorBullPlayers] } : {}),
      ...(state.investorBearPlayers?.length ? { investorBearPlayers: [...state.investorBearPlayers] } : {}),
      ...(state.duplicatorProcPlayers?.length ? { duplicatorProcPlayers: [...state.duplicatorProcPlayers] } : {}),
      ...(state.sumoProcRemaining && Object.keys(state.sumoProcRemaining).length ? { sumoProcRemaining: { ...state.sumoProcRemaining } } : {}),
      ...(state.cheaterProcPlayers?.length ? { cheaterProcPlayers: [...state.cheaterProcPlayers] } : {}),
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
      state: { ...state, phase: 'idle', turn: 1, players, pendingClasses: {}, pendingMoves: {}, pendingSteals: {}, counterPicker: undefined,
        counterPickAvailableAt: undefined, resultRevealAt: undefined, lastCompleteMoves: undefined, heldSplitFor: undefined,
        luckyProcPlayer: undefined, advantagedProcPlayers: undefined, thiefAttemptPlayers: undefined, thiefTransferPlayer: undefined,
        juggernautProcPlayers: undefined, stunnedPlayers: undefined, investorBullPlayers: undefined, investorBearPlayers: undefined,
        duplicatorProcPlayers: undefined, sumoProcRemaining: undefined, cheaterProcPlayers: undefined },
      events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })],
    };
  }

  const pendingClasses = { ...state.pendingClasses, [player]: classId };
  if (!pendingClasses.p1 || !pendingClasses.p2) return {
    state: { ...state, phase: 'waiting-for-class', pendingClasses, classReadyPlayer: player, classReadyAt: now },
    events: [cue('class-ready', now, 7 * 58, { player })],
  };
  const players = { p1: freshPlayer(pendingClasses.p1), p2: freshPlayer(pendingClasses.p2) };
  return { state: { ...state, phase: 'idle', turn: 1, players, pendingClasses: {}, pendingMoves: {}, pendingSteals: {}, classReadyPlayer: undefined, classReadyAt: undefined },
    events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })] };
}

function chooseMove(state: AbmState, player: PlayerId, move: AbmMove, useSteal: true | undefined, context: DeterministicContext): VariantResolution<AbmState> {
  const { now } = context;
  if (!isActionPhase(state.phase)) throw new Error('Move cannot be chosen now.');
  if (!isMove(move)) throw new Error('Unknown ABM move.');
  if (state.pendingMoves[player]) throw new Error('Move is already locked.');
  const forcedMana = bothPlayersHaveNoMana(state);
  if (forcedMana && move !== 'mana') throw new Error('Mana is the only move available at 0–0 Mana.');
  validateMove(state, player, move);
  if (useSteal) validateSteal(state, player);
  const pendingMoves = { ...state.pendingMoves, [player]: move };
  const pendingSteals = { ...(state.pendingSteals ?? {}), ...(useSteal ? { [player]: true as const } : {}) };
  if (!pendingMoves.p1 || !pendingMoves.p2) {
    const earlyPlayer = player;
    const waitingStartsAt = now + ABM_READY_SPLIT_MS;
    const waitingDeadlineAt = waitingStartsAt + ABM_WAITING_MS;
    return { state: { ...state, phase: 'waiting', pendingMoves, pendingSteals, earlyPlayer, latePlayer: OTHER[player], waitingStartsAt, waitingDeadlineAt },
      events: [cue('move-ready', now, ABM_READY_SPLIT_MS + ABM_WAITING_MS, { earlyPlayer, waitingStartsAt, waitingDeadlineAt })] };
  }
  return resolveTurn(clearWaiting({ ...state, pendingSteals }), pendingMoves as Record<PlayerId, AbmMove>, context, forcedMana);
}

function resolveTurn(state: AbmState, moves: Record<PlayerId, AbmMove>, context: DeterministicContext, forced: boolean): VariantResolution<AbmState> {
  const { now } = context;
  const players = clonePlayers(state.players);
  const advantagedProcPlayers = (['p1', 'p2'] as const).filter((id) => isAdvantagedManaProc(players[id], moves[id], state.turn));
  const investorBullPlayers = (['p1', 'p2'] as const).filter((id) => isInvestorBullProc(players[id], moves, id));
  const duplicatorProcPlayers = (['p1', 'p2'] as const).filter((id) => isDuplicatorProc(players[id], moves[id]));
  const cheaterProcPlayers = (['p1', 'p2'] as const).filter((id) => isCheaterMana(players[id], moves[id]) && context.random() < 1 / 3);
  const sumoProcRemaining: Partial<Record<PlayerId, 0 | 1 | 2>> = {};
  for (const id of ['p1', 'p2'] as const) {
    const sumoRefund = isSumoRefund(players[id], moves);
    const manaGain = cheaterProcPlayers.includes(id) ? 2 : manaGainFor(players[id], moves, id, state.turn);
    applyMove(players[id], moves[id], manaGain, true, sumoRefund);
    if (sumoRefund) {
      const remaining = Math.max(0, sumoRefundsFor(players[id]) - 1) as 0 | 1 | 2;
      players[id].refundsRemaining = remaining;
      sumoProcRemaining[id] = remaining;
    }
  }
  const juggernautProcPlayers = (['p1', 'p2'] as const).filter((id) => didJuggernautProc(players[id], moves[id]));
  const stunnedPlayers = resolveStunnerMoves(players, moves);
  const { attemptPlayers: thiefAttemptPlayers, transferPlayer: thiefTransferPlayer } = resolveSteals(players, state.pendingSteals ?? {});
  const investorBearPlayers = resolveInvestorTax(players, state.turn);
  const loser: PlayerId | undefined = moves.p1 === 'mana' && moves.p2 === 'attack' ? 'p1' : moves.p2 === 'mana' && moves.p1 === 'attack' ? 'p2' : undefined;
  const luckyProcPlayer = loser && players[loser].classId === 'lucky' && context.random() < 0.25 ? loser : undefined;
  const defeatedPlayer = luckyProcPlayer ? undefined : loser;
  const revealDuration = defeatedPlayer ? ABM_LETHAL_TO_RESULT_MS : 800;
  const events = [cue('move-reveal', now, revealDuration, { moves, turn: state.turn, forced, luckyProcPlayer, advantagedProcPlayers,
    juggernautProcPlayers, stunnedPlayers, investorBullPlayers, investorBearPlayers, duplicatorProcPlayers, sumoProcRemaining, cheaterProcPlayers })];
  const revealed = { ...state, players, pendingMoves: {}, pendingSteals: {}, lastCompleteMoves: moves, heldSplitFor: undefined,
    luckyProcPlayer, advantagedProcPlayers: advantagedProcPlayers.length ? advantagedProcPlayers : undefined,
    thiefAttemptPlayers: thiefAttemptPlayers.length ? thiefAttemptPlayers : undefined, thiefTransferPlayer,
    stunnedPlayers: stunnedPlayers.length ? stunnedPlayers : undefined,
    investorBullPlayers: investorBullPlayers.length ? investorBullPlayers : undefined,
    investorBearPlayers: investorBearPlayers.length ? investorBearPlayers : undefined,
    duplicatorProcPlayers: duplicatorProcPlayers.length ? duplicatorProcPlayers : undefined,
    sumoProcRemaining: Object.keys(sumoProcRemaining).length ? sumoProcRemaining : undefined,
    cheaterProcPlayers: cheaterProcPlayers.length ? cheaterProcPlayers : undefined };
  revealed.juggernautProcPlayers = juggernautProcPlayers.length ? juggernautProcPlayers : undefined;
  if (defeatedPlayer) return finishRound(revealed, OTHER[defeatedPlayer], events, now + revealDuration);
  return { state: { ...revealed, phase: 'idle', turn: state.turn + 1 }, events };
}

function resolveTimeout(state: AbmState, context: DeterministicContext): VariantResolution<AbmState> {
  const { now } = context;
  const early = state.earlyPlayer!; const late = state.latePlayer!; const move = state.pendingMoves[early]!;
  const players = clonePlayers(state.players);
  const advantagedProcPlayers = isAdvantagedManaProc(players[early], move, state.turn) ? [early] : undefined;
  const duplicatorProcPlayers = isDuplicatorProc(players[early], move) ? [early] : undefined;
  const cheaterProcPlayers = isCheaterMana(players[early], move) && context.random() < 1 / 3 ? [early] : undefined;
  applyMove(players[early], move, cheaterProcPlayers ? 2 : manaGainFor(players[early], undefined, early, state.turn));
  players[late].mana = Math.max(0, players[late].mana - 1);
  players[late].strikes = (players[late].strikes ?? 0) + 1;
  players[late].lastMove = 'skip';
  if (players[late].classId === 'juggernaut') players[late].attackStreak = 0;
  if (players[late].classId === 'duplicator') players[late].nextManaGain = 1;
  const stunnedPlayers = resolveStunnerTimeout(players, early, late, move);
  const { attemptPlayers: thiefAttemptPlayers, transferPlayer: thiefTransferPlayer } = resolveSteals(players, state.pendingSteals ?? {});
  const investorBearPlayers = resolveInvestorTax(players, state.turn);
  const revealDuration = move === 'attack' || players[late].strikes >= 2 ? ABM_LETHAL_TO_RESULT_MS : 800;
  const events = [cue('move-timeout', now, revealDuration, { earlyPlayer: early, latePlayer: late, move, strikes: players[late].strikes,
    turn: state.turn, advantagedProcPlayers, thiefAttemptPlayers, thiefTransferPlayer, stunnedPlayers, investorBearPlayers, duplicatorProcPlayers, cheaterProcPlayers })];
  const timedOut = { ...clearWaiting(state), players, pendingMoves: {}, pendingSteals: {}, heldSplitFor: early, luckyProcPlayer: undefined,
    advantagedProcPlayers, thiefAttemptPlayers: undefined, thiefTransferPlayer: undefined, juggernautProcPlayers: undefined,
    stunnedPlayers: stunnedPlayers.length ? stunnedPlayers : undefined, investorBullPlayers: undefined,
    investorBearPlayers: investorBearPlayers.length ? investorBearPlayers : undefined, duplicatorProcPlayers, sumoProcRemaining: undefined, cheaterProcPlayers };
  if (players[late].strikes >= 2) return { state: { ...timedOut, phase: 'match-complete', winner: early, resultReason: 'forfeit', resultRevealAt: now + revealDuration }, events };
  if (move === 'attack') return finishRound(timedOut, early, events, now + revealDuration);
  return { state: { ...timedOut, phase: 'idle', turn: state.turn + 1 }, events };
}

function finishRound(state: AbmState, winner: PlayerId, events: ReturnType<typeof cue>[], startsAt: number): VariantResolution<AbmState> {
  const score = { ...state.score, [winner]: state.score[winner] + 1 };
  events.push(cue('round-result', startsAt, ABM_RESULT_TO_COUNTER_PICK_MS, { winner, score, round: state.round }));
  if (score[winner] >= 3) return { state: { ...state, phase: 'match-complete', score, winner, lastRoundWinner: winner, resultRevealAt: startsAt }, events };
  const loser = OTHER[winner];
  const players = clonePlayers(state.players);
  players.p1.mana = initialManaFor(players.p1.classId);
  players.p2.mana = initialManaFor(players.p2.classId);
  if (players.p1.classId === 'duplicator') players.p1.nextManaGain = 1;
  if (players.p2.classId === 'duplicator') players.p2.nextManaGain = 1;
  if (players.p1.classId === 'sumo') players.p1.refundsRemaining = 3;
  if (players.p2.classId === 'sumo') players.p2.refundsRemaining = 3;
  events.push(cue('counter-pick', startsAt + ABM_RESULT_TO_COUNTER_PICK_MS, 600, { winner, loser, classId: state.players[winner].classId }));
  return { state: { ...state, phase: 'counter-picking', turn: 0, round: state.round + 1, score, players, pendingClasses: {}, pendingMoves: {}, pendingSteals: {},
    counterPicker: loser, counterPickAvailableAt: startsAt + ABM_RESULT_TO_COUNTER_PICK_MS, resultRevealAt: startsAt, lastRoundWinner: winner }, events };
}

function applyMove(player: AbmPlayerState, move: AbmMove, manaGain = 1, record = true, refundAttack = false): void {
  if (move === 'attack') {
    if (!refundAttack) player.mana -= attackCostFor(player);
  }
  else if (move === 'block') player.blocks--;
  else player.mana = Math.min(MAX_MANA, player.mana + manaGain);
  if (move !== 'block') player.blocks = 5;
  if (player.classId === 'juggernaut') player.attackStreak = move === 'attack' ? (player.attackStreak ?? 0) + 1 : 0;
  if (player.classId === 'duplicator') player.nextManaGain = move === 'mana' ? duplicatorGainFor(player) * 2 : 1;
  if (record) player.lastMove = move;
}
function manaGainFor(player: Readonly<AbmPlayerState>, moves: Readonly<Record<PlayerId, AbmMove>> | undefined, playerId: PlayerId, turn: number): number {
  if (moves && isInvestorBullProc(player, moves, playerId)) return 2;
  if (player.classId === 'duplicator') return duplicatorGainFor(player);
  return player.classId === 'advantaged' && turn <= 3 ? 2 : 1;
}
function isAdvantagedManaProc(player: Readonly<AbmPlayerState>, move: AbmMove, turn: number): boolean {
  return player.classId === 'advantaged' && move === 'mana' && turn <= 3;
}
function validateMove(state: AbmState, playerId: PlayerId, move: AbmMove): void {
  const player = state.players[playerId];
  const attackCost = attackCostFor(player);
  if (move === 'attack' && player.mana < attackCost) throw new Error(`Attack requires ${attackCost} Mana.`);
  if (move === 'block' && player.blocks < 1) throw new Error('No Blocks remain.');
  if (move === 'block' && isBlockDisabled(state, playerId)) throw new Error('Juggernaut prevents Blocking this turn.');
}
function validateSteal(state: AbmState, player: PlayerId): void {
  const target = state.players[player];
  if (target.classId !== 'thief') throw new Error('Only Thief can use Steal.');
  if (state.turn < 5) throw new Error('Steal is unavailable before Turn 5.');
  if (target.stealUsed) throw new Error('Steal has already been used.');
}
function resolveSteals(players: Record<PlayerId, AbmPlayerState>, pending: Partial<Record<PlayerId, true>>) {
  const attemptPlayers = (['p1', 'p2'] as const).filter((id) => pending[id]);
  for (const id of attemptPlayers) players[id].stealUsed = true;
  if (attemptPlayers.length !== 1) return { attemptPlayers, transferPlayer: undefined };
  const thief = attemptPlayers[0]!; const victim = OTHER[thief];
  if (players[victim].mana <= 0) return { attemptPlayers, transferPlayer: undefined };
  players[victim].mana--; players[thief].mana = Math.min(MAX_MANA, players[thief].mana + 1);
  return { attemptPlayers, transferPlayer: thief };
}
function legalActions(state: AbmState, viewer: PlayerId) {
  if ((state.phase === 'selecting-classes' || state.phase === 'waiting-for-class') && !state.pendingClasses[viewer]) return ['lock-class'] as const;
  if (state.phase === 'counter-picking' && state.counterPicker === viewer) return ['lock-class'] as const;
  if (isActionPhase(state.phase) && !state.pendingMoves[viewer]) {
    if (bothPlayersHaveNoMana(state)) return ['mana'] as const;
    const target = state.players[viewer];
    const attackCost = attackCostFor(target);
    const moves = (['attack', 'block', 'mana'] as const)
      .filter((move) => move !== 'attack' || target.mana >= attackCost)
      .filter((move) => move !== 'block' || (target.blocks > 0 && !isBlockDisabled(state, viewer)));
    return target.classId === 'thief' && state.turn >= 5 && !target.stealUsed ? [...moves, 'steal' as const] : moves;
  }
  return [];
}
function projectedPhase(state: AbmState, viewer: PlayerId): AbmState['phase'] {
  if (state.phase === 'waiting-for-class' && !state.pendingClasses[viewer]) return 'selecting-classes';
  return state.phase;
}
function initialManaFor(classId?: AbmClassId): number { return classId === 'investor' ? 5 : 1; }
function freshPlayer(classId?: AbmClassId): AbmPlayerState { return { ...(classId ? { classId } : {}), mana: initialManaFor(classId), blocks: 5, strikes: 0,
  attackCost: 1, ...(classId === 'duplicator' ? { nextManaGain: 1 } : {}), ...(classId === 'sumo' ? { refundsRemaining: 3 } : {}) }; }
function resetPlayer(player: AbmPlayerState, classId?: AbmClassId): AbmPlayerState { return { ...(classId ? { classId } : {}), mana: initialManaFor(classId), blocks: 5,
  strikes: player.strikes ?? 0, attackCost: 1, ...(classId === 'duplicator' ? { nextManaGain: 1 } : {}), ...(classId === 'sumo' ? { refundsRemaining: 3 } : {}) }; }
function clearWaiting(state: AbmState): AbmState { return { ...state, earlyPlayer: undefined, latePlayer: undefined, waitingStartsAt: undefined, waitingDeadlineAt: undefined }; }
function clonePlayers(players: Record<PlayerId, AbmPlayerState>): Record<PlayerId, AbmPlayerState> { return { p1: { ...players.p1 }, p2: { ...players.p2 } }; }
function classMap(players: Record<PlayerId, AbmPlayerState>) { return { p1: players.p1.classId, p2: players.p2.classId }; }
function isMove(value: unknown): value is AbmMove { return value === 'attack' || value === 'block' || value === 'mana'; }
function bothPlayersHaveNoMana(state: AbmState): boolean { return state.players.p1.mana === 0 && state.players.p2.mana === 0; }
function attackCostFor(player: Readonly<AbmPlayerState>): number { return player.attackCost ?? 1; }
function duplicatorGainFor(player: Readonly<AbmPlayerState>): number { return player.nextManaGain ?? 1; }
function isDuplicatorProc(player: Readonly<AbmPlayerState>, move: AbmMove): boolean {
  return player.classId === 'duplicator' && move === 'mana' && duplicatorGainFor(player) >= 2;
}
function isCheaterMana(player: Readonly<AbmPlayerState>, move: AbmMove): boolean { return player.classId === 'cheater' && move === 'mana'; }
function sumoRefundsFor(player: Readonly<AbmPlayerState>): number { return player.refundsRemaining ?? 3; }
function isSumoRefund(player: Readonly<AbmPlayerState>, moves: Readonly<Record<PlayerId, AbmMove>>): boolean {
  return player.classId === 'sumo' && moves.p1 === 'attack' && moves.p2 === 'attack' && sumoRefundsFor(player) > 0;
}
function isInvestorBullProc(player: Readonly<AbmPlayerState>, moves: Readonly<Record<PlayerId, AbmMove>>, playerId: PlayerId): boolean {
  return player.classId === 'investor' && moves[playerId] === 'mana' && moves[OTHER[playerId]] === 'mana';
}
function resolveInvestorTax(players: Record<PlayerId, AbmPlayerState>, turn: number): PlayerId[] {
  if (turn % 3 !== 0) return [];
  const taxed: PlayerId[] = [];
  for (const id of ['p1', 'p2'] as const) {
    if (players[id].classId !== 'investor' || players[id].mana <= 0) continue;
    players[id].mana = Math.max(0, players[id].mana - 1);
    taxed.push(id);
  }
  return taxed;
}
function resolveStunnerMoves(players: Record<PlayerId, AbmPlayerState>, moves: Readonly<Record<PlayerId, AbmMove>>): PlayerId[] {
  const stunned: PlayerId[] = [];
  for (const stunner of ['p1', 'p2'] as const) {
    if (players[stunner].classId !== 'stunner') continue;
    const victim = OTHER[stunner];
    if (moves[stunner] === 'attack') {
      players[victim].attackCost = Math.min(MAX_STUNNED_ATTACK_COST, attackCostFor(players[victim]) * 2);
      stunned.push(victim);
    } else players[victim].attackCost = 1;
  }
  return stunned;
}
function resolveStunnerTimeout(players: Record<PlayerId, AbmPlayerState>, early: PlayerId, late: PlayerId, move: AbmMove): PlayerId[] {
  const stunned: PlayerId[] = [];
  if (players[early].classId === 'stunner') {
    if (move === 'attack') {
      players[late].attackCost = Math.min(MAX_STUNNED_ATTACK_COST, attackCostFor(players[late]) * 2);
      stunned.push(late);
    } else players[late].attackCost = 1;
  }
  if (players[late].classId === 'stunner') players[early].attackCost = 1;
  return stunned;
}
function didJuggernautProc(player: Readonly<AbmPlayerState>, move: AbmMove): boolean {
  return player.classId === 'juggernaut' && move === 'attack' && (player.attackStreak ?? 0) > 0 && (player.attackStreak ?? 0) % 2 === 0;
}
function isBlockDisabled(state: Readonly<AbmState>, player: PlayerId): boolean {
  const opponent = state.players[OTHER[player]];
  return opponent.classId === 'juggernaut' && (opponent.attackStreak ?? 0) > 0 && (opponent.attackStreak ?? 0) % 2 === 0;
}
function isActionPhase(phase: AbmState['phase']): boolean { return ['idle', 'waiting', 'selecting-actions', 'waiting-for-action'].includes(phase as string); }
function cue(type: 'class-ready' | 'class-reveal' | 'move-ready' | 'move-reveal' | 'move-timeout' | 'forced-mana' | 'round-result' | 'counter-pick', startsAt: number, duration: number, payload: unknown) {
  return { type, startsAt, endsAt: startsAt + duration, payload } as const;
}
