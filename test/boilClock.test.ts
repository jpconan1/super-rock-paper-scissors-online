import { describe, expect, test, vi } from 'vitest';
import { BOIL_FRAME_MS, BoilClock } from '../src/animation/boilClock';

function fakeDocument() {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  return {
    hidden: false,
    addEventListener: (_name: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
    removeEventListener: (_name: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    dispatch() { for (const listener of listeners) typeof listener === 'function' ? listener(new Event('visibilitychange')) : listener.handleEvent(new Event('visibilitychange')); },
  };
}

describe('BoilClock', () => {
  test('ticks at 8 fps and wraps after frame two', () => {
    vi.useFakeTimers();
    const page = fakeDocument();
    const clock = new BoilClock(page);
    const frames: number[] = [];
    const unsubscribe = clock.subscribe((frame) => frames.push(frame));

    vi.advanceTimersByTime(BOIL_FRAME_MS * 3);
    expect(frames).toEqual([0, 1, 2, 0]);

    unsubscribe();
    clock.destroy();
    vi.useRealTimers();
  });

  test('pauses while hidden and resumes without catch-up', () => {
    vi.useFakeTimers();
    const page = fakeDocument();
    const clock = new BoilClock(page);
    const frames: number[] = [];
    clock.subscribe((frame) => frames.push(frame));
    page.hidden = true;
    page.dispatch();
    vi.advanceTimersByTime(1000);
    expect(frames).toEqual([0]);
    page.hidden = false;
    page.dispatch();
    vi.advanceTimersByTime(BOIL_FRAME_MS);
    expect(frames).toEqual([0, 1]);
    clock.destroy();
    vi.useRealTimers();
  });
});
