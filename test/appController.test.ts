import { describe, expect, test, vi } from 'vitest';
import { AppController } from '../src/app/appController';
import type { VariantPresentation } from '../src/core/variant';
import { PROTOCOL_VERSION } from '../src/protocol/protocol';

const lease = () => ({ ready: Promise.resolve(), release: vi.fn() });

describe('AppController', () => {
  test('loads opaque slots through the presentation contract', async () => {
    const presentation: VariantPresentation<unknown, unknown> = {
      preload: vi.fn(async () => lease()),
      mount: vi.fn(),
      render: vi.fn(),
      unmount: vi.fn(),
    };
    const controller = new AppController({} as HTMLElement, new Map([['slot-4', async () => presentation]]));
    await controller.loadSlot('slot-4', vi.fn());
    controller.render({ protocolVersion: PROTOCOL_VERSION, matchId: 'm', revision: 1, serverTime: 10, projection: {}, events: [] });
    expect(presentation.preload).toHaveBeenCalledOnce();
    expect(presentation.mount).toHaveBeenCalledOnce();
    expect(presentation.render).toHaveBeenCalledOnce();
  });

  test('aborts and unmounts the active presentation', async () => {
    let signal: AbortSignal | undefined;
    const presentation: VariantPresentation<unknown, unknown> = {
      preload: async () => lease(),
      mount: (context) => { signal = context.signal; },
      render: vi.fn(),
      unmount: vi.fn(),
    };
    const controller = new AppController({} as HTMLElement, new Map([['slot-1', async () => presentation]]));
    await controller.loadSlot('slot-1', vi.fn());
    controller.unmount();
    expect(signal?.aborted).toBe(true);
    expect(presentation.unmount).toHaveBeenCalledOnce();
  });
});
