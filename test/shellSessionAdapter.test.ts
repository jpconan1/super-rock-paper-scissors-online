import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LocalShellSessionAdapter, serializeVariantCommand, WebSocketShellSessionAdapter } from '../src/app/shellSessionAdapter';
import { DEFAULT_CUSTOM_EMBLEM_DOCUMENT } from '../src/core/customEmblem';
import { createEmptyWhiteboard, type WhiteboardClientMessage } from '../src/whiteboard/protocol';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('matchmaking session adapters', () => {
  let storageValues: Map<string, string>;
  test('shows the server reason when a custom emblem save is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid custom emblem document.' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })));
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await expect(adapter.saveCustomEmblem(DEFAULT_CUSTOM_EMBLEM_DOCUMENT, new Blob(['art'], { type: 'image/webp' })))
      .rejects.toThrow('Invalid custom emblem document.');
  });
  test('marks the lobby reconnecting when either socket drops and restores it after both recover', () => {
    const sockets: Array<{ readyState: number; emit(type: string, data?: string): void }> = [];
    class SocketMock {
      static OPEN = 1;
      readyState = 0;
      private listeners = new Map<string, Array<(event: { data?: string }) => void>>();
      constructor() { sockets.push(this); }
      addEventListener(type: string, listener: (event: { data?: string }) => void) { this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]); }
      send() {}
      close() {}
      emit(type: string, data?: string) {
        if (type === 'open') this.readyState = 1;
        if (type === 'close') this.readyState = 3;
        for (const listener of this.listeners.get(type) ?? []) listener({ data });
      }
    }
    vi.stubGlobal('WebSocket', SocketMock);
    const connection = vi.fn();
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection, matchFound: vi.fn(), snapshot: vi.fn() });
    const internals = adapter as unknown as { onlineActive: boolean; whiteboardActive: boolean; connectLobbyPresence(): void; connectWhiteboard(): void };
    internals.onlineActive = true; internals.whiteboardActive = true;
    internals.connectLobbyPresence(); internals.connectWhiteboard();
    sockets[0]!.emit('open'); sockets[1]!.emit('open');
    expect(connection).toHaveBeenLastCalledWith('reconnecting');
    sockets[1]!.emit('message', JSON.stringify({ type: 'snapshot', board: createEmptyWhiteboard() }));
    expect(connection).toHaveBeenLastCalledWith('connected');
    sockets[1]!.emit('close');
    expect(connection).toHaveBeenLastCalledWith('reconnecting');
    vi.runOnlyPendingTimers();
    sockets[2]!.emit('open');
    sockets[2]!.emit('message', JSON.stringify({ type: 'snapshot', board: createEmptyWhiteboard() }));
    expect(connection).toHaveBeenLastCalledWith('connected');
    adapter.destroy();
  });
  test('checks whiteboard sequence and reconnects when a silent socket stops responding', () => {
    const sockets: Array<{ readyState: number; sent: string[]; emit(type: string, data?: string): void }> = [];
    class SocketMock {
      static OPEN = 1;
      readyState = 0;
      sent: string[] = [];
      private listeners = new Map<string, Array<(event: { data?: string }) => void>>();
      constructor() { sockets.push(this); }
      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]);
      }
      send(data: string) { this.sent.push(data); }
      close() { this.readyState = 3; }
      emit(type: string, data?: string) {
        this.readyState = type === 'open' ? 1 : this.readyState;
        for (const listener of this.listeners.get(type) ?? []) listener({ data });
      }
    }
    vi.stubGlobal('WebSocket', SocketMock);
    const connection = vi.fn();
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection, matchFound: vi.fn(), snapshot: vi.fn() });
    const internals = adapter as unknown as { onlineActive: boolean; whiteboardActive: boolean; connectWhiteboard(): void };
    internals.onlineActive = true; internals.whiteboardActive = true;
    internals.connectWhiteboard();
    sockets[0]!.emit('open');
    vi.advanceTimersByTime(10_000);
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({ type: 'sync', sequence: 0 });
    sockets[0]!.emit('message', JSON.stringify({ type: 'synced', sequence: 0 }));
    vi.advanceTimersByTime(10_000);
    expect(sockets[0]!.sent).toHaveLength(2);
    vi.advanceTimersByTime(8_000);
    expect(connection).toHaveBeenLastCalledWith('reconnecting');
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    adapter.destroy();
  });
  test('resumes whiteboard after a match and reconciles queued drawings with the server', () => {
    const sockets: Array<SocketMock> = [];
    class SocketMock {
      static OPEN = 1;
      readyState = 0;
      sent: string[] = [];
      private listeners = new Map<string, Array<(event: { data?: string }) => void>>();
      constructor(readonly url: URL) { sockets.push(this); }
      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]);
      }
      send(data: string) { this.sent.push(data); }
      close() { this.readyState = 3; this.emit('close'); }
      emit(type: string, data?: string) {
        if (type === 'open') this.readyState = 1;
        for (const listener of this.listeners.get(type) ?? []) listener({ data });
      }
    }
    vi.stubGlobal('WebSocket', SocketMock);
    const connection = vi.fn();
    const whiteboard = vi.fn();
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection, matchFound: vi.fn(), snapshot: vi.fn(), whiteboard });
    const internals = adapter as unknown as { onlineActive: boolean; lobbyVisitId: string; connectLobbyPresence(): void; connectWhiteboard(): void; whiteboardPending: Map<string, unknown> };
    internals.onlineActive = true;
    adapter.resumeLobby();
    expect(sockets).toHaveLength(2);
    sockets[0]!.emit('open'); sockets[1]!.emit('open');
    sockets[1]!.emit('message', JSON.stringify({ type: 'snapshot', board: createEmptyWhiteboard() }));
    expect(connection).toHaveBeenLastCalledWith('connected');
    const visit = sockets[1]!.url.searchParams.get('visit');
    adapter.leaveLobby();
    const chat: WhiteboardClientMessage = { type: 'chat', clientOperationId: 'chat-1', displayName: 'JP', text: 'hello', color: 'black' };
    const stroke: WhiteboardClientMessage = { type: 'stroke', clientOperationId: 'stroke-1', color: 'red', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
    adapter.sendWhiteboard(chat);
    adapter.sendWhiteboard(stroke);
    adapter.resumeLobby();
    adapter.resumeLobby();
    expect(sockets).toHaveLength(3);
    expect(connection).toHaveBeenLastCalledWith('reconnecting');
    expect(sockets[2]!.url.searchParams.get('visit')).toBe(visit);
    sockets[2]!.emit('open');
    expect(connection).toHaveBeenLastCalledWith('reconnecting');
    expect(sockets[2]!.sent.map((message) => JSON.parse(message).clientOperationId)).toEqual(['chat-1', 'stroke-1']);
    const operation = { kind: 'stroke', id: 'server-stroke', sequence: 9, clientOperationId: 'stroke-1', color: 'red', width: 5, points: stroke.points };
    const board = { ...createEmptyWhiteboard(), sequence: 9, operations: [operation] };
    sockets[2]!.emit('message', JSON.stringify({ type: 'snapshot', board }));
    expect(connection).toHaveBeenLastCalledWith('connected');
    expect(whiteboard).toHaveBeenLastCalledWith({ type: 'snapshot', board });
    expect(internals.whiteboardPending.has('stroke-1')).toBe(false);
    expect(internals.whiteboardPending.has('chat-1')).toBe(true);
    sockets[2]!.emit('message', JSON.stringify({ type: 'operation', operation: { kind: 'text', id: 'server-chat', sequence: 10, clientOperationId: 'chat-1', displayName: 'JP', text: 'hello', color: 'black', rowY: 68, rowSpan: 1 } }));
    expect(internals.whiteboardPending.size).toBe(0);
    adapter.destroy();
  });
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
      attemptId: expect.any(String),
    });
  });

  test('anonymous auth failure prevents entering a fake offline lobby', async () => {
    const connection = vi.fn();
    const fetchMock = vi.fn((input: string | URL | Request) => String(input).includes('/api/auth/sign-out')
      ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
      : Promise.resolve(new Response(null, { status: 401 })));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.subscribe({ connection, matchFound: vi.fn(), snapshot: vi.fn() });

    await expect(adapter.enterLobby('Player One')).rejects.toThrow('Could not start guest session.');

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/sign-in/anonymous'))).toBe(true);
    expect(connection).toHaveBeenLastCalledWith('connected');
  });

  test('clears a stale guest cookie before creating a replacement guest', async () => {
    const profile = { playerId: 'ticket-bright-cookie-otter-08', accountType: 'guest', displayName: 'Player One', rating: 1500, equippedEmblem: 'beta-og' };
    let anonymousStarted = false;
    let playerCreated = false;
    const calls: string[] = [];
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      if (url.includes('/api/auth/sign-out')) return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      if (url.includes('/api/auth/sign-in/anonymous')) { anonymousStarted = true; return Promise.resolve(new Response(JSON.stringify({ token: 'new-session' }), { status: 200 })); }
      if (url.endsWith('/player-session') && init?.method === 'POST') {
        if (!anonymousStarted) return Promise.resolve(new Response(null, { status: 401 }));
        playerCreated = true; return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.endsWith('/player-session')) return Promise.resolve(playerCreated
        ? new Response(JSON.stringify(profile), { status: 200 })
        : new Response(null, { status: 401 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await expect(adapter.enterLobby('Player One')).resolves.toMatchObject(profile);

    expect(calls.indexOf('POST /api/auth/sign-out')).toBeGreaterThan(calls.indexOf('POST /player-session'));
    expect(calls.indexOf('POST /api/auth/sign-in/anonymous')).toBeGreaterThan(calls.indexOf('POST /api/auth/sign-out'));
    expect(calls.filter((call) => call === 'POST /player-session')).toHaveLength(2);
  });

  test('reports a stale-session cleanup failure instead of retrying forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.enterLobby('Player One')).rejects.toThrow('Could not clear the expired guest session.');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/auth/sign-in/anonymous'))).toHaveLength(0);
  });

  test('repairs an authenticated guest session whose player row is missing', async () => {
    const profile = { playerId: 'anchor-chill-pizza-turtle-00', accountType: 'guest', displayName: 'Player One', rating: 1500, equippedEmblem: 'beta-og' };
    let created = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/player-session') && init?.method === 'POST') { created = true; return Promise.resolve(new Response(null, { status: 200 })); }
      if (url.endsWith('/player-session')) return Promise.resolve(created
        ? new Response(JSON.stringify(profile), { status: 200 })
        : new Response(null, { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.enterLobby('Player One')).resolves.toMatchObject(profile);

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/sign-in/anonymous'))).toBe(false);
  });

  test('persists a cookie-backed guest and suggests its harmless saved name after reload', async () => {
    const profile = { playerId: 'beacon-cozy-waffle-otter-12', accountType: 'guest', displayName: 'Saved Player', rating: 1512, equippedEmblem: 'beta-og' };
    let playerCreated = false;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/sign-in/anonymous')) return Promise.resolve(new Response(JSON.stringify({ token: 'cookie-session', user: { isAnonymous: true } }), { status: 200 }));
      if (url.endsWith('/player-session') && init?.method === 'POST') { playerCreated = true; return Promise.resolve(new Response(null, { status: 200 })); }
      if (url.endsWith('/player-session')) return Promise.resolve(playerCreated ? new Response(JSON.stringify(profile), { status: 200 }) : new Response(null, { status: 401 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }));
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));

    const first = new WebSocketShellSessionAdapter('https://example.test');
    expect(await first.enterLobby('Saved Player')).toMatchObject({ playerId: 'beacon-cozy-waffle-otter-12', displayName: 'Saved Player', rating: 1512 });
    const reloaded = new WebSocketShellSessionAdapter('https://example.test');

    expect(reloaded.suggestedPlayerName()).toBe('Saved Player');
    expect([...storageValues.keys()].some((key) => key.includes('secret') || key === 'local:super-rps-guest')).toBe(false);
  });

  test('resumes a cookie-backed guest using its canonical server name', async () => {
    storageValues.set('local:super-rps-guest-name', 'Typed Name');
    const profile = { playerId: 'comet-steady-mochi-fox-23', accountType: 'guest', displayName: 'Canonical Name', rating: 1620, equippedEmblem: 'beta-og' };
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/player-session')) return Promise.resolve(new Response(JSON.stringify(profile), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    expect(await adapter.enterLobby('Canonical Name')).toMatchObject({ displayName: 'Canonical Name', rating: 1620 });

    expect(adapter.suggestedPlayerName()).toBe('Canonical Name');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/sign-in/anonymous'))).toBe(false);
  });

  test('logging out preserves only the harmless saved display name', async () => {
    storageValues.set('local:super-rps-guest-name', 'Saved Name');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await adapter.signOut();

    expect([...storageValues.keys()].some((key) => key.includes('secret') || key === 'local:super-rps-guest')).toBe(false);
    expect(adapter.suggestedPlayerName()).toBe('Saved Name');
  });

  test('restores a connected account on the title screen without logging out', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => Promise.resolve(new Response(JSON.stringify(
      String(input).endsWith('/player-session')
        ? { playerId: 'crystal-omega-pizza-turtle-45', accountType: 'google', displayName: 'Google Player', rating: 1700, equippedEmblem: 'beta-og' }
        : { success: true },
    ), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await adapter.prepareTitle();

    expect(adapter.accountState()).toMatchObject({ signedIn: true, displayName: 'Google Player', rating: 1700 });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/sign-out'))).toBe(false);
  });

  test('restores a cookie-backed guest on the title screen', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => Promise.resolve(new Response(JSON.stringify(
      String(input).endsWith('/player-session')
        ? { playerId: 'quiet-bold-toast-otter-12', accountType: 'guest', displayName: 'Returning Guest', rating: 1580, equippedEmblem: 'beta-og' }
        : { success: true },
    ), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await adapter.prepareTitle();

    expect(adapter.accountState()).toMatchObject({
      signedIn: false, accountType: 'guest', playerId: 'quiet-bold-toast-otter-12', displayName: 'Returning Guest', rating: 1580,
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/sign-out'))).toBe(false);
  });

  test('title Google flow starts without creating or submitting a guest', async () => {
    storageValues.set('local:super-rps-guest-name', 'Saved Name');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/auth/sign-in/social')) return Promise.resolve(new Response(JSON.stringify({ url: 'https://accounts.google.test/' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.requestGoogleSignInFromTitle('Google Name', 'https://game.test/success', 'https://game.test/error'))
      .resolves.toBe('https://accounts.google.test/');

    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/player-session'))).toBe(false);
    expect(storageValues.get('super-rps-google-title-name')).toBe('Google Name');
    expect(storageValues.get('local:super-rps-guest-name')).toBe('Saved Name');
  });

  test('creates a player after a new title-screen Google account returns', async () => {
    storageValues.set('super-rps-google-flow', 'title');
    storageValues.set('super-rps-google-title-name', 'Google Name');
    const player = { playerId: 'crystal-omega-pizza-turtle-45', accountType: 'google', displayName: 'Google Name', rating: 1500, equippedEmblem: 'beta-og' };
    let playerGets = 0;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/player-session') && init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(player), { status: 200 }));
      if (url.endsWith('/player-session')) {
        playerGets++;
        return Promise.resolve(playerGets === 1 ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(player), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await expect(adapter.finishGoogleSignIn()).resolves.toMatchObject({ playerId: 'crystal-omega-pizza-turtle-45' });

    const creation = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/player-session') && init?.method === 'POST');
    expect(JSON.parse(String(creation?.[1]?.body))).toEqual({ displayName: 'Google Name' });
    expect(storageValues.has('super-rps-google-title-name')).toBe(false);
    expect(adapter.hasPendingGoogleName()).toBe(true);
    expect(storageValues.get('local:super-rps-google-pending-name')).toBe(player.playerId);

    const reloaded = new WebSocketShellSessionAdapter('https://example.test');
    await reloaded.prepareTitle();
    expect(reloaded.hasPendingGoogleName()).toBe(true);

    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/player-session') && init?.method === 'PUT') return Promise.resolve(new Response(null, { status: 500 }));
      if (String(input).endsWith('/player-session')) return Promise.resolve(new Response(JSON.stringify(player), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    await expect(reloaded.confirmGoogleName('Chosen Name')).rejects.toThrow('Name update failed');
    expect(reloaded.hasPendingGoogleName()).toBe(true);

    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/player-session') && init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ ...player, displayName: 'Chosen Name' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    await expect(reloaded.confirmGoogleName('Chosen Name')).resolves.toMatchObject({ displayName: 'Chosen Name' });
    expect(reloaded.hasPendingGoogleName()).toBe(false);
  });

  test('completes an intentional Google return and removes its URL marker', async () => {
    storageValues.set('local:super-rps-guest-name', 'Saved Guest');
    storageValues.set('super-rps-google-flow', 'title');
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: 'https://game.test/?google-sign-in-return=1' });
    vi.stubGlobal('history', { state: null, replaceState });
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        playerId: 'crystal-omega-pizza-turtle-45', accountType: 'google', displayName: 'Google Player', rating: 1700, equippedEmblem: 'beta-og',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    expect(adapter.isGoogleSignInReturn()).toBe(true);
    await expect(adapter.completeGoogleSignIn()).resolves.toMatchObject({ playerId: 'crystal-omega-pizza-turtle-45' });

    expect(replaceState).toHaveBeenCalledOnce();
    expect(String(replaceState.mock.calls[0]?.[2])).toBe('https://game.test/');
    expect(adapter.accountState()).toMatchObject({ signedIn: true, displayName: 'Google Player' });
    expect(adapter.hasPendingGoogleName()).toBe(false);
    expect(storageValues.get('local:super-rps-guest-name')).toBe('Google Player');
  });

  test('successful guest claim keeps the same player without browser credentials', async () => {
    storageValues.set('local:super-rps-guest-name', 'Claimed Guest');
    storageValues.set('super-rps-google-flow', 'claim');
    vi.stubGlobal('WebSocket', vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() })));
    const player = { playerId: 'shield-mighty-taco-wolf-77', accountType: 'google', displayName: 'Claimed Guest', rating: 1600, equippedEmblem: 'beta-og' };
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/claim-google-account')) return Promise.resolve(new Response(JSON.stringify(player), { status: 200 }));
      if (url.endsWith('/player-session')) return Promise.resolve(new Response(JSON.stringify(player), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await expect(adapter.finishGoogleSignIn()).resolves.toMatchObject({ playerId: 'shield-mighty-taco-wolf-77' });

    expect([...storageValues.keys()].some((key) => key.includes('secret') || key === 'local:super-rps-guest')).toBe(false);
    expect(adapter.accountState()).toMatchObject({ signedIn: true, accountType: 'google', rating: 1600 });
    expect(adapter.hasPendingGoogleName()).toBe(false);
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/claim-google-account') && init?.method === 'POST')).toBe(true);
  });

  test('guest Google claim links the identity instead of signing into another player', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/link-social')) return Promise.resolve(new Response(JSON.stringify({ url: 'https://accounts.google.test/' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    Object.assign(adapter, { playerId: 'guest-player' });

    await expect(adapter.requestGuestClaimWithGoogle('https://game.test/success', 'https://game.test/error'))
      .resolves.toBe('https://accounts.google.test/');

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/link-social'))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/sign-in/social'))).toBe(false);
    const linkCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/auth/link-social'));
    expect(JSON.parse(String(linkCall?.[1]?.body))).toMatchObject({ disableRedirect: true });
  });

  test('updates the authenticated display name and local account state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ playerId: 'wheel-fresh-toast-owl-14', accountType: 'guest', displayName: 'New Name', rating: 1550, equippedEmblem: 'beta-og' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.updateDisplayName('New Name')).resolves.toMatchObject({ displayName: 'New Name' });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(adapter.accountState()).toMatchObject({ playerId: 'wheel-fresh-toast-owl-14', displayName: 'New Name', rating: 1550 });
  });

  test('requests and confirms protected account deletion through game endpoints', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/player-session')) return Promise.resolve(new Response(JSON.stringify({
        playerId: 'torch-bold-bagel-badger-11', accountType: 'google', displayName: 'Player', rating: 1500, equippedEmblem: 'beta-og',
      }), { status: 200 }));
      if (url.endsWith('/auth-capabilities')) return Promise.resolve(new Response(JSON.stringify({ emailSignup: true, emailCodeLogin: true, password: true }), { status: 200 }));
      if (url.endsWith('/account-deletion/google/start')) return Promise.resolve(new Response(JSON.stringify({ url: 'https://accounts.google.com/test' }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    await adapter.prepareTitle();

    await expect(adapter.requestGoogleDeletion('abcde-12345-abcde-12345')).resolves.toBe('https://accounts.google.com/test');
    await adapter.deleteAccount();

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/account-deletion', expect.objectContaining({
      method: 'DELETE', credentials: 'include', body: JSON.stringify({}),
    }));
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/account-deletion/google/start', expect.objectContaining({ method: 'POST' }));
    expect(adapter.accountState()).toMatchObject({ signedIn: false, accountType: 'guest', playerId: '', emailSignupAvailable: true, emailAuthAvailable: true });
  });

  test('deletes a guest without sending a code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.requestAccountDeletionCode()).rejects.toThrow('Guest accounts');
    await adapter.deleteAccount();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({});
  });

  test('persists unlock-all mode and exposes every class without changing XP', async () => {
    const player = { playerId: 'wheel-fresh-toast-owl-14', accountType: 'guest', displayName: 'Player', rating: 1500, totalProgressUnits: 20_000, unlockAllClasses: true, equippedEmblem: 'beta-og',
      level: 3, progressUnitsInLevel: 0, nextUnlock: 'juggernaut', unlockedClassIds: ['lucky', 'advantaged', 'thief'] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(player), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await adapter.setUnlockAllClasses(true);

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/player-progression', expect.objectContaining({ method: 'PUT', credentials: 'include' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ unlockAllClasses: true });
    expect(adapter.accountState()).toMatchObject({ totalProgressUnits: 20_000, level: 3, unlockAllClasses: true });
    expect(adapter.accountState().unlockedClassIds).toHaveLength(21);
  });

  test('persists a server-authoritative equipped emblem', async () => {
    const player = { playerId: 'wheel-fresh-toast-owl-14', accountType: 'guest', displayName: 'Player', rating: 1500,
      totalProgressUnits: 0, unlockAllClasses: false, equippedEmblem: 'beta-og', ownedEmblems: ['beta-og'], level: 1, progressUnitsInLevel: 0,
      nextUnlock: 'advantaged', unlockedClassIds: ['lucky'] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(player), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await adapter.setEquippedEmblem('beta-og');

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/player-emblem', expect.objectContaining({ method: 'PUT', credentials: 'include' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ emblem: 'beta-og' });
    expect(adapter.accountState().equippedEmblem).toBe('beta-og');
  });

  test('persists tutorial awards through the server before updating local progression', async () => {
    const award = {
      outcome: 'win', gainedProgressUnits: 10_000,
      before: { level: 1, totalProgressUnits: 0, progressUnitsInLevel: 0, nextUnlock: 'advantaged', unlockedClassIds: ['lucky'] },
      after: { level: 2, totalProgressUnits: 10_000, progressUnitsInLevel: 0, nextUnlock: 'thief', unlockedClassIds: ['lucky', 'advantaged'] },
      unlockedClassIds: ['advantaged'],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(award), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    const received = await adapter.awardTutorialMatch('practice-result-1', 'win');
    adapter.applyProgressAward(received);

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/local-progress-award', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ receipt: 'practice-result-1', kind: 'tutorial', outcome: 'win' });
    expect(adapter.accountState()).toMatchObject({ level: 2, totalProgressUnits: 10_000, unlockedClassIds: ['lucky', 'advantaged'] });
  });

  test('requests and validates a server receipt before a rewarded local match', async () => {
    const grant = { receipt: 'receipt-1', kind: 'computer', issuedAt: 10_000, expiresAt: 1_810_000 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(grant), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.beginLocalMatch('computer')).resolves.toEqual(grant);

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/local-match-grant', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ kind: 'computer' });
  });

  test('rejects a malformed local-match receipt response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ receipt: '', kind: 'tutorial' }), { status: 200 })));
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await expect(adapter.beginLocalMatch('tutorial')).rejects.toThrow('invalid data');
  });

  test('local unlock-all mode can be enabled and resumed', async () => {
    const adapter = new LocalShellSessionAdapter();
    await adapter.setUnlockAllClasses(true);
    expect(adapter.accountState()).toMatchObject({ unlockAllClasses: true });
    expect(adapter.accountState().unlockedClassIds).toHaveLength(21);
    await adapter.setUnlockAllClasses(false);
    expect(adapter.accountState()).toMatchObject({ unlockAllClasses: false, unlockedClassIds: ['lucky'] });
  });

  test('applies completed prestige progression and count locally before profile refresh', () => {
    const adapter = new WebSocketShellSessionAdapter('https://example.test');
    adapter.applyProgressAward({
      outcome: 'win', gainedProgressUnits: 0,
      before: { level: 21, totalProgressUnits: 200_000, progressUnitsInLevel: 10_000, unlockedClassIds: [] },
      after: { level: 1, totalProgressUnits: 0, progressUnitsInLevel: 0, nextUnlock: 'advantaged', unlockedClassIds: ['lucky'] },
      unlockedClassIds: [], prestige: { state: 'completed', prestigeCount: 2 },
    });
    expect(adapter.accountState()).toMatchObject({ level: 1, totalProgressUnits: 0, prestigeCount: 2, bonusClassId: 'lucky' });
    expect(adapter.accountState().unlockedClassIds).toHaveLength(21);
  });

  test('lobby and whiteboard authenticate without putting secrets in URLs', async () => {
    const socket = vi.fn((_url: string | URL, _protocols?: string | string[]) => ({ addEventListener: vi.fn(), close: vi.fn() }));
    vi.stubGlobal('WebSocket', socket);
    let created = false;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/sign-in/anonymous')) return Promise.resolve(new Response(JSON.stringify({ token: 'cookie-session', user: { isAnonymous: true } }), { status: 200 }));
      if (url.endsWith('/player-session') && init?.method === 'POST') { created = true; return Promise.resolve(new Response(null, { status: 200 })); }
      if (url.endsWith('/player-session')) return Promise.resolve(created
        ? new Response(JSON.stringify({ playerId: 'lantern-jolly-noodle-frog-31', accountType: 'guest', displayName: 'Player One', rating: 1500, equippedEmblem: 'beta-og' }), { status: 200 })
        : new Response(null, { status: 401 }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }));
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await adapter.enterLobby('Player One');

    expect(socket).toHaveBeenCalledTimes(2);
    for (const [rawUrl, protocols] of socket.mock.calls) {
      const url = new URL(String(rawUrl));
      expect(url.searchParams.has('secret')).toBe(false);
      expect(url.searchParams.has('token')).toBe(false);
      expect(protocols).toEqual(expect.stringMatching(/^super-rps-(?:lobby|whiteboard)-v1$/));
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

  test('uses game-owned email login and password-management endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true, hasPassword: true }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebSocketShellSessionAdapter('https://example.test');

    await adapter.requestEmailLogin('player@example.com');
    await adapter.requestPasswordCode('player@example.com');
    await adapter.updateEmailPassword('player@example.com', 'ab12', 'password123');

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.test/email-login/request', 'https://example.test/email-password/request', 'https://example.test/email-password/update',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ email: 'player@example.com', code: 'ab12', password: 'password123' });
    expect(adapter.accountState().hasPassword).toBe(true);
  });
});
