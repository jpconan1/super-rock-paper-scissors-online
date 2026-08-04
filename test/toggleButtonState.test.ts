import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BUTTON_FRAME_MS } from '../src/input/gameButtonState';
import { JUICE_FADE_FRAME_MS } from '../src/input/gameButtonState';
import { ToggleButtonState, type ToggleButtonView } from '../src/input/toggleButtonState';

describe('ToggleButtonState', () => {
  beforeEach(() => vi.useFakeTimers());

  test('toggles immediately through between and only juices when turning on', async () => {
    const views: ToggleButtonView[] = [];
    const change = vi.fn();
    const state = new ToggleButtonState({ pressed: false, render: (view) => views.push(view), change });

    expect(state.toggle()).toBe(true);
    expect(change).toHaveBeenLastCalledWith(true);
    expect(views.at(-1)).toEqual({ pressed: true, visual: 'between', juiceOpacity: 1 });
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(views.at(-1)?.visual).toBe('on');
    expect(views.at(-1)?.juiceOpacity).toBe(1);
    await vi.advanceTimersByTimeAsync(JUICE_FADE_FRAME_MS * 3);
    expect(views.at(-1)).toEqual({ pressed: true, visual: 'on', juiceOpacity: 0 });

    expect(state.toggle()).toBe(false);
    expect(change).toHaveBeenLastCalledWith(false);
    expect(views.at(-1)).toEqual({ pressed: false, visual: 'between', juiceOpacity: 0 });
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(views.at(-1)).toEqual({ pressed: false, visual: 'off', juiceOpacity: 0 });
  });

  test('rapid toggles restart the between frame toward the latest state', async () => {
    const views: ToggleButtonView[] = [];
    const state = new ToggleButtonState({ pressed: false, render: (view) => views.push(view), change() {} });
    state.toggle();
    state.toggle();
    await vi.advanceTimersByTimeAsync(BUTTON_FRAME_MS);
    expect(views.at(-1)).toEqual({ pressed: false, visual: 'off', juiceOpacity: 0 });
  });
});
