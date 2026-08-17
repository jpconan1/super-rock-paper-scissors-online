import { afterEach, describe, expect, test, vi } from 'vitest';
import { AnimationTimeline } from '../src/animation/animationTimeline';

afterEach(() => vi.useRealTimers());

describe('AnimationTimeline', () => {
  test('seeks active events, skips expired events, and deduplicates IDs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const handled = vi.fn();
    const timeline = new AnimationTimeline(handled, false);
    const active = { id: 'active', type: 'reveal' as const, startsAt: 9_500, endsAt: 10_500 };
    const expired = { id: 'expired', type: 'score' as const, startsAt: 8_000, endsAt: 9_000 };
    timeline.schedule([active, expired], 10_000);
    timeline.schedule([active], 10_000);
    expect(handled).toHaveBeenCalledOnce();
    expect(handled.mock.calls[0]![0].elapsedMs).toBe(500);
  });

  test('cancels future events and reduced motion commits their final point', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const cancelled = vi.fn();
    const timeline = new AnimationTimeline(cancelled, false);
    timeline.schedule([{ id: 'future', type: 'wipe', startsAt: 11_000, endsAt: 12_000 }], 10_000);
    timeline.cancel();
    vi.advanceTimersByTime(2_000);
    expect(cancelled).not.toHaveBeenCalled();

    const reduced = vi.fn();
    const reducedTimeline = new AnimationTimeline(reduced, true);
    reducedTimeline.schedule([{ id: 'reduced', type: 'ready', startsAt: 10_000, endsAt: 11_000 }], 10_000);
    expect(reduced.mock.calls[0]![0].elapsedMs).toBe(1_000);
  });
});
