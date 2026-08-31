import { describe, expect, test, vi } from 'vitest';
import { recoverFromStaleChunk } from '../src/app/staleChunkRecovery';

describe('stale chunk recovery', () => {
  test('reloads once when a deployed chunk disappeared', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const event = { preventDefault: vi.fn() } as unknown as Event;
    const reload = vi.fn();

    recoverFromStaleChunk(event, storage, reload, 100_000);
    recoverFromStaleChunk(event, storage, reload, 100_001);

    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });

  test('reloads even when browser storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const reload = vi.fn();

    recoverFromStaleChunk({ preventDefault: vi.fn() } as unknown as Event, storage, reload);

    expect(reload).toHaveBeenCalledOnce();
  });
});
