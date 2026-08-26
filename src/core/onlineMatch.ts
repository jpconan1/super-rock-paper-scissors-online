import { SLOT_IDS, type SlotId } from './slots';
import type { DeterministicContext, PlayerId, VariantGameResult } from './variant';
import type { CompletedGame, MatchCommandPayload, MatchPhase, MatchPlayer, MatchProjection, TimedSemanticEvent } from '../protocol/protocol';
import { getServerVariantForSlot } from './serverVariantRegistry';
import { beats } from './time';

export const SCOREBOARD_HOLD_MS = 3_750;
export const MATCH_FOUND_HOLD_MS = beats(2);
export type MatchFormat = 'abm-only' | 'multi-slot';

export interface OnlineMatchState {
  matchId: string;
  revision: number;
  phase: MatchPhase;
  players: Record<PlayerId, MatchPlayer>;
  picks: Partial<Record<PlayerId, SlotId>>;
  pickOrder: SlotId[];
  games: CompletedGame[];
  activeSlot?: SlotId;
  gameState?: unknown;
  bans: Record<PlayerId, SlotId[]>;
  bansLocked: boolean;
  winner?: PlayerId;
  deadlineAt?: number;
  events: TimedSemanticEvent[];
  processed: string[];
  seed: number;
  format: MatchFormat;
}

export interface MatchMutation { commandId: string; expectedRevision: number; payload: MatchCommandPayload }
export type MatchMutationResult = 'accepted' | 'duplicate' | 'stale';

export function createOnlineMatch(
  matchId: string,
  players: Record<PlayerId, MatchPlayer>,
  seed: number,
  now: number,
  format: MatchFormat = 'multi-slot',
): OnlineMatchState {
  const deadlineAt = now + MATCH_FOUND_HOLD_MS;
  return {
    matchId, revision: 0, phase: 'match-found', players, picks: {}, pickOrder: [], games: [],
    bans: { p1: [], p2: [] }, bansLocked: false, deadlineAt, events: [event(matchId, 0, 0, 'match-found', now, deadlineAt)],
    processed: [], seed, format,
  };
}

export function acceptMatchCommand(state: OnlineMatchState, player: PlayerId, mutation: MatchMutation, now: number): MatchMutationResult {
  if (state.processed.includes(mutation.commandId)) return 'duplicate';
  if (mutation.expectedRevision !== state.revision) return 'stale';
  const nextRevision = state.revision + 1;
  const emitted: TimedSemanticEvent[] = [];
  const add = (type: TimedSemanticEvent['type'], duration: number, payload?: unknown) =>
    emitted.push(event(state.matchId, nextRevision, emitted.length, type, now, now + duration, payload));

  switch (mutation.payload.type) {
    case 'select-slot': {
      if (state.phase !== 'selecting') throw new Error('Slots cannot be selected now.');
      if (!isSlotId(mutation.payload.slotId)) throw new Error('Unknown slot.');
      if (state.picks[player]) throw new Error('Player already selected a slot.');
      state.picks[player] = mutation.payload.slotId;
      state.pickOrder.push(mutation.payload.slotId);
      add('pick-confirmed', 600, { player, slotId: mutation.payload.slotId });
      if (state.picks.p1 && state.picks.p2) enterScoreboard(state, state.pickOrder[0]!, now, 'scoreboard', add);
      break;
    }
    case 'toggle-ban': {
      if (state.phase !== 'banning' || state.bansLocked) throw new Error('Bans cannot be changed now.');
      const slotId = mutation.payload.slotId;
      if (!isSlotId(slotId)) throw new Error('Unknown slot.');
      const own = state.bans[player];
      const index = own.indexOf(slotId);
      if (index >= 0) own.splice(index, 1);
      else {
        if (unavailable(state).includes(slotId)) throw new Error('Slot is unavailable.');
        if (own.length >= 3) throw new Error('Ban quota reached.');
        const opponent = state.bans[player === 'p1' ? 'p2' : 'p1'];
        if (opponent.includes(slotId)) throw new Error('Slot already banned.');
        own.push(slotId);
      }
      if (state.bans.p1.length + state.bans.p2.length === 6) {
        state.bansLocked = true;
        const remaining = SLOT_IDS.find((slot) => !unavailable(state).includes(slot));
        if (!remaining) throw new Error('No tiebreaker remains.');
        add('bans-locked', 600, { slotId: remaining });
        startGame(state, remaining, now, nextRevision, add);
      }
      break;
    }
    case 'variant-command': {
      if (state.phase !== 'playing' || mutation.payload.slotId !== state.activeSlot || !state.gameState) {
        throw new Error('Variant command is not for the active game.');
      }
      const rules = getServerVariantForSlot(state.activeSlot);
      const resolution = rules.resolve(state.gameState, player, mutation.payload.command, randomContext(mixSeed(state.seed, nextRevision), now));
      state.gameState = resolution.state;
      for (const cue of resolution.events ?? []) emitted.push(event(state.matchId, nextRevision, emitted.length, cue.type, cue.startsAt, cue.endsAt, cue.payload));
      const result = rules.result(state.gameState) as VariantGameResult | undefined;
      if (result) finishGame(state, result, now, add);
      else state.deadlineAt = rules.nextDeadline?.(state.gameState);
      break;
    }
  }
  state.revision = nextRevision;
  state.processed.push(mutation.commandId);
  state.events = emitted;
  return 'accepted';
}

function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value);
}

export function advanceMatchDeadline(state: OnlineMatchState, now: number): boolean {
  if (!state.deadlineAt || state.deadlineAt > now) return false;
  const nextRevision = state.revision + 1;
  state.deadlineAt = undefined;
  state.events = [];
  if (state.phase === 'match-found' && state.format === 'abm-only') startGame(state, 'slot-1', now, nextRevision);
  else if (state.phase === 'match-found') state.phase = 'selecting';
  else if (state.phase === 'scoreboard' && state.activeSlot) startGame(state, state.activeSlot, now, nextRevision);
  else if (state.phase === 'scoreboard') state.phase = 'banning';
  else if (state.phase === 'final-scoreboard') state.phase = 'complete';
  else if (state.phase === 'playing' && state.activeSlot && state.gameState) {
    const rules = getServerVariantForSlot(state.activeSlot);
    const resolution = rules.advanceDeadline?.(state.gameState, randomContext(mixSeed(state.seed, nextRevision), now));
    if (!resolution) return false;
    state.gameState = resolution.state;
    state.events = (resolution.events ?? []).map((cue, index) => event(state.matchId, nextRevision, index, cue.type, cue.startsAt, cue.endsAt, cue.payload));
    const result = rules.result(state.gameState) as VariantGameResult | undefined;
    if (result) {
      const add = (type: TimedSemanticEvent['type'], duration: number, payload?: unknown) =>
        state.events.push(event(state.matchId, nextRevision, state.events.length, type, now, now + duration, payload));
      finishGame(state, result, now, add);
    } else state.deadlineAt = rules.nextDeadline?.(state.gameState);
  }
  else return false;
  state.revision = nextRevision;
  return true;
}

export function projectOnlineMatch(state: OnlineMatchState, viewer: PlayerId): MatchProjection {
  const variant = state.gameState && state.activeSlot
    ? getServerVariantForSlot(state.activeSlot).project(state.gameState, viewer)
    : undefined;
  return {
    phase: state.phase, self: viewer, players: state.players, picks: state.picks, pickOrder: state.pickOrder,
    games: state.games, ...(state.activeSlot ? { activeSlot: state.activeSlot } : {}),
    ...(variant === undefined ? {} : { variant }), unavailableSlots: unavailable(state),
    ownBans: state.bans[viewer], opponentBanCount: state.bans[viewer === 'p1' ? 'p2' : 'p1'].length,
    bansLocked: state.bansLocked, ...(state.winner ? { winner: state.winner } : {}),
  };
}

function enterScoreboard(
  state: OnlineMatchState,
  nextSlot: SlotId,
  now: number,
  phase: 'scoreboard' | 'final-scoreboard',
  add: (type: TimedSemanticEvent['type'], duration: number, payload?: unknown) => void,
): void {
  state.phase = phase;
  state.activeSlot = nextSlot;
  state.gameState = undefined;
  state.deadlineAt = now + SCOREBOARD_HOLD_MS;
  add('scoreboard', SCOREBOARD_HOLD_MS, { nextSlot, final: phase === 'final-scoreboard' });
}

function startGame(
  state: OnlineMatchState,
  slot: SlotId,
  now: number,
  revision: number,
  add?: (type: TimedSemanticEvent['type'], duration: number, payload?: unknown) => void,
): void {
  state.phase = 'playing';
  state.activeSlot = slot;
  const wins = gameWins(state.games);
  state.gameState = getServerVariantForSlot(slot).initialize({
    ...randomContext(mixSeed(state.seed, revision), now),
    gameNumber: state.games.length + 1,
    matchWins: wins,
  });
  state.deadlineAt = undefined;
  if (add) add('game-start', 600, { slotId: slot });
  else state.events = [event(state.matchId, revision, 0, 'game-start', now, now + 600, { slotId: slot })];
}

function finishGame(
  state: OnlineMatchState,
  result: VariantGameResult,
  now: number,
  add: (type: TimedSemanticEvent['type'], duration: number, payload?: unknown) => void,
): void {
  state.games.push({ slotId: state.activeSlot!, ...result });
  if (state.format === 'abm-only') {
    state.winner = result.winner;
    state.deadlineAt = undefined;
    add('match-complete', SCOREBOARD_HOLD_MS, { winner: state.winner, scores: result.scores });
    return;
  }
  if (state.games.length === 1) return enterScoreboard(state, state.pickOrder[1]!, now, 'scoreboard', add);
  const wins = { p1: 0, p2: 0 };
  for (const game of state.games) wins[game.winner]++;
  if (wins.p1 === 2 || wins.p2 === 2) {
    state.winner = wins.p1 === 2 ? 'p1' : 'p2';
    add('match-complete', SCOREBOARD_HOLD_MS, { winner: state.winner });
    return enterScoreboard(state, state.activeSlot!, now, 'final-scoreboard', add);
  }
  if (state.games.length === 2) {
    if (state.pickOrder[0] === state.pickOrder[1]) return enterScoreboard(state, state.pickOrder[0]!, now, 'scoreboard', add);
    state.phase = 'scoreboard';
    state.activeSlot = undefined;
    state.gameState = undefined;
    state.deadlineAt = now + SCOREBOARD_HOLD_MS;
    add('scoreboard', SCOREBOARD_HOLD_MS, { next: 'banning' });
    return;
  }
  state.winner = wins.p1 > wins.p2 ? 'p1' : 'p2';
  add('match-complete', SCOREBOARD_HOLD_MS, { winner: state.winner });
  enterScoreboard(state, state.activeSlot!, now, 'final-scoreboard', add);
}

function gameWins(games: readonly CompletedGame[]): Record<PlayerId, number> {
  const wins = { p1: 0, p2: 0 };
  for (const game of games) wins[game.winner]++;
  return wins;
}

function unavailable(state: OnlineMatchState): SlotId[] {
  return [...new Set([...state.pickOrder, ...state.bans.p1, ...state.bans.p2])];
}

function event(matchId: string, revision: number, index: number, type: TimedSemanticEvent['type'], startsAt: number, endsAt: number, payload?: unknown): TimedSemanticEvent {
  return { id: `${matchId}:${revision}:${index}`, type, startsAt, endsAt, ...(payload === undefined ? {} : { payload }) };
}

function randomContext(seed: number, now: number): DeterministicContext {
  let value = seed >>> 0;
  return { now, random: () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000) };
}

function mixSeed(seed: number, revision: number): number {
  let value = (seed ^ Math.imul(revision, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}
