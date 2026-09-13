import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LocalShellSessionAdapter, serializeVariantCommand, WebSocketShellSessionAdapter } from '../src/app/shellSessionAdapter';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('matchmaking session adapters', () => {
  let storageValues: Map<string, string>;
  test('preserves ABM command envelopes while unwrapping legacy move commands', () => {
    const abm = { type: 'choose-move', move: 'attack' } as const;
    expect(serializeVariantCommand(abm)).toBe(abm);
    const preview = { type: 'preview-class', classId: 'investor' };
    expect(serializeVariantCommand(preview)).toBe(preview);
    expect(serializeVariantCommand({ type: 'move', move: 'fireball' })).toBe('fireball');
  });
  beforeEach(() => {
    vi.useFakeTimers();
    storageValues = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storageValues.get(key) ?? null,
      setItem: (key: string, value: string) => storageValues.set(key, value),
      removeItem: (key: string) => storageValues.delete(key),
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storageValues.get(`local:${key}`) ?? null,
      setItem: (key: string, value: string) => storageValues.set(`local:${key}`, value),
      removeItem: (key: string) => storageValues.delete(`local:${key}`),
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
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://example.test/matchmaking');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      guestId: expect.any(String), guestSecret: expect.any(String), attemptId: expect.any(String),
    });
  });

  test('guest-session failure prevents entering a fake offline lobby', async () => {
    const connection = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection, matchFound: vi.fn(), snapshot: vi.fn() });

    await expect(adapter.enterLobby('Player One')).rejects.toThrow('Guest session failed: 401');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/guest-session');
    expect(connection).toHaveBeenLastCalledWith('connected');
  });

  test('persists a server-issued guest and suggests its saved name after reload', async () => {
    const session = { playerId: 'server-guest', guestSecret: 'secret'.repeat(12), displayName: 'Saved Player', rating: 1512 };
    let issued = false;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/guest-session')) { issued = true; return Promise.resolve(new Response(JSON.stringify(session), { status: 200 })); }
      if (url.endsWith('/player-session')) return Promise.resolve(issued
        ? new Response(JSON.stringify({ ...session, isAnonymous: true }), { status: 200 })
        : new Response(null, { status: 401 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }));
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));

    const first = new WebSocketShellSessionAdapter('https://example.test');
    expect(await first.enterLobby('Saved Player')).toMatchObject({ playerId: 'server-guest', displayName: 'Saved Player', rating: 1512 });
    const reloaded = new WebSocketShellSessionAdapter('https://example.test');

    expect(reloaded.suggestedPlayerName()).toBe('Saved Player');
    expect(storageValues.get('local:super-rps-guest')).toBe('server-guest');
    expect(storageValues.get('local:super-rps-guest-secret')).toBe(session.guestSecret);
  });

  test('resumes a saved guest using its canonical server name', async () => {
    storageValues.set('local:super-rps-guest', 'legacy-guest');
    storageValues.set('local:super-rps-guest-secret', 'l'.repeat(64));
    const session = { playerId: 'legacy-guest', guestSecret: 'l'.repeat(64), displayName: 'Legacy Name', rating: 1620 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...session, isAnonymous: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    expect(await adapter.enterLobby('Legacy Name')).toMatchObject({ displayName: 'Legacy Name', rating: 1620 });

    expect(adapter.suggestedPlayerName()).toBe('Legacy Name');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      guestId: 'legacy-guest', guestSecret: 'l'.repeat(64),
      displayName: 'Legacy Name',
    });
  });

  test('logging out preserves the saved guest profile', async () => {
    storageValues.set('local:super-rps-guest', 'saved-guest');
    storageValues.set('local:super-rps-guest-secret', 's'.repeat(64));
    storageValues.set('local:super-rps-guest-name', 'Saved Name');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await adapter.signOut();

    expect(storageValues.get('local:super-rps-guest')).toBe('saved-guest');
    expect(storageValues.get('local:super-rps-guest-secret')).toBe('s'.repeat(64));
    expect(adapter.suggestedPlayerName()).toBe('Saved Name');
  });

  test('title Google flow creates an ephemeral player without submitting the saved guest', async () => {
    storageValues.set('local:super-rps-guest', 'saved-guest');
    storageValues.set('local:super-rps-guest-secret', 's'.repeat(64));
    storageValues.set('local:super-rps-guest-name', 'Saved Name');
    const fresh = { playerId: 'fresh-player', guestSecret: 'f'.repeat(64), displayName: 'Google Name', rating: 1500 };
    let associationAttempts = 0;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/guest-session')) return Promise.resolve(new Response(JSON.stringify(fresh), { status: 200 }));
      if (url.endsWith('/player-session') && init?.method === 'POST') {
        associationAttempts++;
        return Promise.resolve(associationAttempts === 1 ? new Response(null, { status: 401 })
          : new Response(JSON.stringify({ ...fresh, isAnonymous: true }), { status: 200 }));
      }
      if (url.endsWith('/player-session')) return Promise.resolve(new Response(null, { status: 401 }));
      if (url.includes('/api/auth/sign-in/social')) return Promise.resolve(new Response(JSON.stringify({ url: 'https://accounts.google.test/' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ user: { id: 'anonymous-user', name: 'Guest' } }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.requestGoogleSignInFromTitle('Google Name', 'https://game.test/success', 'https://game.test/error'))
      .resolves.toBe('https://accounts.google.test/');

    const guestRequest = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/guest-session'));
    expect(JSON.parse(String(guestRequest?.[1]?.body))).toEqual({ displayName: 'Google Name' });
    expect(storageValues.get('local:super-rps-guest')).toBe('saved-guest');
    expect(storageValues.get('local:super-rps-guest-secret')).toBe('s'.repeat(64));
    expect(storageValues.get('local:super-rps-guest-name')).toBe('Saved Name');
  });

  test('completes an intentional Google return and removes its URL marker', async () => {
    storageValues.set('local:super-rps-guest', 'saved-guest');
    storageValues.set('local:super-rps-guest-secret', 's'.repeat(64));
    storageValues.set('local:super-rps-guest-name', 'Saved Guest');
    storageValues.set('super-rps-google-flow', 'title');
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: 'https://game.test/?google-sign-in-return=1' });
    vi.stubGlobal('history', { state: null, replaceState });
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        playerId: 'google-player', displayName: 'Google Player', rating: 1700, isAnonymous: false,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    expect(adapter.isGoogleSignInReturn()).toBe(true);
    await expect(adapter.completeGoogleSignIn()).resolves.toMatchObject({ playerId: 'google-player' });

    expect(replaceState).toHaveBeenCalledOnce();
    expect(String(replaceState.mock.calls[0]?.[2])).toBe('https://game.test/');
    expect(adapter.accountState()).toMatchObject({ signedIn: true, displayName: 'Google Player' });
    expect(storageValues.get('local:super-rps-guest')).toBe('saved-guest');
    expect(storageValues.get('local:super-rps-guest-secret')).toBe('s'.repeat(64));
    expect(storageValues.get('local:super-rps-guest-name')).toBe('Saved Guest');
  });

  test('successful guest claim clears only the revoked guest credentials', async () => {
    storageValues.set('local:super-rps-guest', 'claimed-guest');
    storageValues.set('local:super-rps-guest-secret', 'c'.repeat(64));
    storageValues.set('local:super-rps-guest-name', 'Claimed Guest');
    storageValues.set('super-rps-google-flow', 'claim');
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ playerId: 'claimed-guest', displayName: 'Claimed Guest', rating: 1600, isAnonymous: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await expect(adapter.finishGoogleSignIn()).resolves.toMatchObject({ playerId: 'claimed-guest' });

    expect(storageValues.has('local:super-rps-guest')).toBe(false);
    expect(storageValues.has('local:super-rps-guest-secret')).toBe(false);
    expect(adapter.accountState()).toMatchObject({ signedIn: true, isAnonymous: false, rating: 1600 });
  });

  test('updates the authenticated display name and local account state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ playerId: 'player-1', displayName: 'New Name', rating: 1550 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.updateDisplayName('New Name')).resolves.toMatchObject({ displayName: 'New Name' });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(adapter.accountState()).toMatchObject({ playerId: 'player-1', displayName: 'New Name', rating: 1550 });
  });

  test('lobby and whiteboard authenticate without putting secrets in URLs', async () => {
    const socket = vi.fn((_url: string | URL, _protocols?: string | string[]) => ({ addEventListener: vi.fn(), close: vi.fn() }));
    vi.stubGlobal('WebSocket', socket);
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => Promise.resolve(new Response(JSON.stringify(
      String(input).endsWith('/guest-session')
        ? { playerId: 'guest-id', guestSecret: 's'.repeat(64), displayName: 'Player One', rating: 1500 }
        : { ok: true },
    ), { status: 200 }))));
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await adapter.enterLobby('Player One');

    expect(socket).toHaveBeenCalledTimes(2);
    for (const [rawUrl, protocols] of socket.mock.calls) {
      const url = new URL(String(rawUrl));
      if (!Array.isArray(protocols)) throw new Error('Expected WebSocket protocol list.');
      expect(url.searchParams.has('secret')).toBe(false);
      expect(url.searchParams.has('token')).toBe(false);
      expect(protocols).toEqual([expect.stringMatching(/^super-rps-(?:lobby|whiteboard)-v1$/), expect.any(String)]);
      expect(url.toString()).not.toContain(String(protocols[1]));
    }
  });

  test('match seat token is sent as a subprotocol instead of a URL parameter', async () => {
    const socketInstance = { addEventListener: vi.fn(), close: vi.fn() };
    const socket = vi.fn((_url: string | URL, _protocols?: string | string[]) => socketInstance);
    vi.stubGlobal('WebSocket', socket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'matched', matchId: 'abc123', seat: 'p1', token: 'private-seat-token',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    adapter.startMatchmaking();
    for (let index = 0; index < 6; index++) await Promise.resolve();

    expect(socket).toHaveBeenCalledOnce();
    const [rawUrl, protocols] = socket.mock.calls[0]!;
    const url = new URL(String(rawUrl));
    expect(url.searchParams.get('seat')).toBe('p1');
    expect(url.searchParams.has('token')).toBe(false);
    expect(protocols).toEqual(['super-rps-match-v1', 'private-seat-token']);
    expect(url.toString()).not.toContain('private-seat-token');
  });

  test('a second tab is quietly released when another tab owns the guest queue entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'owned-elsewhere' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const rejected = vi.fn();
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection: vi.fn(), matchFound: vi.fn(), snapshot: vi.fn(), matchmakingRejected: rejected });

    adapter.startMatchmaking();
    for (let index = 0; index < 6; index++) await Promise.resolve();

    expect(rejected).toHaveBeenCalledOnce();
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
