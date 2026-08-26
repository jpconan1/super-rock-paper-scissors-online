import { describe, expect, test } from 'vitest';
import { acceptMatchCommand, advanceMatchDeadline, createOnlineMatch, projectOnlineMatch } from '../src/core/onlineMatch';
import { BEAT_MS, beats } from '../src/core/time';

describe('game time', () => {
  test('defines one beat as 0.75 seconds', () => {
    expect(BEAT_MS).toBe(750);
    expect(beats(2)).toBe(1_500);
  });
});
import type { MatchCommandPayload } from '../src/protocol/protocol';
import type { PlayerId } from '../src/core/variant';

const players = {
  p1: { name: 'One', platform: 'Web', rating: 1500 },
  p2: { name: 'Two', platform: 'Web', rating: 1500 },
};

describe('online match', () => {
  test('runs an ABM-only match directly in slot one and holds its final result', () => {
    const state = createOnlineMatch('abm', players, 1, 0, 'abm-only');
    advanceMatchDeadline(state, 1_500);
    expect(state.phase).toBe('playing');
    expect(state.activeSlot).toBe('slot-1');
    send(state, 'p1', { type: 'variant-command', slotId: 'slot-1', command: { type: 'lock-class', classId: 'advantaged' } });
    send(state, 'p2', { type: 'variant-command', slotId: 'slot-1', command: { type: 'lock-class', classId: 'advantaged' } });
    for (let round = 0; round < 3; round++) {
      send(state, 'p1', { type: 'variant-command', slotId: 'slot-1', command: { type: 'choose-move', move: 'attack' } });
      send(state, 'p2', { type: 'variant-command', slotId: 'slot-1', command: { type: 'choose-move', move: 'mana' } });
      if (round < 2) send(state, 'p2', { type: 'variant-command', slotId: 'slot-1', command: { type: 'lock-class', classId: 'advantaged' } });
    }
    expect(state.games).toHaveLength(1);
    expect(state.winner).toBe('p1');
    expect(state.phase).toBe('playing');
    expect(state.events.some(({ type }) => type === 'match-complete')).toBe(true);
    expect(state.deadlineAt).toBeUndefined();
    expect(advanceMatchDeadline(state, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(state.phase).toBe('playing');
    expect(state.gameState).toMatchObject({ phase: 'match-complete', winner: 'p1', score: { p1: 3, p2: 0 } });
  });

  test('schedules and resolves the late ABM player deadline', () => {
    const state = createOnlineMatch('abm-timeout', players, 1, 0, 'abm-only');
    advanceMatchDeadline(state, 1_500);
    send(state, 'p1', { type: 'variant-command', slotId: 'slot-1', command: { type: 'lock-class', classId: 'lucky' } });
    send(state, 'p2', { type: 'variant-command', slotId: 'slot-1', command: { type: 'lock-class', classId: 'thief' } });
    send(state, 'p1', { type: 'variant-command', slotId: 'slot-1', command: { type: 'choose-move', move: 'mana' } });
    const deadline = state.deadlineAt!;
    expect(deadline).toBeGreaterThan(0);
    expect(advanceMatchDeadline(state, deadline - 1)).toBe(false);
    expect(advanceMatchDeadline(state, deadline)).toBe(true);
    expect(state.deadlineAt).toBeUndefined();
    expect(state.events.some(({ type }) => type === 'move-timeout')).toBe(true);
    expect(state.gameState).toMatchObject({ phase: 'idle', players: { p2: { strikes: 1, lastMove: 'skip' } } });
  });

  test('orders picks, advances by deadline, and hides opponent moves', () => {
    const state = createOnlineMatch('m', players, 1, 0);
    expect(advanceMatchDeadline(state, 1_500)).toBe(true);
    send(state, 'p2', { type: 'select-slot', slotId: 'slot-4' });
    send(state, 'p1', { type: 'select-slot', slotId: 'slot-2' });
    expect(state.pickOrder).toEqual(['slot-4', 'slot-2']);
    expect(state.phase).toBe('scoreboard');
    advanceMatchDeadline(state, state.deadlineAt!);
    expect(state.activeSlot).toBe('slot-4');
    send(state, 'p1', { type: 'variant-command', slotId: 'slot-4', command: 'advance' });
    const variant = projectOnlineMatch(state, 'p2').variant as { ready: Record<PlayerId, boolean> };
    expect(variant.ready.p1).toBe(true);
  });

  test('rejects duplicate/stale commands and locks six unique bans', () => {
    const state = createOnlineMatch('m', players, 2, 0);
    advanceMatchDeadline(state, 1_500);
    const revision = state.revision;
    expect(acceptMatchCommand(state, 'p1', { commandId: 'same', expectedRevision: revision, payload: { type: 'select-slot', slotId: 'slot-1' } }, 2_000)).toBe('accepted');
    expect(acceptMatchCommand(state, 'p1', { commandId: 'same', expectedRevision: revision, payload: { type: 'select-slot', slotId: 'slot-1' } }, 2_000)).toBe('duplicate');
    expect(acceptMatchCommand(state, 'p2', { commandId: 'stale', expectedRevision: revision, payload: { type: 'select-slot', slotId: 'slot-2' } }, 2_000)).toBe('stale');
    state.phase = 'banning'; state.pickOrder = ['slot-1', 'slot-2']; state.activeSlot = undefined;
    for (const slot of ['slot-3', 'slot-4', 'slot-5'] as const) send(state, 'p1', { type: 'toggle-ban', slotId: slot });
    for (const slot of ['slot-6', 'slot-7', 'slot-8'] as const) send(state, 'p2', { type: 'toggle-ban', slotId: slot });
    expect(state.bansLocked).toBe(true);
    expect(state.activeSlot).toBe('slot-9');
    expect(state.phase).toBe('playing');
  });

  test('repeats a shared pick for a split-series third game and completes', () => {
    const state = findSplitSeries(true);
    expect(state.phase).toBe('scoreboard');
    expect(state.activeSlot).toBe('slot-3');
    playGame(state);
    expect(state.games).toHaveLength(3);
    expect(state.phase).toBe('final-scoreboard');
    expect(state.winner).toBe(state.games[2]!.winner);
    advanceMatchDeadline(state, state.deadlineAt!);
    expect(state.phase).toBe('complete');
  });

  test('sends different split picks into simultaneous banning', () => {
    const state = findSplitSeries(false);
    expect(state.phase).toBe('scoreboard');
    expect(state.activeSlot).toBeUndefined();
    advanceMatchDeadline(state, state.deadlineAt!);
    expect(state.phase).toBe('banning');
    expect(projectOnlineMatch(state, 'p1').unavailableSlots).toEqual(['slot-3', 'slot-4']);
  });

  test('allows a player to take back their own ban before the sixth lock', () => {
    const state = createOnlineMatch('m-unban', players, 2, 0);
    state.phase = 'banning'; state.pickOrder = ['slot-1', 'slot-2']; state.activeSlot = undefined;
    send(state, 'p1', { type: 'toggle-ban', slotId: 'slot-3' });
    expect(state.bans.p1).toEqual(['slot-3']);
    send(state, 'p1', { type: 'toggle-ban', slotId: 'slot-3' });
    expect(state.bans.p1).toEqual([]);
  });
});

function send(state: ReturnType<typeof createOnlineMatch>, player: PlayerId, payload: MatchCommandPayload): void {
  const status = acceptMatchCommand(state, player, { commandId: `${state.revision}:${player}:${payload.type}`, expectedRevision: state.revision, payload }, state.revision * 10_000);
  expect(status).toBe('accepted');
}

function findSplitSeries(samePick: boolean): ReturnType<typeof createOnlineMatch> {
  for (let seed = 0; seed < 100; seed++) {
    const state = createOnlineMatch(`m-${seed}`, players, seed, 0);
    advanceMatchDeadline(state, 1_500);
    send(state, 'p1', { type: 'select-slot', slotId: 'slot-3' });
    send(state, 'p2', { type: 'select-slot', slotId: samePick ? 'slot-3' : 'slot-4' });
    playGame(state); playGame(state);
    if (state.games[0]!.winner !== state.games[1]!.winner) return state;
  }
  throw new Error('Expected a deterministic seed that splits the opening games.');
}

function playGame(state: ReturnType<typeof createOnlineMatch>): void {
  advanceMatchDeadline(state, state.deadlineAt!);
  const slotId = state.activeSlot!;
  send(state, 'p1', { type: 'variant-command', slotId, command: 'advance' });
  send(state, 'p2', { type: 'variant-command', slotId, command: 'advance' });
}
