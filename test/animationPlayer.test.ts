import { describe, expect, test, vi } from 'vitest';
import { AnimationPlayer } from '../src/animation/animationPlayer';

describe('AnimationPlayer', () => {
  test('calls host timers without changing their receiver', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const receiver = globalThis;
    globalThis.setTimeout = function (this: typeof globalThis, handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) {
      if (this !== receiver) throw new TypeError('Illegal invocation');
      return originalSetTimeout(handler, timeout, ...arguments_) as ReturnType<typeof setTimeout>;
    } as typeof setTimeout;
    globalThis.clearTimeout = function (this: typeof globalThis, timer?: ReturnType<typeof setTimeout>) {
      if (this !== receiver) throw new TypeError('Illegal invocation');
      return originalClearTimeout(timer);
    } as typeof clearTimeout;
    try {
      const commits: string[] = [];
      const player = new AnimationPlayer<string>({ commit: (value) => commits.push(value) });
      await player.play([{ value: 'frame', durationMs: 0 }]);
      expect(commits).toEqual(['frame']);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test('advances logical sheets independently and commits final state', async () => {
    vi.useFakeTimers();
    const values: string[] = [];
    const player = new AnimationPlayer<string>({ commit: (value) => values.push(value) });
    const finished = player.play([
      { value: 'wipe-1-sheet', durationMs: 250 },
      { value: 'wipe-2-sheet', durationMs: 500 },
    ], 'closed');
    await vi.advanceTimersByTimeAsync(750);
    await finished;
    expect(values).toEqual(['wipe-1-sheet', 'wipe-2-sheet', 'closed']);
    vi.useRealTimers();
  });

  test('cancels and immediately commits a known state', async () => {
    vi.useFakeTimers();
    const values: string[] = [];
    const player = new AnimationPlayer<string>({ commit: (value) => values.push(value) });
    const finished = player.play([{ value: 'animating', durationMs: 1000 }]);
    player.cancel('open');
    await finished;
    vi.advanceTimersByTime(1000);
    expect(values).toEqual(['animating', 'open']);
    vi.useRealTimers();
  });
});
