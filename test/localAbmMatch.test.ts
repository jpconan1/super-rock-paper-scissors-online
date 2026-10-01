import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MatchProjection, ServerSnapshot } from '../src/protocol/protocol';
import { LocalAbmMatch, chooseComputerCommand } from '../src/app/localAbmMatch';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';

describe('LocalAbmMatch', () => {
  test('uses a server receipt as the rewarded local match ID', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({ playerName: 'JP', matchId: 'server-receipt', publish: (snapshot) => snapshots.push(snapshot) });
    match.start();
    expect(snapshots[0]?.matchId).toBe('server-receipt');
    match.destroy();
  });

  test('rejects a locked human class while leaving computer selection unrestricted', () => {
    const match = new LocalAbmMatch({ playerName: 'JP', publish: () => {}, unlockedClassIds: ['lucky'], now: () => 10_000 });
    match.start();
    expect(() => match.send({ type: 'lock-class', classId: 'advantaged' })).toThrow('Class is locked.');
    expect(() => match.send({ type: 'lock-class', classId: 'lucky' })).not.toThrow();
    expect(chooseComputerCommand({ legalActions: ['lock-class'] } as never, () => .999)).toEqual({ type: 'lock-class', classId: 'joe' });
    match.destroy();
  });
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
    expect(latest(snapshots).activeSlot).toBe('slot-1');
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

  test('can start with fixed classes before publishing the first snapshot', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP',
      publish: (snapshot) => snapshots.push(snapshot),
      random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' },
    });
    match.start();

    expect(snapshots).toHaveLength(1);
    expect(variant(snapshots).phase).toBe('idle');
    expect(variant(snapshots).turn).toBe(1);
    expect(variant(snapshots).players.p1.classId).toBe('lucky');
    expect(variant(snapshots).players.p2.classId).toBe('lucky');
    expect(variant(snapshots).legalActions).not.toContain('lock-class');
    match.destroy();
  });

  test('can hold computer actions until a tutorial slide is dismissed', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, computerStartsPaused: true,
    });
    match.start();
    vi.advanceTimersByTime(3_000);
    expect(snapshots).toHaveLength(1);

    match.resumeComputer();
    vi.advanceTimersByTime(1_000);
    expect(variant(snapshots).phase).toBe('waiting');
    expect(variant(snapshots).opponentReady).toBe(true);
    match.destroy();
  });

  test('scripts the tutorial Attack branch, forced Mana reset, and disables Lucky and deadlines', () => {
    const snapshots: ServerSnapshot[] = []; const ending = vi.fn();
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: ending },
    });
    match.start();
    expect(variant(snapshots)).toMatchObject({ hideClassBadges: true, noMoveDeadline: true, players: { p1: { mana: 1 }, p2: { mana: 1 } } });
    expect(latestSnapshot(snapshots).deadlineAt).toBeUndefined();

    match.send({ type: 'choose-move', move: 'attack' });
    vi.advanceTimersByTime(2_000);
    expect(variant(snapshots)).toMatchObject({ players: { p1: { mana: 0 }, p2: { mana: 1 } } });
    expect(variant(snapshots).opponentReady).toBe(true);
    match.send({ type: 'choose-move', move: 'block' });
    vi.advanceTimersByTime(1_000);
    expect(variant(snapshots)).toMatchObject({ players: { p1: { mana: 0 }, p2: { mana: 0 } } });
    match.send({ type: 'choose-move', move: 'mana' });
    expect(variant(snapshots)).toMatchObject({ players: { p1: { mana: 1 }, p2: { mana: 1 } } });
    expect(ending).not.toHaveBeenCalled();
    match.destroy();
  });

  test('routes tutorial lethal branches to their endings without a Lucky survival', () => {
    const bad = vi.fn(); const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: bad },
    });
    match.start(); match.send({ type: 'choose-move', move: 'mana' }); vi.advanceTimersByTime(10_000);
    expect(variant(snapshots).lastRoundWinner).toBe('p2');
    expect(variant(snapshots).luckyProcPlayer).toBeUndefined();
    expect(bad).toHaveBeenCalledWith('bad', false);
    match.destroy();

    const good = vi.fn(); const second: ServerSnapshot[] = [];
    const winning = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => second.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: good },
    });
    winning.start(); winning.send({ type: 'choose-move', move: 'block' }); vi.advanceTimersByTime(2_000);
    winning.send({ type: 'choose-move', move: 'attack' }); vi.advanceTimersByTime(10_000);
    expect(variant(second).lastRoundWinner).toBe('p1');
    expect(good).toHaveBeenCalledWith('good', false);
    winning.destroy();
  });

  test('continues a bad ending into the unlocked human counterpick with normal rules', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      unlockedClassIds: ['lucky'], startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: () => {} },
    });
    match.start(); match.send({ type: 'choose-move', move: 'mana' }); vi.advanceTimersByTime(10_000);
    match.continueAfterTutorialEnding('bad');
    expect(variant(snapshots)).toMatchObject({ phase: 'counter-picking', counterPicker: 'p1' });
    expect(variant(snapshots).hideClassBadges).toBeUndefined();
    expect(variant(snapshots).tutorialShowBlockTag).toBe(true);
    expect(() => match.send({ type: 'lock-class', classId: 'advantaged' })).toThrow('Class is locked.');
    match.send({ type: 'lock-class', classId: 'lucky' });
    expect(variant(snapshots).phase).toBe('idle');
    match.send({ type: 'choose-move', move: 'mana' });
    expect(latestSnapshot(snapshots).deadlineAt).toBeDefined();
    match.destroy();
  });

  test('scripts half-beat CPU previews and selects Juggernaut after the good ending', () => {
    const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: () => {} },
    });
    match.start(); match.send({ type: 'choose-move', move: 'block' }); vi.advanceTimersByTime(2_000);
    match.send({ type: 'choose-move', move: 'attack' }); vi.advanceTimersByTime(10_000);
    match.continueAfterTutorialEnding('good');
    const before = snapshots.length;
    vi.advanceTimersByTime(2_249);
    expect(snapshots).toHaveLength(before);
    vi.advanceTimersByTime(1);
    let previews = snapshots.slice(before).flatMap(({ events }) => events.filter(({ type }) => type === 'class-preview'));
    expect(previews.map(({ payload }) => (payload as { classId: string }).classId)).toEqual(['advantaged']);
    vi.advanceTimersByTime(375);
    previews = snapshots.slice(before).flatMap(({ events }) => events.filter(({ type }) => type === 'class-preview'));
    expect(previews.map(({ payload }) => (payload as { classId: string }).classId)).toEqual(['advantaged', 'thief']);
    vi.advanceTimersByTime(375);
    previews = snapshots.slice(before).flatMap(({ events }) => events.filter(({ type }) => type === 'class-preview'));
    expect(previews.map(({ payload }) => (payload as { classId: string }).classId)).toEqual(['advantaged', 'thief', 'juggernaut']);
    expect(variant(snapshots).phase).toBe('counter-picking');
    vi.advanceTimersByTime(1_499);
    expect(variant(snapshots).phase).toBe('counter-picking');
    vi.advanceTimersByTime(1);
    expect(variant(snapshots)).toMatchObject({ phase: 'idle', players: { p2: { classId: 'juggernaut' } } });
    match.send({ type: 'choose-move', move: 'mana' });
    expect(latestSnapshot(snapshots).deadlineAt).toBeDefined();
    match.destroy();
  });

  test('does not reopen an ending after a continuing-round tie', () => {
    const ending = vi.fn(); const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: ending },
    });
    match.start(); match.send({ type: 'choose-move', move: 'block' }); vi.advanceTimersByTime(2_000);
    match.send({ type: 'choose-move', move: 'attack' }); vi.advanceTimersByTime(10_000);
    expect(ending).toHaveBeenCalledOnce();
    match.continueAfterTutorialEnding('good');
    vi.advanceTimersByTime(5_000);
    expect(variant(snapshots).players.p2.classId).toBe('juggernaut');
    match.send({ type: 'choose-move', move: 'attack' });
    vi.advanceTimersByTime(2_000);
    expect(variant(snapshots).lastCompleteMoves).toEqual({ p1: 'attack', p2: 'attack' });
    expect(ending).toHaveBeenCalledOnce();
    match.destroy();
  });

  test('marks the second round ending for the shortened round-three slide', () => {
    const ending = vi.fn(); const snapshots: ServerSnapshot[] = [];
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: ending },
    });
    match.start(); match.send({ type: 'choose-move', move: 'block' }); vi.advanceTimersByTime(2_000);
    match.send({ type: 'choose-move', move: 'attack' }); vi.advanceTimersByTime(10_000);
    match.continueAfterTutorialEnding('good'); vi.advanceTimersByTime(5_000);
    match.send({ type: 'choose-move', move: 'mana' }); vi.advanceTimersByTime(10_000);
    expect(variant(snapshots)).toMatchObject({ round: 3, score: { p1: 1, p2: 1 } });
    expect(ending).toHaveBeenNthCalledWith(2, 'bad', true);
    match.destroy();
  });

  test('hands the tutorial to the ordinary computer after reaching 2-1 Mana', () => {
    const snapshots: ServerSnapshot[] = []; const ending = vi.fn();
    const match = new LocalAbmMatch({
      playerName: 'JP', publish: (snapshot) => snapshots.push(snapshot), random: () => 0,
      startingClasses: { p1: 'lucky', p2: 'lucky' }, tutorial: { onEnding: ending },
    });
    match.start(); match.send({ type: 'choose-move', move: 'block' }); vi.advanceTimersByTime(2_000);
    match.send({ type: 'choose-move', move: 'mana' });
    expect(variant(snapshots)).toMatchObject({ players: { p1: { mana: 2 }, p2: { mana: 1 } } });
    vi.advanceTimersByTime(1_000);
    expect(variant(snapshots).opponentReady).toBe(true);
    expect(ending).not.toHaveBeenCalled();
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
    expect(chooseComputerCommand(projection, () => 0)).toEqual({ type: 'choose-move', move: 'mana', ability: 'steal' });
  });

  test('activates Conjure immediately and answers during its private response', () => {
    const base = {
      self: 'p2', phase: 'idle', turn: 1, round: 1, score: { p1: 0, p2: 0 },
      players: {
        p1: { classId: 'lucky', mana: 1, blocks: 5, strikes: 0 },
        p2: { classId: 'conjurer', mana: 1, blocks: 5, strikes: 0, abilityUses: { conjure: 2 } },
      },
      opponentReady: false,
    } satisfies Omit<AbmProjection, 'legalActions'>;
    expect(chooseComputerCommand({ ...base, legalActions: ['attack', 'block', 'mana', 'conjure'] }, () => 0))
      .toEqual({ type: 'activate-ability', ability: 'conjure' });
    expect(chooseComputerCommand({ ...base, phase: 'conjurer-choosing', conjurer: 'p2', conjuredMove: 'attack', legalActions: ['block', 'mana'] }, () => 0))
      .toEqual({ type: 'choose-move', move: 'block' });
  });

  test('arms Flame with the computer move when available', () => {
    const projection = {
      self: 'p2', phase: 'idle', turn: 1, round: 1, score: { p1: 0, p2: 0 },
      players: {
        p1: { classId: 'lucky', mana: 1, blocks: 5, strikes: 0 },
        p2: { classId: 'fireborne', mana: 1, blocks: 5, strikes: 0, abilityUses: { flame: 1 } },
      },
      opponentReady: false, legalActions: ['block', 'mana', 'flame'],
    } satisfies AbmProjection;
    expect(chooseComputerCommand(projection, () => 0)).toEqual({ type: 'choose-move', move: 'block', ability: 'flame' });
  });
});

function latestSnapshot(snapshots: ServerSnapshot[]): ServerSnapshot { return snapshots[snapshots.length - 1]!; }
function latest(snapshots: ServerSnapshot[]): MatchProjection { return latestSnapshot(snapshots).projection as MatchProjection; }
function variant(snapshots: ServerSnapshot[]): AbmProjection { return latest(snapshots).variant as AbmProjection; }
