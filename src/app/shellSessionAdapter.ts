import type { ConnectionState } from './appController';
import { PROTOCOL_VERSION, type MatchCommandPayload, type ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';
import { isWhiteboardServerMessage, type WhiteboardClientMessage, type WhiteboardServerMessage } from '../whiteboard/protocol';
import { isLobbyServerMessage, type LobbyPlayer, type LobbyPresence } from '../lobby/protocol';
import { LOBBY_SOCKET_PROTOCOL, MATCH_SOCKET_PROTOCOL, WHITEBOARD_SOCKET_PROTOCOL } from '../protocol/webSocketAuth';

export interface ShellSessionListener {
  connection(state: ConnectionState): void;
  matchFound(): void;
  snapshot(snapshot: ServerSnapshot): void;
  whiteboard?(message: WhiteboardServerMessage): void;
  roster?(players: LobbyPlayer[], selfId: string): void;
}

export interface ShellSessionAdapter {
  subscribe(listener: ShellSessionListener): () => void;
  enterLobby(playerName: string): Promise<void>;
  getOnlinePlayerCount(): Promise<number | null>;
  leaveLobby(): void;
  disconnectOnline(): void;
  setLobbyPresence(presence: LobbyPresence): void;
  sendWhiteboard(message: WhiteboardClientMessage): void;
  startMatchmaking(): void;
  cancelMatchmaking(): void;
  selectSlot(slotId: SlotId): void;
  toggleBan(slotId: SlotId): void;
  send(command: unknown): void;
  leaveMatch(): void;
  destroy(): void;
}

export class WebSocketShellSessionAdapter implements ShellSessionAdapter {
  private listener?: ShellSessionListener;
  private playerName = '';
  private readonly guestId: string;
  private readonly guestSecret: string;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private matchmakingRequest?: AbortController;
  private matchmakingGeneration = 0;
  private socket?: WebSocket;
  private latest?: ServerSnapshot;
  private stopped = true;
  private ticket?: { matchId: string; seat: string; token: string };
  private intentionallyClosed = false;
  private whiteboardSocket?: WebSocket;
  private whiteboardReconnect?: ReturnType<typeof setTimeout>;
  private whiteboardActive = false;
  private readonly whiteboardPending = new Map<string, WhiteboardClientMessage>();
  private lobbyVisitId = '';
  private lobbySocket?: WebSocket;
  private lobbyReconnect?: ReturnType<typeof setTimeout>;
  private onlineActive = false;
  private lobbyPresence: LobbyPresence = 'idle';

  constructor(private readonly baseUrl = location.origin) {
    const identity = loadGuestIdentity();
    this.guestId = identity.id;
    this.guestSecret = identity.secret;
  }

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }
  async enterLobby(playerName: string): Promise<void> {
    this.playerName = playerName;
    try {
      const response = await fetch(`${this.baseUrl}/health`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Server health check failed: ${response.status}`);
      const health = await response.json() as { ok?: boolean };
      if (health.ok !== true) throw new Error('Server health check returned an invalid response.');
      this.listener?.connection('connected');
      if (!this.whiteboardActive) this.lobbyVisitId = crypto.randomUUID();
      this.onlineActive = true;
      this.connectLobbyPresence();
      this.setLobbyPresence('idle');
      this.whiteboardActive = true;
      this.connectWhiteboard();
    } catch {
      this.listener?.connection('offline');
    }
  }
  async getOnlinePlayerCount(): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseUrl}/online-status`, { cache: 'no-store' });
      if (!response.ok) return null;
      const result = await response.json() as { playersOnline?: unknown };
      return typeof result.playersOnline === 'number' && Number.isFinite(result.playersOnline) ? result.playersOnline : null;
    } catch { return null; }
  }
  leaveLobby(): void {
    this.whiteboardActive = false;
    if (this.whiteboardReconnect) clearTimeout(this.whiteboardReconnect);
    this.whiteboardReconnect = undefined;
    this.whiteboardSocket?.close(); this.whiteboardSocket = undefined;
  }
  disconnectOnline(): void {
    this.onlineActive = false;
    this.leaveLobby();
    if (this.lobbyReconnect) clearTimeout(this.lobbyReconnect);
    this.lobbyReconnect = undefined;
    this.lobbySocket?.close(); this.lobbySocket = undefined;
  }
  setLobbyPresence(presence: LobbyPresence): void {
    this.lobbyPresence = presence;
    if (this.lobbySocket?.readyState === 1) this.lobbySocket.send(JSON.stringify({ type: 'presence', presence }));
  }
  sendWhiteboard(message: WhiteboardClientMessage): void {
    this.whiteboardPending.set(message.clientOperationId, message);
    if (this.whiteboardSocket?.readyState === 1) this.whiteboardSocket.send(JSON.stringify(message));
  }
  startMatchmaking(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.intentionallyClosed = false;
    this.setLobbyPresence('ready');
    this.sendWhiteboard({ type: 'status', clientOperationId: crypto.randomUUID(), displayName: this.playerName || 'Guest', status: 'ready' });
    const generation = ++this.matchmakingGeneration;
    void this.pollMatchmaking(generation);
  }
  cancelMatchmaking(): void {
    if (this.stopped && !this.pollTimer && !this.matchmakingRequest) return;
    this.stopped = true;
    this.matchmakingGeneration++;
    this.matchmakingRequest?.abort();
    this.matchmakingRequest = undefined;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    this.setLobbyPresence('idle');
    void fetch(`${this.baseUrl}/matchmaking`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guestId: this.guestId, guestSecret: this.guestSecret }),
    }).catch(() => {});
  }
  selectSlot(slotId: SlotId): void { this.sendPayload({ type: 'select-slot', slotId }); }
  send(command: unknown): void {
    const slotId = (this.latest?.projection as { activeSlot?: SlotId } | undefined)?.activeSlot;
    if (slotId) this.sendPayload({ type: 'variant-command', slotId, command: serializeVariantCommand(command) });
  }

  toggleBan(slotId: SlotId): void { this.sendPayload({ type: 'toggle-ban', slotId }); }
  leaveMatch(): void { this.intentionallyClosed = true; this.socket?.close(); this.socket = undefined; this.latest = undefined; this.ticket = undefined; this.setLobbyPresence('idle'); }
  destroy(): void { this.cancelMatchmaking(); this.leaveMatch(); this.disconnectOnline(); this.listener = undefined; }

  private connectLobbyPresence(): void {
    if (!this.onlineActive || this.lobbySocket) return;
    const url = new URL(`${this.baseUrl}/lobby`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('guest', this.guestId); url.searchParams.set('name', this.playerName || 'Guest');
    const socket = new WebSocket(url, [LOBBY_SOCKET_PROTOCOL, this.guestSecret]); this.lobbySocket = socket;
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'presence', presence: this.lobbyPresence })));
    socket.addEventListener('message', (event) => {
      try { const message = JSON.parse(String(event.data)); if (isLobbyServerMessage(message) && message.type === 'roster') this.listener?.roster?.(message.players, message.selfId); } catch { /* ignore malformed server data */ }
    });
    socket.addEventListener('close', () => {
      if (this.lobbySocket !== socket) return;
      this.lobbySocket = undefined;
      if (this.onlineActive) this.lobbyReconnect = setTimeout(() => { this.lobbyReconnect = undefined; this.connectLobbyPresence(); }, 1_000);
    });
  }

  private connectWhiteboard(): void {
    if (!this.whiteboardActive || this.whiteboardSocket) return;
    const url = new URL(`${this.baseUrl}/whiteboard`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('guest', this.guestId); url.searchParams.set('name', this.playerName || 'Guest'); url.searchParams.set('visit', this.lobbyVisitId);
    const socket = new WebSocket(url, [WHITEBOARD_SOCKET_PROTOCOL, this.guestSecret]); this.whiteboardSocket = socket;
    socket.addEventListener('open', () => { for (const message of this.whiteboardPending.values()) socket.send(JSON.stringify(message)); });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (!isWhiteboardServerMessage(message)) return;
        if (message.type === 'operation' && message.operation.clientOperationId) this.whiteboardPending.delete(message.operation.clientOperationId);
        if (message.type === 'error' && message.clientOperationId) this.whiteboardPending.delete(message.clientOperationId);
        if (message.type === 'reset') this.whiteboardPending.clear();
        if (message.type === 'snapshot' || message.type === 'reset') {
          for (const operation of message.board.operations) if (operation.clientOperationId) this.whiteboardPending.delete(operation.clientOperationId);
        }
        this.listener?.whiteboard?.(message);
      } catch { /* ignore malformed server data */ }
    });
    socket.addEventListener('close', () => {
      if (this.whiteboardSocket !== socket) return;
      this.whiteboardSocket = undefined;
      if (this.whiteboardActive) this.whiteboardReconnect = setTimeout(() => { this.whiteboardReconnect = undefined; this.connectWhiteboard(); }, 1_000);
    });
  }

  private async pollMatchmaking(generation: number): Promise<void> {
    if (this.stopped || generation !== this.matchmakingGeneration) return;
    const request = new AbortController();
    this.matchmakingRequest = request;
    try {
      const response = await fetch(`${this.baseUrl}/matchmaking`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guestId: this.guestId, guestSecret: this.guestSecret, name: this.playerName || 'Guest' }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`Matchmaking failed: ${response.status}`);
      const result = await response.json() as { status: 'waiting' } | { status: 'matched'; matchId: string; seat: string; token: string };
      if (this.stopped || generation !== this.matchmakingGeneration) return;
      this.listener?.connection('connected');
      if (result.status === 'matched') { this.stopped = true; this.connect(result.matchId, result.seat, result.token); return; }
      this.pollTimer = setTimeout(() => {
        this.pollTimer = undefined;
        void this.pollMatchmaking(generation);
      }, 750);
    } catch (error) {
      if (request.signal.aborted || this.stopped || generation !== this.matchmakingGeneration) return;
      this.listener?.connection('reconnecting');
      this.pollTimer = setTimeout(() => {
        this.pollTimer = undefined;
        void this.pollMatchmaking(generation);
      }, 1_500);
    } finally {
      if (this.matchmakingRequest === request) this.matchmakingRequest = undefined;
    }
  }

  private connect(matchId: string, seat: string, token: string): void {
    this.setLobbyPresence('in-match');
    this.ticket = { matchId, seat, token };
    const url = new URL(`${this.baseUrl}/matches/${matchId}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('seat', seat);
    const socket = new WebSocket(url, [MATCH_SOCKET_PROTOCOL, token]);
    this.socket = socket;
    socket.addEventListener('open', () => { this.listener?.connection('connected'); this.listener?.matchFound(); });
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as ServerSnapshot | { snapshot?: ServerSnapshot };
      const snapshot: ServerSnapshot | undefined = isSnapshotEnvelope(data) ? data.snapshot : data;
      if (!snapshot || !isServerSnapshot(snapshot)) return;
      this.latest = snapshot;
      this.listener?.snapshot(snapshot);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.intentionallyClosed) return;
      this.listener?.connection('reconnecting');
      const ticket = this.ticket;
      if (ticket) setTimeout(() => this.connect(ticket.matchId, ticket.seat, ticket.token), 1_000);
    });
    socket.addEventListener('error', () => this.listener?.connection('reconnecting'));
  }

  private sendPayload(payload: MatchCommandPayload): void {
    if (!this.latest || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION, commandId: crypto.randomUUID(), matchId: this.latest.matchId,
      expectedRevision: this.latest.revision, type: payload.type, payload,
    }));
  }
}

const GUEST_ID_KEY = 'super-rps-guest';
const GUEST_SECRET_KEY = 'super-rps-guest-secret';
function loadGuestIdentity(): { id: string; secret: string } {
  const id = localStorage.getItem(GUEST_ID_KEY) ?? crypto.randomUUID();
  const secret = localStorage.getItem(GUEST_SECRET_KEY) ?? `${crypto.randomUUID()}${crypto.randomUUID()}`;
  localStorage.setItem(GUEST_ID_KEY, id);
  localStorage.setItem(GUEST_SECRET_KEY, secret);
  sessionStorage.removeItem(GUEST_ID_KEY);
  return { id, secret };
}

export class LocalShellSessionAdapter implements ShellSessionAdapter {
  private listener?: ShellSessionListener;
  private matchmakingTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private matchId = 'local-match';

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }

  async enterLobby(_playerName: string): Promise<void> { this.listener?.connection('connected'); }
  async getOnlinePlayerCount(): Promise<number | null> { return 1; }
  leaveLobby(): void {}
  disconnectOnline(): void {}
  setLobbyPresence(_presence: LobbyPresence): void {}
  sendWhiteboard(_message: WhiteboardClientMessage): void {}

  startMatchmaking(): void {
    this.cancelMatchmaking();
    this.matchmakingTimer = setTimeout(() => {
      this.matchmakingTimer = undefined;
      this.listener?.matchFound();
    }, 700);
  }

  cancelMatchmaking(): void {
    if (this.matchmakingTimer) clearTimeout(this.matchmakingTimer);
    this.matchmakingTimer = undefined;
  }

  selectSlot(slotId: SlotId): void {
    this.revision = 0;
    this.matchId = `local-${slotId}`;
    this.emit({ slotId, phase: 'ready', lastCommand: null });
  }

  send(command: unknown): void {
    this.emit({ phase: 'playing', lastCommand: command });
  }
  toggleBan(slotId: SlotId): void { this.emit({ phase: 'banning', slotId }); }

  leaveMatch(): void { this.revision = 0; }
  destroy(): void { this.cancelMatchmaking(); this.listener = undefined; }

  private emit(projection: unknown): void {
    const now = Date.now();
    this.listener?.snapshot({
      protocolVersion: 1,
      matchId: this.matchId,
      revision: ++this.revision,
      serverTime: now,
      projection,
      events: this.revision === 1 ? [{ id: `${this.matchId}:ready`, type: 'ready', startsAt: now, endsAt: now + 500, payload: {} }] : [],
    });
  }
}

export function serializeVariantCommand(command: unknown): unknown {
  if (typeof command === 'object' && command !== null && 'type' in command
    && ((command as { type?: unknown }).type === 'choose-move' || (command as { type?: unknown }).type === 'lock-class')) return command;
  if (typeof command === 'object' && command !== null && 'move' in command) return (command as { move: unknown }).move;
  return command;
}

function isSnapshotEnvelope(value: ServerSnapshot | { snapshot?: ServerSnapshot }): value is { snapshot?: ServerSnapshot } {
  return 'snapshot' in value;
}

function isServerSnapshot(value: unknown): value is ServerSnapshot {
  return typeof value === 'object' && value !== null && 'protocolVersion' in value && 'matchId' in value && 'revision' in value && 'projection' in value;
}
