import { describe, expect, test, vi } from 'vitest';
import { AssetLoader } from '../src/assets/assetLoader';

describe('AssetLoader', () => {
  test('deduplicates concurrent image loads and releases decoded references', async () => {
    const load = vi.fn(async () => ({}) as HTMLImageElement);
    const loader = new AssetLoader(load);
    const first = loader.retainUrls(['/button.webp', '/button.webp']);
    const second = loader.retainUrls(['/button.webp']);

    await Promise.all([first.ready, second.ready]);
    expect(load).toHaveBeenCalledTimes(1);

    first.release();
    second.release();
    const third = loader.retainUrls(['/button.webp']);
    await third.ready;
    expect(load).toHaveBeenCalledTimes(2);
    third.release();
  });

  test('retries failed image loads', async () => {
    vi.useFakeTimers();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue({} as HTMLImageElement);
    const loader = new AssetLoader(load);
    const lease = loader.retainUrls(['/button.webp']);

    await vi.advanceTimersByTimeAsync(150);
    await lease.ready;
    expect(load).toHaveBeenCalledTimes(2);
    lease.release();
    vi.useRealTimers();
  });
});
