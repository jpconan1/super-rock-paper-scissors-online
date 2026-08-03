import { describe, expect, test, vi } from 'vitest';
import { AnimationPlayer } from '../src/animation/animationPlayer';

describe('AnimationPlayer', () => {
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
