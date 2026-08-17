import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  BUTTON_FRAME_MS,
  GameButtonState,
  JUICE_FADE_FRAME_MS,
  type GameButtonView,
} from '../src/input/gameButtonState';

describe('GameButtonState', () => {
  beforeEach(() => vi.useFakeTimers());

  function setup() {
    const views: GameButtonView[] = [];
    const activate = vi.fn();
    const state = new GameButtonState({ render: (view) => views.push(view), activate });
    return { state, views, activate };
  }

  test('normal press holds depressed then activates after release-between', async () => {
    const { state, views, activate } = setup();
    state.press();
    await vi.advanceTimersByTimeAsync(JUICE_FADE_FRAME_MS * 3);
    expect(views.at(-1)).toEqual({ visual: 'depressed', juiceOpacity: 0 });
    state.release();
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(views.at(-1)).toEqual({ visual: 'up', juiceOpacity: 0 });
    expect(activate).toHaveBeenCalledOnce();
  });

  test('quick tap completes every animation frame', async () => {
    const { state, views, activate } = setup();
    state.press();
    state.release();
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(views.some((view) => view.visual === 'depressed' && view.juiceOpacity === 1)).toBe(true);
    expect(views.some((view) => view.visual === 'between')).toBe(true);
    expect(views.at(-1)?.visual).toBe('up');
    expect(activate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(JUICE_FADE_FRAME_MS * 3);
    expect(views.at(-1)).toEqual({ visual: 'up', juiceOpacity: 0 });
  });

  test('leaving immediately returns up; cancellation and repeated press never activate', async () => {
    const { state, views, activate } = setup();
    expect(state.press()).toBe(true);
    expect(state.press()).toBe(false);
    state.leave();
    expect(views.at(-1)).toEqual({ visual: 'up', juiceOpacity: 0 });
    state.release();
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(activate).not.toHaveBeenCalled();
    expect(state.press()).toBe(true);
    state.cancel();
    await vi.runAllTimersAsync();
    expect(activate).not.toHaveBeenCalled();
  });

  test('long hold, keyboard-equivalent calls, rapid presses activate exactly once each', async () => {
    const { state, activate } = setup();
    state.press();
    await vi.advanceTimersByTimeAsync(2000);
    state.release();
    state.release();
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(state.press()).toBe(true);
    state.release();
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  test('can be externally locked in the depressed frame', () => {
    const { state, views, activate } = setup();
    state.setLockedDepressed(true);
    expect(views.at(-1)).toEqual({ visual: 'depressed', juiceOpacity: 0 });
    expect(state.press()).toBe(false);
    state.release();
    expect(activate).not.toHaveBeenCalled();
    state.setLockedDepressed(false);
    expect(views.at(-1)).toEqual({ visual: 'up', juiceOpacity: 0 });
    expect(state.press()).toBe(true);
  });
});
