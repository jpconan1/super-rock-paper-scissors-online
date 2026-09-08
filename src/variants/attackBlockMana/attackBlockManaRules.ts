import type { DeterministicContext, PlayerId, VariantRules, VariantResolution } from '../../core/variant';
import { beats, STARBURST_WIPE_MS } from '../../core/time';
import { ABM_CLASS_BY_ID, startingResourcesForClass } from './attackBlockManaCatalog';
import type { AbmAbilityId, AbmClassId, AbmCommand, AbmDisplayMove, AbmGamblerOutcome, AbmMove, AbmPlayerState, AbmProjection, AbmResult, AbmState } from './attackBlockManaTypes';

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
    players: { p1: freshPlayer(), p2: freshPlayer() }, pendingClasses: {}, pendingMoves: {}, pendingAbilities: {},
  }),
  resolve(state, player, command, context) {
    if (state.winner) throw new Error('Game is complete.');
    if (!command || typeof command !== 'object') throw new Error('Invalid ABM command.');
    if (command.type === 'lock-class') return lockClass(state, player, command.classId, context.now);
    if (command.type === 'preview-class') return previewClass(state, player, command.classId, context.now);
    if (command.type === 'activate-ability' && command.ability === 'conjure') return activateConjure(state, player, context.now);
    if (command.type === 'choose-move') return chooseMove(state, player, command.move, command.ability, context);
    throw new Error('Unknown ABM command.');
  },
  nextDeadline: (state) => state.phase === 'waiting' || state.phase === 'conjurer-choosing' ? state.waitingDeadlineAt : undefined,
  advanceDeadline(state, context) {
    if ((state.phase !== 'waiting' && state.phase !== 'conjurer-choosing') || state.waitingDeadlineAt === undefined || context.now < state.waitingDeadlineAt) return undefined;
    return resolveTimeout(state, context);
  },
  project(state, viewer) {
    const opponent = OTHER[viewer];
    const ownPendingClass = state.pendingClasses[viewer];
    const ownPendingMove = state.pendingMoves[viewer];
    const ownPendingAbility = state.pendingAbilities?.[viewer];
    return {
      self: viewer, phase: projectedPhase(state, viewer), turn: state.turn, round: state.round,
      score: { ...state.score }, players: clonePlayers(state.players),
      ...(ownPendingClass ? { ownPendingClass } : {}), ...(ownPendingMove ? { ownPendingMove } : {}),
      ...(ownPendingAbility ? { ownPendingAbility } : {}),
      ...(state.conjurer ? { conjurer: state.conjurer } : {}),
      ...(state.conjuredMove ? { conjuredMove: state.conjuredMove } : {}),
      ...(state.conjureStalemate ? { conjureStalemate: true } : {}),
      ...(state.classReadyPlayer ? { classReadyPlayer: state.classReadyPlayer } : {}),
      ...(state.classReadyAt !== undefined ? { classReadyAt: state.classReadyAt } : {}),
      opponentReady: Boolean(state.pendingClasses[opponent] || state.pendingMoves[opponent] || state.pendingAbilities?.[opponent]),
      legalActions: legalActions(state, viewer),
      ...(state.lastCompleteMoves ? { lastCompleteMoves: { ...state.lastCompleteMoves } } : {}),
      ...(state.luckyProcPlayer ? { luckyProcPlayer: state.luckyProcPlayer } : {}),
      ...(state.fireborneProcPlayer ? { fireborneProcPlayer: state.fireborneProcPlayer } : {}),
      ...(state.retiredProcPlayers?.length ? { retiredProcPlayers: [...state.retiredProcPlayers] } : {}),
      ...(state.advantagedProcPlayers?.length ? { advantagedProcPlayers: [...state.advantagedProcPlayers] } : {}),
      ...(state.thiefAttemptPlayers?.length ? { thiefAttemptPlayers: [...state.thiefAttemptPlayers] } : {}),
      ...(state.thiefTransferPlayer ? { thiefTransferPlayer: state.thiefTransferPlayer } : {}),
      ...(state.taxmanCollectPlayers?.length ? { taxmanCollectPlayers: [...state.taxmanCollectPlayers] } : {}),
      ...(state.parriedPlayers?.length ? { parriedPlayers: [...state.parriedPlayers] } : {}),
      ...(state.juggernautProcPlayers?.length ? { juggernautProcPlayers: [...state.juggernautProcPlayers] } : {}),
      ...(state.stunnedPlayers?.length ? { stunnedPlayers: [...state.stunnedPlayers] } : {}),
      ...(state.investorBullPlayers?.length ? { investorBullPlayers: [...state.investorBullPlayers] } : {}),
      ...(state.investorBearPlayers?.length ? { investorBearPlayers: [...state.investorBearPlayers] } : {}),
      ...(state.duplicatorProcPlayers?.length ? { duplicatorProcPlayers: [...state.duplicatorProcPlayers] } : {}),
      ...(state.copywriterProcPlayers?.length ? { copywriterProcPlayers: [...state.copywriterProcPlayers] } : {}),
      ...(state.sumoProcRemaining && Object.keys(state.sumoProcRemaining).length ? { sumoProcRemaining: { ...state.sumoProcRemaining } } : {}),
      ...(state.cheaterProcPlayers?.length ? { cheaterProcPlayers: [...state.cheaterProcPlayers] } : {}),
      ...(state.gamblerOutcomes && Object.keys(state.gamblerOutcomes).length ? { gamblerOutcomes: { ...state.gamblerOutcomes } } : {}),
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

function previewClass(state: AbmState, player: PlayerId, classId: AbmClassId, now: number): VariantResolution<AbmState> {
  const definition = ABM_CLASS_BY_ID.get(classId);
  if (!definition?.implemented) throw new Error('Unknown or unavailable ABM class.');
  if (state.phase !== 'counter-picking' || state.counterPicker !== player) throw new Error('Class cannot be previewed now.');
  if (state.counterPickAvailableAt !== undefined && now < state.counterPickAvailableAt) throw new Error('Counter-pick is not available yet.');
  return { state, events: [cue('class-preview', now, 600, { player, classId })] };
}

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
      state: { ...state, phase: 'idle', turn: 1, players, pendingClasses: {}, pendingMoves: {}, pendingAbilities: {}, counterPicker: undefined,
        counterPickAvailableAt: undefined, resultRevealAt: undefined, lastCompleteMoves: undefined, heldSplitFor: undefined,
        luckyProcPlayer: undefined, fireborneProcPlayer: undefined, retiredProcPlayers: undefined, advantagedProcPlayers: undefined, thiefAttemptPlayers: undefined, thiefTransferPlayer: undefined, taxmanCollectPlayers: undefined, parriedPlayers: undefined,
        juggernautProcPlayers: undefined, stunnedPlayers: undefined, investorBullPlayers: undefined, investorBearPlayers: undefined,
        duplicatorProcPlayers: undefined, copywriterProcPlayers: undefined, sumoProcRemaining: undefined, cheaterProcPlayers: undefined, gamblerOutcomes: undefined },
      events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })],
    };
  }

  const pendingClasses = { ...state.pendingClasses, [player]: classId };
  if (!pendingClasses.p1 || !pendingClasses.p2) return {
    state: { ...state, phase: 'waiting-for-class', pendingClasses, classReadyPlayer: player, classReadyAt: now },
    events: [cue('class-ready', now, 7 * 58, { player })],
  };
  const players = { p1: freshPlayer(pendingClasses.p1), p2: freshPlayer(pendingClasses.p2) };
  return { state: { ...state, phase: 'idle', turn: 1, players, pendingClasses: {}, pendingMoves: {}, pendingAbilities: {}, classReadyPlayer: undefined, classReadyAt: undefined },
    events: [cue('class-reveal', now, 800, { classes: classMap(players), round: state.round })] };
}

function chooseMove(state: AbmState, player: PlayerId, move: AbmMove, ability: AbmAbilityId | undefined, context: DeterministicContext): VariantResolution<AbmState> {
  const { now } = context;
  if (!isActionPhase(state.phase)) throw new Error('Move cannot be chosen now.');
  if (!isMove(move)) throw new Error('Unknown ABM move.');
  if (state.pendingMoves[player]) throw new Error('Move is already locked.');
  if (state.pendingAbilities?.[player] === 'conjure' && !(state.phase === 'conjurer-choosing' && state.conjurer === player)) throw new Error('Waiting for the opponent to move.');
  const forcedMana = state.phase !== 'conjurer-choosing' && bothPlayersHaveNoMana(state);
  if (forcedMana && move !== 'mana') throw new Error('Mana is the only move available at 0–0 Mana.');
  if (ability === 'conjure') throw new Error('Conjure must be activated before choosing a move.');
  if (ability) validateAbility(state, player, ability);
  const committedAbility = ability === 'flame' && move === 'attack'
    && state.players[player].mana < attackCostFor(state.players[player]) + 1 ? undefined : ability;
  const players = clonePlayers(state.players);
  if (committedAbility) spendAbility(players[player], committedAbility);
  validateMove({ ...state, players }, player, move);
  const pendingMoves = { ...state.pendingMoves, [player]: move };
  const pendingAbilities = { ...(state.pendingAbilities ?? {}), ...(committedAbility ? { [player]: committedAbility } : {}) };
  if (state.phase === 'conjurer-choosing') {
    if (state.conjurer !== player) throw new Error('Only the Conjurer can choose now.');
    if (state.conjuredMove === 'skip') {
      const staged = { ...state, players, pendingMoves: { [player]: move }, pendingAbilities, earlyPlayer: player, latePlayer: OTHER[player] };
      return resolveTimeout(staged, context);
    }
    return resolveTurn(clearWaiting({ ...state, players, pendingAbilities }), pendingMoves as Record<PlayerId, AbmMove>, context, forcedMana);
  }
  const activeConjurer = (['p1', 'p2'] as const).find((id) => pendingAbilities[id] === 'conjure');
  if (activeConjurer && player === OTHER[activeConjurer]) return beginConjurerChoice({ ...state, players, pendingMoves, pendingAbilities }, activeConjurer, move, now);
  if (!pendingMoves.p1 || !pendingMoves.p2) {
    const earlyPlayer = player;
    const waitingStartsAt = now + ABM_READY_SPLIT_MS;
    const waitingDeadlineAt = waitingStartsAt + ABM_WAITING_MS;
    return { state: { ...state, phase: 'waiting', players, pendingMoves, pendingAbilities, earlyPlayer, latePlayer: OTHER[player], waitingStartsAt, waitingDeadlineAt },
      events: [cue('move-ready', now, ABM_READY_SPLIT_MS + ABM_WAITING_MS, { earlyPlayer, waitingStartsAt, waitingDeadlineAt })] };
  }
  return resolveTurn(clearWaiting({ ...state, players, pendingAbilities }), pendingMoves as Record<PlayerId, AbmMove>, context, forcedMana);
}

function activateConjure(state: AbmState, player: PlayerId, now: number): VariantResolution<AbmState> {
  if (!isActionPhase(state.phase) || state.phase === 'conjurer-choosing') throw new Error('Conjure cannot be used now.');
  if (state.pendingMoves[player] || state.pendingAbilities?.[player]) throw new Error('Action is already locked.');
  if (state.conjureStalemate) throw new Error('Conjure cannot be repeated this turn.');
  validateAbility(state, player, 'conjure');
  const players = clonePlayers(state.players); spendAbility(players[player], 'conjure');
  const opponent = OTHER[player];
  if (state.pendingAbilities?.[opponent] === 'conjure') {
    return { state: { ...clearWaiting(state), phase: 'idle', players, pendingAbilities: {}, conjureStalemate: true },
      events: [cue('conjure-stalemate', now, 800, { players: ['p1', 'p2'] })] };
  }
  const pendingAbilities = { ...(state.pendingAbilities ?? {}), [player]: 'conjure' as const };
  const opponentMove = state.pendingMoves[opponent];
  if (opponentMove) return beginConjurerChoice({ ...state, players, pendingAbilities }, player, opponentMove, now);
  const waitingStartsAt = now + ABM_READY_SPLIT_MS;
  return { state: { ...state, phase: 'waiting', players, pendingAbilities, earlyPlayer: player, latePlayer: opponent,
    waitingStartsAt, waitingDeadlineAt: waitingStartsAt + ABM_WAITING_MS },
    events: [cue('move-ready', now, ABM_READY_SPLIT_MS + ABM_WAITING_MS, { earlyPlayer: player, waitingStartsAt, waitingDeadlineAt: waitingStartsAt + ABM_WAITING_MS })] };
}

function beginConjurerChoice(state: AbmState, conjurer: PlayerId, move: AbmDisplayMove, now: number): VariantResolution<AbmState> {
  const opponent = OTHER[conjurer];
  const waitingStartsAt = now + STARBURST_WIPE_MS;
  return { state: { ...clearWaiting(state), phase: 'conjurer-choosing', conjurer, conjuredMove: move,
    conjuredOpponentTimedOut: move === 'skip' || undefined, earlyPlayer: opponent, latePlayer: conjurer,
    waitingStartsAt, waitingDeadlineAt: waitingStartsAt + ABM_WAITING_MS },
    events: [cue('conjure-reveal', now, 800, { conjurer, move })] };
}

function resolveTurn(state: AbmState, moves: Record<PlayerId, AbmMove>, context: DeterministicContext, forced: boolean): VariantResolution<AbmState> {
  const { now } = context;
  const players = clonePlayers(state.players);
  const advantagedProcPlayers = (['p1', 'p2'] as const).filter((id) => isAdvantagedManaProc(players[id], moves[id], state.turn));
  const investorBullPlayers = (['p1', 'p2'] as const).filter((id) => isInvestorBullProc(players[id], moves, id));
  const duplicatorProcPlayers = (['p1', 'p2'] as const).filter((id) => isDuplicatorProc(players[id], moves[id]));
  const copywriterProcPlayers = resolveCopywriters(players, moves);
  const cheaterProcPlayers = (['p1', 'p2'] as const).filter((id) => isCheaterMana(players[id], moves[id]) && context.random() < 1 / 3);
  const sumoProcRemaining: Partial<Record<PlayerId, 0 | 1 | 2>> = {};
  const gamblerOutcomes: Partial<Record<PlayerId, AbmGamblerOutcome>> = {};
  for (const id of ['p1', 'p2'] as const) {
    const sumoRefund = isSumoRefund(players[id], moves);
    const manaGain = cheaterProcPlayers.includes(id) ? 2 : manaGainFor(players[id], moves, id, state.turn);
    applyMove(players[id], moves[id], manaGain, true, sumoRefund);
    if (players[id].classId === 'gambler' && moves[id] === 'block') {
      gamblerOutcomes[id] = applyGamblerRoll(players[id], context.random());
    }
    if (sumoRefund) {
      const remaining = Math.max(0, sumoRefundsFor(players[id]) - 1) as 0 | 1 | 2;
      players[id].refundsRemaining = remaining;
      sumoProcRemaining[id] = remaining;
    }
  }
  const juggernautProcPlayers = (['p1', 'p2'] as const).filter((id) => didJuggernautProc(players[id], moves[id]));
  const stunnedPlayers = resolveStunnerMoves(players, moves);
  const investorBearPlayers = resolveInvestorTax(players, state.turn);
  const loser: PlayerId | undefined = moves.p1 === 'mana' && moves.p2 === 'attack' ? 'p1' : moves.p2 === 'mana' && moves.p1 === 'attack' ? 'p2' : undefined;
  const luckyProcPlayer = loser && players[loser].classId === 'lucky' && context.random() < 0.25 ? loser : undefined;
  const fireborneProcPlayer = loser && !luckyProcPlayer && fireShieldTurnsFor(players[loser]) > 0 ? loser : undefined;
  const defeatedPlayer = luckyProcPlayer || fireborneProcPlayer ? undefined : loser;
  const abilityResult = defeatedPlayer ? emptyAbilityResult() : resolveActivatedAbilities(players, moves, state.pendingAbilities ?? {});
  if (!defeatedPlayer) advanceFireborneShields(players, state.pendingAbilities ?? {}, fireborneProcPlayer);
  const retiredProcPlayers = defeatedPlayer ? undefined : resolveRetiredMirror(players);
  const revealDuration = defeatedPlayer ? ABM_LETHAL_TO_RESULT_MS : 800;
  const events = [cue('move-reveal', now, revealDuration, { moves, turn: state.turn, forced, luckyProcPlayer, fireborneProcPlayer, retiredProcPlayers, advantagedProcPlayers,
    juggernautProcPlayers, stunnedPlayers, investorBullPlayers, investorBearPlayers, duplicatorProcPlayers, copywriterProcPlayers, sumoProcRemaining, cheaterProcPlayers, gamblerOutcomes })];
  const revealed = { ...state, players, pendingMoves: {}, pendingAbilities: {}, conjurer: undefined, conjuredMove: undefined,
    conjuredOpponentTimedOut: undefined, conjureStalemate: undefined, lastCompleteMoves: moves, heldSplitFor: undefined,
    luckyProcPlayer, fireborneProcPlayer, retiredProcPlayers, advantagedProcPlayers: advantagedProcPlayers.length ? advantagedProcPlayers : undefined,
    thiefAttemptPlayers: abilityResult.thiefAttemptPlayers.length ? abilityResult.thiefAttemptPlayers : undefined,
    thiefTransferPlayer: abilityResult.thiefTransferPlayer,
    taxmanCollectPlayers: abilityResult.taxmanCollectPlayers.length ? abilityResult.taxmanCollectPlayers : undefined,
    parriedPlayers: abilityResult.parriedPlayers.length ? abilityResult.parriedPlayers : undefined,
    stunnedPlayers: stunnedPlayers.length ? stunnedPlayers : undefined,
    investorBullPlayers: investorBullPlayers.length ? investorBullPlayers : undefined,
    investorBearPlayers: investorBearPlayers.length ? investorBearPlayers : undefined,
    duplicatorProcPlayers: duplicatorProcPlayers.length ? duplicatorProcPlayers : undefined,
    copywriterProcPlayers: copywriterProcPlayers.length ? copywriterProcPlayers : undefined,
    sumoProcRemaining: Object.keys(sumoProcRemaining).length ? sumoProcRemaining : undefined,
    cheaterProcPlayers: cheaterProcPlayers.length ? cheaterProcPlayers : undefined,
    gamblerOutcomes: Object.keys(gamblerOutcomes).length ? gamblerOutcomes : undefined };
  revealed.juggernautProcPlayers = juggernautProcPlayers.length ? juggernautProcPlayers : undefined;
  if (defeatedPlayer) return finishRound(revealed, OTHER[defeatedPlayer], events, now + revealDuration);
  return { state: { ...revealed, phase: 'idle', turn: state.turn + 1 }, events };
}

function resolveTimeout(state: AbmState, context: DeterministicContext): VariantResolution<AbmState> {
  const { now } = context;
  if (state.phase === 'conjurer-choosing' && state.conjuredMove === 'skip' && !state.pendingMoves[state.conjurer!]) {
    return resolveDoubleConjureTimeout(state, context);
  }
  if (state.phase === 'waiting') {
    const conjurer = (['p1', 'p2'] as const).find((id) => state.pendingAbilities?.[id] === 'conjure');
    if (conjurer && !state.pendingMoves[OTHER[conjurer]]) {
      const opponent = OTHER[conjurer]; const players = clonePlayers(state.players);
      applySkip(players[opponent], false);
      if (players[opponent].strikes >= 2) {
        const duration = ABM_LETHAL_TO_RESULT_MS;
        return { state: { ...clearWaiting(state), phase: 'match-complete', players, pendingMoves: {}, pendingAbilities: {}, winner: conjurer,
          resultReason: 'forfeit', resultRevealAt: now + duration },
          events: [cue('move-timeout', now, duration, { earlyPlayer: conjurer, latePlayer: opponent, strikes: players[opponent].strikes })] };
      }
      return beginConjurerChoice({ ...state, players }, conjurer, 'skip', context.now);
    }
  }
  const early = state.earlyPlayer!; const late = state.latePlayer!; const move = state.pendingMoves[early]!;
  const players = clonePlayers(state.players);
  const advantagedProcPlayers = isAdvantagedManaProc(players[early], move, state.turn) ? [early] : undefined;
  const duplicatorProcPlayers = isDuplicatorProc(players[early], move) ? [early] : undefined;
  const timeoutMoves = { [early]: move, [late]: 'skip' } as Record<PlayerId, AbmDisplayMove>;
  const copywriterProcPlayers = resolveCopywriters(players, timeoutMoves);
  const cheaterProcPlayers = isCheaterMana(players[early], move) && context.random() < 1 / 3 ? [early] : undefined;
  applyMove(players[early], move, cheaterProcPlayers ? 2 : manaGainFor(players[early], undefined, early, state.turn));
  const gamblerOutcomes: Partial<Record<PlayerId, AbmGamblerOutcome>> = {};
  if (players[early].classId === 'gambler' && move === 'block') gamblerOutcomes[early] = applyGamblerRoll(players[early], context.random());
  const timeoutAlreadyApplied = Boolean(state.conjuredOpponentTimedOut && state.conjuredMove === 'skip');
  if (timeoutAlreadyApplied) {
    players[late].lastMove = 'skip'; recordRecentMove(players[late], 'skip');
  } else applySkip(players[late]);
  const stunnedPlayers = resolveStunnerTimeout(players, early, late, move);
  const investorBearPlayers = resolveInvestorTax(players, state.turn);
  const fireborneProcPlayer = move === 'attack' && players[late].strikes < 2 && fireShieldTurnsFor(players[late]) > 0 ? late : undefined;
  const lethal = players[late].strikes >= 2 || (move === 'attack' && !fireborneProcPlayer);
  const revealDuration = lethal ? ABM_LETHAL_TO_RESULT_MS : 800;
  const abilityResult = lethal ? emptyAbilityResult() : resolveActivatedAbilities(players, timeoutMoves, state.pendingAbilities ?? {});
  if (!lethal) advanceFireborneShields(players, state.pendingAbilities ?? {}, fireborneProcPlayer);
  const retiredProcPlayers = lethal ? undefined : resolveRetiredMirror(players);
  const events = [cue('move-timeout', now, revealDuration, { earlyPlayer: early, latePlayer: late, move, strikes: players[late].strikes,
    turn: state.turn, advantagedProcPlayers, thiefAttemptPlayers: abilityResult.thiefAttemptPlayers, thiefTransferPlayer: abilityResult.thiefTransferPlayer,
    taxmanCollectPlayers: abilityResult.taxmanCollectPlayers, parriedPlayers: abilityResult.parriedPlayers, fireborneProcPlayer, retiredProcPlayers, stunnedPlayers, investorBearPlayers, duplicatorProcPlayers, copywriterProcPlayers, cheaterProcPlayers, gamblerOutcomes })];
  const timedOut = { ...clearWaiting(state), players, pendingMoves: {}, pendingAbilities: {}, conjurer: undefined, conjuredMove: undefined,
    conjuredOpponentTimedOut: undefined, conjureStalemate: undefined, heldSplitFor: early, luckyProcPlayer: undefined, fireborneProcPlayer, retiredProcPlayers,
    advantagedProcPlayers, thiefAttemptPlayers: undefined, thiefTransferPlayer: undefined, taxmanCollectPlayers: undefined, parriedPlayers: undefined, juggernautProcPlayers: undefined,
    stunnedPlayers: stunnedPlayers.length ? stunnedPlayers : undefined, investorBullPlayers: undefined,
    investorBearPlayers: investorBearPlayers.length ? investorBearPlayers : undefined, duplicatorProcPlayers,
    copywriterProcPlayers: copywriterProcPlayers.length ? copywriterProcPlayers : undefined, sumoProcRemaining: undefined, cheaterProcPlayers,
    gamblerOutcomes: Object.keys(gamblerOutcomes).length ? gamblerOutcomes : undefined };
  if (players[late].strikes >= 2) return { state: { ...timedOut, phase: 'match-complete', winner: early, resultReason: 'forfeit', resultRevealAt: now + revealDuration }, events };
  if (move === 'attack' && !fireborneProcPlayer) return finishRound(timedOut, early, events, now + revealDuration);
  return { state: { ...timedOut, phase: 'idle', turn: state.turn + 1 }, events };
}

function resolveDoubleConjureTimeout(state: AbmState, context: DeterministicContext): VariantResolution<AbmState> {
  const { now } = context; const conjurer = state.conjurer!; const opponent = OTHER[conjurer];
  const players = clonePlayers(state.players);
  const copywriterProcPlayers = resolveCopywriters(players, { p1: 'skip', p2: 'skip' });
  applySkip(players[conjurer]);
  players[opponent].lastMove = 'skip'; recordRecentMove(players[opponent], 'skip');
  if (players[conjurer].strikes < 2) advanceFireborneShields(players, state.pendingAbilities ?? {});
  const duration = players[conjurer].strikes >= 2 ? ABM_LETHAL_TO_RESULT_MS : 800;
  const timedOut = { ...clearWaiting(state), players, phase: players[conjurer].strikes >= 2 ? 'match-complete' as const : 'idle' as const,
    turn: players[conjurer].strikes >= 2 ? state.turn : state.turn + 1, pendingMoves: {}, pendingAbilities: {}, conjurer: undefined,
    conjuredMove: undefined, conjuredOpponentTimedOut: undefined, conjureStalemate: undefined,
    copywriterProcPlayers: copywriterProcPlayers.length ? copywriterProcPlayers : undefined,
    ...(players[conjurer].strikes >= 2 ? { winner: opponent, resultReason: 'forfeit' as const, resultRevealAt: now + duration } : {}) };
  return { state: timedOut, events: [cue('move-timeout', now, duration, { earlyPlayer: opponent, latePlayer: conjurer, move: 'skip', strikes: players[conjurer].strikes,
    turn: state.turn, copywriterProcPlayers })] };
}

function finishRound(state: AbmState, winner: PlayerId, events: ReturnType<typeof cue>[], startsAt: number): VariantResolution<AbmState> {
  const score = { ...state.score, [winner]: state.score[winner] + 1 };
  events.push(cue('round-result', startsAt, ABM_RESULT_TO_COUNTER_PICK_MS, { winner, score, round: state.round }));
  if (score[winner] >= 3) return { state: { ...state, phase: 'match-complete', score, winner, lastRoundWinner: winner, resultRevealAt: startsAt }, events };
  const loser = OTHER[winner];
  const players = clonePlayers(state.players);
  for (const id of ['p1', 'p2'] as const) {
    const resources = startingResourcesForClass(players[id].classId);
    players[id].mana = resources.mana;
    players[id].blocks = resources.blocks;
    players[id].recentMoves = undefined;
    players[id].fireShieldTurns = 0;
    Object.assign(players[id], initialAbilityUses(players[id].classId));
  }
  if (players.p1.classId === 'duplicator') players.p1.nextManaGain = 1;
  if (players.p2.classId === 'duplicator') players.p2.nextManaGain = 1;
  if (players.p1.classId === 'sumo') players.p1.refundsRemaining = 3;
  if (players.p2.classId === 'sumo') players.p2.refundsRemaining = 3;
  events.push(cue('counter-pick', startsAt + ABM_RESULT_TO_COUNTER_PICK_MS, 600, { winner, loser, classId: state.players[winner].classId }));
  return { state: { ...state, phase: 'counter-picking', turn: 0, round: state.round + 1, score, players, pendingClasses: {}, pendingMoves: {}, pendingAbilities: {},
    conjurer: undefined, conjuredMove: undefined, conjuredOpponentTimedOut: undefined, conjureStalemate: undefined,
    counterPicker: loser, counterPickAvailableAt: startsAt + ABM_RESULT_TO_COUNTER_PICK_MS, resultRevealAt: startsAt, lastRoundWinner: winner }, events };
}

function applyMove(player: AbmPlayerState, move: AbmMove, manaGain = 1, record = true, refundAttack = false): void {
  if (move === 'attack') {
    if (!refundAttack) player.mana -= attackCostFor(player);
  }
  else if (move === 'block') player.blocks--;
  else addMana(player, manaGain);
  if (move !== 'block') player.blocks = startingResourcesForClass(player.classId).blocks;
  if (player.classId === 'juggernaut') player.attackStreak = move === 'attack' ? (player.attackStreak ?? 0) + 1 : 0;
  if (player.classId === 'duplicator') player.nextManaGain = move === 'mana' ? duplicatorGainFor(player) * 2 : 1;
  if (record) { player.lastMove = move; recordRecentMove(player, move); }
}

function resolveCopywriters(
  players: Record<PlayerId, AbmPlayerState>,
  moves: Readonly<Record<PlayerId, AbmDisplayMove>>,
): PlayerId[] {
  const procPlayers = (['p1', 'p2'] as const).filter((id) => {
    if (players[id].classId !== 'copywriter') return false;
    const opponent = OTHER[id];
    const history = players[opponent].recentMoves ?? [];
    return history.length >= 2 && history.at(-1) === moves[opponent] && history.at(-2) === moves[opponent];
  });
  for (const id of procPlayers) addMana(players[id], 1);
  return procPlayers;
}

function recordRecentMove(player: AbmPlayerState, move: AbmDisplayMove): void {
  player.recentMoves = [...(player.recentMoves ?? []), move].slice(-3);
}
function applySkip(player: AbmPlayerState, record = true): void {
  player.mana = Math.max(0, player.mana - 1);
  player.strikes = (player.strikes ?? 0) + 1;
  player.blocks = startingResourcesForClass(player.classId).blocks;
  if (player.classId === 'juggernaut') player.attackStreak = 0;
  if (player.classId === 'duplicator') player.nextManaGain = 1;
  if (record) { player.lastMove = 'skip'; recordRecentMove(player, 'skip'); }
}
function fireShieldTurnsFor(player: Readonly<AbmPlayerState>): number { return player.fireShieldTurns ?? 0; }
function advanceFireborneShields(
  players: Record<PlayerId, AbmPlayerState>,
  pending: Partial<Record<PlayerId, AbmAbilityId>>,
  consumed?: PlayerId,
): void {
  for (const id of ['p1', 'p2'] as const) {
    if (pending[id] === 'flame') players[id].fireShieldTurns = 5;
    else if (id === consumed) players[id].fireShieldTurns = 0;
    else if (fireShieldTurnsFor(players[id]) > 0) players[id].fireShieldTurns = Math.max(0, fireShieldTurnsFor(players[id]) - 1) as 0 | 1 | 2 | 3 | 4 | 5;
  }
}
function manaGainFor(player: Readonly<AbmPlayerState>, moves: Readonly<Record<PlayerId, AbmMove>> | undefined, playerId: PlayerId, turn: number): number {
  const classGain = player.classId ? ABM_CLASS_BY_ID.get(player.classId)?.hooks.manaGain : undefined;
  if (classGain) return classGain(turn, false);
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
function validateAbility(state: AbmState, player: PlayerId, abilityId: AbmAbilityId): void {
  const target = state.players[player];
  const ability = target.classId ? ABM_CLASS_BY_ID.get(target.classId)?.ability : undefined;
  if (!ability || ability.id !== abilityId) throw new Error(`${abilityId} is not this class's ability.`);
  if (abilityUsesFor(target, ability.id) < 1) throw new Error(`${ability.label} has already been used.`);
  if (target.mana < ability.manaCost) throw new Error(`${ability.label} requires ${ability.manaCost} Mana.`);
  if (ability.available && !ability.available(target, state.turn)) throw new Error(`${ability.label} is unavailable this turn.`);
}
function spendAbility(player: AbmPlayerState, abilityId: AbmAbilityId): void {
  const ability = player.classId ? ABM_CLASS_BY_ID.get(player.classId)?.ability : undefined;
  if (!ability || ability.id !== abilityId) return;
  player.abilityUses = { ...player.abilityUses, [abilityId]: abilityUsesFor(player, abilityId) - 1 };
  player.mana = Math.max(0, player.mana - ability.manaCost);
}
function resolveSteals(players: Record<PlayerId, AbmPlayerState>, pending: Partial<Record<PlayerId, AbmAbilityId>>) {
  const attemptPlayers = (['p1', 'p2'] as const).filter((id) => pending[id] === 'steal');
  if (attemptPlayers.length !== 1) return { attemptPlayers, transferPlayer: undefined };
  const thief = attemptPlayers[0]!; const victim = OTHER[thief];
  if (players[victim].mana <= 0) return { attemptPlayers, transferPlayer: undefined };
  players[victim].mana--; addMana(players[thief], 1);
  return { attemptPlayers, transferPlayer: thief };
}
function resolveActivatedAbilities(players: Record<PlayerId, AbmPlayerState>, moves: Readonly<Record<PlayerId, AbmDisplayMove>>, pending: Partial<Record<PlayerId, AbmAbilityId>>) {
  const parriedPlayers: PlayerId[] = [];
  for (const parrymaster of ['p1', 'p2'] as const) {
    if (pending[parrymaster] !== 'parry') continue;
    const attacker = OTHER[parrymaster];
    if (moves[attacker] !== 'attack') continue;
    players[attacker].mana = Math.max(0, players[attacker].mana - 2);
    parriedPlayers.push(attacker);
  }
  const taxmanCollectPlayers: PlayerId[] = [];
  for (const collector of ['p1', 'p2'] as const) {
    if (pending[collector] !== 'collect') continue;
    taxmanCollectPlayers.push(collector);
    for (const victim of ['p1', 'p2'] as const) {
      if (players[victim].mana <= 0) continue;
      players[victim].mana--;
    }
  }
  const { attemptPlayers: thiefAttemptPlayers, transferPlayer: thiefTransferPlayer } = resolveSteals(players, pending);
  return { thiefAttemptPlayers, thiefTransferPlayer, taxmanCollectPlayers, parriedPlayers };
}
function emptyAbilityResult() { return { thiefAttemptPlayers: [] as PlayerId[], thiefTransferPlayer: undefined as PlayerId | undefined,
  taxmanCollectPlayers: [] as PlayerId[], parriedPlayers: [] as PlayerId[] }; }
function legalActions(state: AbmState, viewer: PlayerId) {
  if ((state.phase === 'selecting-classes' || state.phase === 'waiting-for-class') && !state.pendingClasses[viewer]) return ['lock-class'] as const;
  if (state.phase === 'counter-picking' && state.counterPicker === viewer) return ['lock-class'] as const;
  if (isActionPhase(state.phase) && !state.pendingMoves[viewer]) {
    if (state.phase === 'conjurer-choosing' && state.conjurer !== viewer) return [];
    if (state.pendingAbilities?.[viewer] === 'conjure' && !(state.phase === 'conjurer-choosing' && state.conjurer === viewer)) return [];
    if (state.phase !== 'conjurer-choosing' && bothPlayersHaveNoMana(state)) return ['mana'] as const;
    const target = state.players[viewer];
    const attackCost = attackCostFor(target);
    const moves = (['attack', 'block', 'mana'] as const)
      .filter((move) => move !== 'attack' || target.mana >= attackCost)
      .filter((move) => move !== 'block' || (target.blocks > 0 && !isBlockDisabled(state, viewer)));
    const ability = target.classId ? ABM_CLASS_BY_ID.get(target.classId)?.ability : undefined;
    return ability && !state.conjureStalemate && abilityUsesFor(target, ability.id) > 0 && target.mana >= ability.manaCost && (!ability.available || ability.available(target, state.turn))
      ? [...moves, ability.id] : moves;
  }
  return [];
}
function projectedPhase(state: AbmState, viewer: PlayerId): AbmState['phase'] {
  if (state.phase === 'waiting-for-class' && !state.pendingClasses[viewer]) return 'selecting-classes';
  return state.phase;
}
function freshPlayer(classId?: AbmClassId): AbmPlayerState { const resources = startingResourcesForClass(classId); return { ...(classId ? { classId } : {}), mana: resources.mana, blocks: resources.blocks, strikes: 0,
  attackCost: 1, ...initialAbilityUses(classId), ...(classId === 'duplicator' ? { nextManaGain: 1 } : {}), ...(classId === 'sumo' ? { refundsRemaining: 3 } : {}) }; }
function resetPlayer(player: AbmPlayerState, classId?: AbmClassId): AbmPlayerState { const resources = startingResourcesForClass(classId); return { ...(classId ? { classId } : {}), mana: resources.mana, blocks: resources.blocks,
  strikes: player.strikes ?? 0, attackCost: 1, ...initialAbilityUses(classId), ...(classId === 'duplicator' ? { nextManaGain: 1 } : {}), ...(classId === 'sumo' ? { refundsRemaining: 3 } : {}) }; }
function clearWaiting(state: AbmState): AbmState { return { ...state, earlyPlayer: undefined, latePlayer: undefined, waitingStartsAt: undefined, waitingDeadlineAt: undefined }; }
function clonePlayers(players: Record<PlayerId, AbmPlayerState>): Record<PlayerId, AbmPlayerState> {
  return {
    p1: { ...players.p1, ...(players.p1.recentMoves ? { recentMoves: [...players.p1.recentMoves] } : {}) },
    p2: { ...players.p2, ...(players.p2.recentMoves ? { recentMoves: [...players.p2.recentMoves] } : {}) },
  };
}
function classMap(players: Record<PlayerId, AbmPlayerState>) { return { p1: players.p1.classId, p2: players.p2.classId }; }
function isMove(value: unknown): value is AbmMove { return value === 'attack' || value === 'block' || value === 'mana'; }
function bothPlayersHaveNoMana(state: AbmState): boolean { return state.players.p1.mana === 0 && state.players.p2.mana === 0; }
function attackCostFor(player: Readonly<AbmPlayerState>): number { return player.attackCost ?? 1; }
function initialAbilityUses(classId?: AbmClassId): Pick<AbmPlayerState, 'abilityUses'> | Record<string, never> {
  const ability = classId ? ABM_CLASS_BY_ID.get(classId)?.ability : undefined;
  return ability ? { abilityUses: { [ability.id]: ability.uses } } : {};
}
function abilityUsesFor(player: Readonly<AbmPlayerState>, abilityId: AbmAbilityId): number {
  const stored = player.abilityUses?.[abilityId];
  if (stored !== undefined) return stored;
  if (abilityId === 'steal' && player.classId === 'thief') return player.stealUsed ? 0 : 1;
  const ability = player.classId ? ABM_CLASS_BY_ID.get(player.classId)?.ability : undefined;
  return ability?.id === abilityId ? ability.uses : 0;
}
function duplicatorGainFor(player: Readonly<AbmPlayerState>): number { return player.nextManaGain ?? 1; }
function isDuplicatorProc(player: Readonly<AbmPlayerState>, move: AbmMove): boolean {
  return player.classId === 'duplicator' && move === 'mana' && duplicatorGainFor(player) >= 2;
}
function isCheaterMana(player: Readonly<AbmPlayerState>, move: AbmMove): boolean { return player.classId === 'cheater' && move === 'mana'; }
function applyGamblerRoll(player: AbmPlayerState, random: number): AbmGamblerOutcome {
  const roll = Math.min(100, Math.max(1, Math.floor(random * 100) + 1));
  if (roll === 1) { addMana(player, 2); return 'plus-2-mana'; }
  if (roll <= 20) { addMana(player, 1); return 'plus-1-mana'; }
  if (roll <= 30) { player.mana = 0; return 'mana-drain'; }
  if (roll <= 40) { player.mana = Math.min(MAX_MANA, player.mana * 2); return 'mana-double'; }
  if (roll <= 55) { player.blocks++; return 'plus-1-block'; }
  if (roll <= 60) { player.blocks += 2; return 'plus-2-block'; }
  if (roll <= 70) { player.blocks = Math.max(0, player.blocks - 1); return 'minus-1-block'; }
  return 'nothing';
}
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
function addMana(player: AbmPlayerState, amount: number): void {
  if (amount <= 0 || player.classId === 'retired') return;
  player.mana = Math.min(MAX_MANA, player.mana + amount);
}
function resolveRetiredMirror(players: Record<PlayerId, AbmPlayerState>): PlayerId[] | undefined {
  if (players.p1.classId !== 'retired' || players.p2.classId !== 'retired' || players.p1.mana !== 0 || players.p2.mana !== 0) return undefined;
  for (const id of ['p1', 'p2'] as const) {
    delete players[id].classId;
    players[id].mana = 1;
    players[id].blocks = 5;
  }
  return ['p1', 'p2'];
}
function isActionPhase(phase: AbmState['phase']): boolean { return ['idle', 'waiting', 'conjurer-choosing', 'selecting-actions', 'waiting-for-action'].includes(phase as string); }
function cue(type: 'class-ready' | 'class-reveal' | 'class-preview' | 'move-ready' | 'move-reveal' | 'move-timeout' | 'forced-mana' | 'round-result' | 'counter-pick' | 'conjure-reveal' | 'conjure-stalemate', startsAt: number, duration: number, payload: unknown) {
  return { type, startsAt, endsAt: startsAt + duration, payload } as const;
}
