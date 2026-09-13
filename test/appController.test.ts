import { describe, expect, test, vi } from 'vitest';
import { AppController, GOOGLE_AUTH_POPUP_MESSAGE, googlePopupCallbackUrl, isGoogleAuthPopupMessage } from '../src/app/appController';
import type { VariantPresentation } from '../src/core/variant';
import { PROTOCOL_VERSION } from '../src/protocol/protocol';

const lease = () => ({ ready: Promise.resolve(), release: vi.fn() });

describe('AppController', () => {
  test('builds same-origin popup callbacks and validates the complete handshake', () => {
    vi.stubGlobal('location', { origin: 'https://game.test' });
    const popup = {} as Window;
    const callback = new URL(googlePopupCallbackUrl('success', 'attempt-1'));
    expect(callback.origin).toBe('https://game.test');
    expect(callback.pathname).toBe('/auth-complete.html');
    expect(callback.searchParams.get('nonce')).toBe('attempt-1');
    const valid = {
      origin: 'https://game.test', source: popup,
      data: { type: GOOGLE_AUTH_POPUP_MESSAGE, nonce: 'attempt-1', result: 'success' },
    } as unknown as MessageEvent;
    expect(isGoogleAuthPopupMessage(valid, popup, 'attempt-1', 'https://game.test')).toBe(true);
    expect(isGoogleAuthPopupMessage(valid, popup, 'another-attempt', 'https://game.test')).toBe(false);
    expect(isGoogleAuthPopupMessage(valid, {} as Window, 'attempt-1', 'https://game.test')).toBe(false);
    expect(isGoogleAuthPopupMessage(valid, popup, 'attempt-1', 'https://evil.test')).toBe(false);
  });

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
