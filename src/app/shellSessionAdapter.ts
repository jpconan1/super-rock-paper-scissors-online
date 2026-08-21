import type { ConnectionState } from './appController';
import { PROTOCOL_VERSION, type MatchCommandPayload, type ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';

export interface ShellSessionListener {
  connection(state: ConnectionState): void;
  matchFound(): void;
  snapshot(snapshot: ServerSnapshot): void;
}

export interface ShellSessionAdapter {
  subscribe(listener: ShellSessionListener): () => void;
  enterLobby(playerName: string): Promise<void>;
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
  private readonly guestId = sessionStorage.getItem('super-rps-guest') ?? crypto.randomUUID();
  private pollTimer?: ReturnType<typeof setTimeout>;
  private matchmakingRequest?: AbortController;
  private matchmakingGeneration = 0;
  private socket?: WebSocket;
  private latest?: ServerSnapshot;
  private stopped = true;
  private ticket?: { matchId: string; seat: string; token: string };
  private intentionallyClosed = false;

  constructor(private readonly baseUrl = location.origin) {
    sessionStorage.setItem('super-rps-guest', this.guestId);
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
    } catch {
      this.listener?.connection('offline');
    }
  }
  startMatchmaking(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.intentionallyClosed = false;
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
    void fetch(`${this.baseUrl}/matchmaking?guestId=${encodeURIComponent(this.guestId)}`, { method: 'DELETE' }).catch(() => {});
  }
  selectSlot(slotId: SlotId): void { this.sendPayload({ type: 'select-slot', slotId }); }
  send(command: unknown): void {
    const slotId = (this.latest?.projection as { activeSlot?: SlotId } | undefined)?.activeSlot;
    if (slotId) this.sendPayload({ type: 'variant-command', slotId, command: unwrapMove(command) });
  }

  toggleBan(slotId: SlotId): void { this.sendPayload({ type: 'toggle-ban', slotId }); }
  leaveMatch(): void { this.intentionallyClosed = true; this.socket?.close(); this.socket = undefined; this.latest = undefined; this.ticket = undefined; }
  destroy(): void { this.cancelMatchmaking(); this.leaveMatch(); this.listener = undefined; }

  private async pollMatchmaking(generation: number): Promise<void> {
    if (this.stopped || generation !== this.matchmakingGeneration) return;
    const request = new AbortController();
    this.matchmakingRequest = request;
    try {
      const response = await fetch(`${this.baseUrl}/matchmaking`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guestId: this.guestId, name: this.playerName || 'Guest' }),
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
    this.ticket = { matchId, seat, token };
    const url = new URL(`${this.baseUrl}/matches/${matchId}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('seat', seat); url.searchParams.set('token', token);
    const socket = new WebSocket(url);
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

function unwrapMove(command: unknown): unknown {
  if (typeof command === 'object' && command !== null && 'move' in command) return (command as { move: unknown }).move;
  return command;
}

function isSnapshotEnvelope(value: ServerSnapshot | { snapshot?: ServerSnapshot }): value is { snapshot?: ServerSnapshot } {
  return 'snapshot' in value;
}

function isServerSnapshot(value: unknown): value is ServerSnapshot {
  return typeof value === 'object' && value !== null && 'protocolVersion' in value && 'matchId' in value && 'revision' in value && 'projection' in value;
}
