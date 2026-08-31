import type { MatchPlayer, TimedSemanticEvent } from '../protocol/protocol';
import type { AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';

export interface AbmEditorFixture {
  id: string;
  label: string;
  projection: AbmProjection;
  events: readonly TimedSemanticEvent[];
  serverTime: number;
  viewer: 'p1' | 'p2';
  players: Readonly<Record<'p1' | 'p2', MatchPlayer>>;
  replayDuration?: number;
}

const T = 100_000;
const players = {
  p1: { name: 'P1', platform: 'Desktop', rating: 1200 },
  p2: { name: 'P2', platform: 'Desktop', rating: 1250 },
} as const;

function projection(overrides: Partial<AbmProjection> = {}): AbmProjection {
  return {
    self: 'p1', phase: 'idle', turn: 4, round: 2, score: { p1: 1, p2: 0 },
    players: {
      p1: { classId: 'advantaged', mana: 3, blocks: 4, strikes: 0, lastMove: 'attack' },
      p2: { classId: 'thief', mana: 6, blocks: 2, strikes: 1, lastMove: 'block' },
    },
    opponentReady: false, legalActions: ['attack', 'block', 'mana'], ...overrides,
  };
}

function fixture(id: string, label: string, overrides: Partial<AbmEditorFixture> & { projection: AbmProjection }): AbmEditorFixture {
  return { id, label, events: [], serverTime: T, viewer: overrides.projection.self, players, ...overrides };
}

export const ABM_EDITOR_FIXTURES: readonly AbmEditorFixture[] = [
  fixture('class-select', 'Class select', { projection: projection({ phase: 'selecting-classes', turn: 0, score: { p1: 0, p2: 0 }, players: { p1: { mana: 0, blocks: 5, strikes: 0 }, p2: { mana: 0, blocks: 5, strikes: 0 } }, legalActions: ['lock-class'] }) }),
  fixture('class-locked', 'Class locked · waiting', { projection: projection({ phase: 'waiting-for-class', ownPendingClass: 'advantaged', legalActions: [], opponentReady: false }) }),
  fixture('class-ready', 'Class READY cue', { projection: projection({ phase: 'waiting-for-class', classReadyPlayer: 'p2', classReadyAt: T - 174, legalActions: [] }) }),
  fixture('battle', 'Battle · resources', { projection: projection() }),
  fixture('proc-tags', 'Battle · proc tags', { projection: projection({
    lastCompleteMoves: { p1: 'mana', p2: 'attack' }, advantagedProcPlayers: ['p1'],
    juggernautProcPlayers: ['p2'], thiefAttemptPlayers: ['p2'],
  }) }),
  fixture('proc-tags-stacked', 'Battle · stacked proc tags', { projection: projection({
    lastCompleteMoves: { p1: 'mana', p2: 'attack' }, advantagedProcPlayers: ['p1'], stunnedPlayers: ['p1'],
    players: {
      p1: { classId: 'advantaged', mana: 8, blocks: 4, strikes: 0, lastMove: 'mana', attackCost: 8 },
      p2: { classId: 'stunner', mana: 5, blocks: 5, strikes: 0, lastMove: 'attack', attackCost: 1 },
    },
  }) }),
  fixture('lucky-survival', 'Battle · Lucky survival', { projection: projection({
    lastCompleteMoves: { p1: 'mana', p2: 'attack' }, luckyProcPlayer: 'p1',
  }) }),
  fixture('move-locked', 'Battle · move locked', { projection: projection({ ownPendingMove: 'mana', opponentReady: true, legalActions: [] }) }),
  fixture('waiting-ready', 'Waiting · READY', { projection: projection({ phase: 'waiting', earlyPlayer: 'p1', latePlayer: 'p2', waitingStartsAt: T + 174, waitingDeadlineAt: T + 30_174, legalActions: [] }) }),
  fixture('waiting-dots', 'Waiting · dots', { projection: projection({ phase: 'waiting', earlyPlayer: 'p1', latePlayer: 'p2', waitingStartsAt: T - 2_000, waitingDeadlineAt: T + 28_000, legalActions: [] }) }),
  fixture('waiting-countdown', 'Waiting · countdown', { projection: projection({ phase: 'waiting', earlyPlayer: 'p2', latePlayer: 'p1', waitingStartsAt: T - 25_000, waitingDeadlineAt: T + 4_200, legalActions: [] }) }),
  fixture('counter-lock', 'Counter-pick · result', { projection: projection({ phase: 'counter-picking', counterPicker: 'p2', counterPickAvailableAt: T + 2_000, resultRevealAt: T - 1, lastRoundWinner: 'p2', legalActions: [] }) }),
  fixture('round-win', 'Round won · counter-pick', { projection: projection({ phase: 'counter-picking', counterPicker: 'p1', counterPickAvailableAt: T - 1, lastRoundWinner: 'p1', legalActions: ['lock-class'] }) }),
  fixture('match-loss-p2', 'Match lost · P2 view', { viewer: 'p2', projection: projection({ self: 'p2', phase: 'match-complete', score: { p1: 3, p2: 1 }, winner: 'p1', legalActions: [] }) }),
  fixture('match-win', 'Match won', { projection: projection({ phase: 'match-complete', score: { p1: 3, p2: 1 }, winner: 'p1', legalActions: [] }) }),
  fixture('replay-round', 'Replay · round reveal', {
    projection: projection({ phase: 'counter-picking', counterPicker: 'p2', counterPickAvailableAt: T + 900, resultRevealAt: T + 900, lastRoundWinner: 'p1', legalActions: [] }),
    events: [{ id: 'editor-round-reveal', type: 'round-result', startsAt: T + 900, endsAt: T + 1_900 }], replayDuration: 2_000,
  }),
];

export function getAbmEditorFixture(id: string): AbmEditorFixture {
  return ABM_EDITOR_FIXTURES.find((candidate) => candidate.id === id) ?? ABM_EDITOR_FIXTURES[0]!;
}
