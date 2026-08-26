import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LocalShellSessionAdapter, serializeVariantCommand, WebSocketShellSessionAdapter } from '../src/app/shellSessionAdapter';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('matchmaking session adapters', () => {
  test('preserves ABM command envelopes while unwrapping legacy move commands', () => {
    const abm = { type: 'choose-move', move: 'attack' } as const;
    expect(serializeVariantCommand(abm)).toBe(abm);
    expect(serializeVariantCommand({ type: 'move', move: 'fireball' })).toBe('fireball');
  });
  beforeEach(() => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(`local:${key}`) ?? null,
      setItem: (key: string, value: string) => values.set(`local:${key}`, value),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('cancelled in-flight matchmaking cannot connect a returned match', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return pending.promise;
    });
    const socket = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', socket);

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.startMatchmaking();
    adapter.startMatchmaking();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    adapter.cancelMatchmaking();
    pending.resolve(new Response(JSON.stringify({
      status: 'matched', matchId: 'match-1', seat: 'p1', token: 'secret',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    await Promise.resolve();

    expect(socket).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
  });

  test('entering the lobby detects server state without blocking offline access', async () => {
    const connection = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection, matchFound: vi.fn(), snapshot: vi.fn() });

    await adapter.enterLobby('Player One');
    await adapter.enterLobby('Player Two');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/health');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    expect(connection).toHaveBeenLastCalledWith('offline');
  });

  test('local matchmaking timer is cleared by cancellation', () => {
    const matchFound = vi.fn();
    const adapter = new LocalShellSessionAdapter();
    adapter.subscribe({ connection: vi.fn(), matchFound, snapshot: vi.fn() });

    adapter.startMatchmaking();
    adapter.cancelMatchmaking();
    vi.advanceTimersByTime(1_000);

    expect(matchFound).not.toHaveBeenCalled();
  });
});
