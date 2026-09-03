import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MatchProjection, ServerSnapshot } from '../src/protocol/protocol';
import { LocalAbmMatch, chooseComputerCommand } from '../src/app/localAbmMatch';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';

describe('LocalAbmMatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  test('starts ABM directly and drives the computer through the shared match engine', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({ playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0 });
    match.start();

    expect(latest(snapshots).phase).toBe('playing');
    expect(latest(snapshots).activeSlot).toBe('slot-5');
    expect(latest(snapshots).players).toEqual({
      p1: { name: 'JP', platform: 'Local', rating: 0 },
      p2: { name: 'Computer', platform: 'CPU', rating: 0 },
    });

    vi.advanceTimersByTime(1_000);
    expect(variant(snapshots).opponentReady).toBe(true);
    match.send({ type: 'lock-class', classId: 'advantaged' });
    expect(variant(snapshots).phase).toBe('idle');

    vi.advanceTimersByTime(1_000);
    expect(variant(snapshots).phase).toBe('waiting');
    match.send({ type: 'choose-move', move: 'mana' });
    expect(variant(snapshots).score.p2).toBe(1);
    expect(variant(snapshots).phase).toBe('counter-picking');
    match.destroy();
  });

  test('advances local ABM deadlines when the human does not respond', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({ playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0 });
    match.start();
    vi.advanceTimersByTime(1_000);
    match.send({ type: 'lock-class', classId: 'lucky' });
    vi.advanceTimersByTime(1_000);
    expect(variant(snapshots).phase).toBe('waiting');

    vi.advanceTimersByTime(30_200);
    expect(latestSnapshot(snapshots).events.some(({ type }) => type === 'move-timeout')).toBe(true);
    expect(variant(snapshots).players.p1.strikes).toBe(1);
    match.destroy();
  });

  test('cancels pending computer actions when practice closes', () => {
    const publish = vi.fn();
    const match = new LocalAbmMatch({ playerName: 'JP', publish, random: () => 0 });
    match.start();
    match.destroy();
    vi.advanceTimersByTime(2_000);
    expect(publish).toHaveBeenCalledOnce();
  });

  test('calls the browser timer clearer through a bound wrapper', () => {
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = function (this: typeof globalThis, timer) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return originalClearTimeout(timer);
    } as typeof clearTimeout;
    try {
      const match = new LocalAbmMatch({ playerName: 'JP', publish: () => {}, random: () => 0 });
      match.start();
      expect(() => match.send({ type: 'lock-class', classId: 'lucky' })).not.toThrow();
      match.destroy();
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});

describe('chooseComputerCommand', () => {
  test('returns only a legal move and arms an available steal', () => {
    const projection = {
      self: 'p2', phase: 'idle', turn: 5, round: 1, score: { p1: 0, p2: 0 },
      players: {
        p1: { classId: 'lucky', mana: 2, blocks: 5, strikes: 0 },
        p2: { classId: 'thief', mana: 0, blocks: 0, strikes: 0 },
      },
      opponentReady: false, legalActions: ['mana', 'steal'],
    } satisfies AbmProjection;
    expect(chooseComputerCommand(projection, () => 0)).toEqual({ type: 'choose-move', move: 'mana', useSteal: true });
  });
});

function latestSnapshot(snapshots: ServerSnapshot[]): ServerSnapshot { return snapshots[snapshots.length - 1]!; }
function latest(snapshots: ServerSnapshot[]): MatchProjection { return latestSnapshot(snapshots).projection as MatchProjection; }
function variant(snapshots: ServerSnapshot[]): AbmProjection { return latest(snapshots).variant as AbmProjection; }
