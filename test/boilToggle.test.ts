import { describe, expect, test, vi } from 'vitest';
import { isBoilEnabled, setBoilEnabled } from '../src/input/boilToggle';

describe('boil setting', () => {
  test('defaults on and reads a persisted off choice', () => {
    expect(isBoilEnabled({ getItem: () => null })).toBe(true);
    expect(isBoilEnabled({ getItem: () => 'false' })).toBe(false);
  });

  test('updates the shared clock and persists the choice', () => {
    const clock = { setEnabled: vi.fn() };
    const storage = { setItem: vi.fn() };
    setBoilEnabled(false, clock as never, storage);
    expect(clock.setEnabled).toHaveBeenCalledWith(false);
    expect(storage.setItem).toHaveBeenCalledWith('super-rps:boil-enabled', 'false');
  });
});
