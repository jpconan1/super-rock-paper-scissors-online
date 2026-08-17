import { describe, expect, test } from 'vitest';
import { acceptMatchCommand, advanceMatchDeadline, createOnlineMatch, projectOnlineMatch } from '../src/core/onlineMatch';
import type { MatchCommandPayload } from '../src/protocol/protocol';
import type { PlayerId } from '../src/core/variant';

const players = {
  p1: { name: 'One', platform: 'Web', rating: 1500 },
  p2: { name: 'Two', platform: 'Web', rating: 1500 },
};

describe('online match', () => {
  test('orders picks, advances by deadline, and hides opponent moves', () => {
    const state = createOnlineMatch('m', players, 1, 0);
    expect(advanceMatchDeadline(state, 1_500)).toBe(true);
    send(state, 'p2', { type: 'select-slot', slotId: 'slot-4' });
    send(state, 'p1', { type: 'select-slot', slotId: 'slot-2' });
    expect(state.pickOrder).toEqual(['slot-4', 'slot-2']);
    expect(state.phase).toBe('scoreboard');
    advanceMatchDeadline(state, state.deadlineAt!);
    expect(state.activeSlot).toBe('slot-4');
    send(state, 'p1', { type: 'variant-command', slotId: 'slot-4', command: 'charge' });
    expect(projectOnlineMatch(state, 'p2').ownMove).toBeUndefined();
    expect(projectOnlineMatch(state, 'p2').ready.p1).toBe(true);
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
    expect(state.phase).toBe('scoreboard');
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
    expect(state.phase).toBe('banning');
    expect(projectOnlineMatch(state, 'p1').unavailableSlots).toEqual(['slot-3', 'slot-4']);
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
  send(state, 'p1', { type: 'variant-command', slotId, command: 'charge' });
  send(state, 'p2', { type: 'variant-command', slotId, command: 'block' });
}
