import { DurableObject } from 'cloudflare:workers';
import { parseClientCommand, PROTOCOL_VERSION, type ClientCommand } from '../src/protocol/protocol';
import { getServerVariant } from '../src/core/serverVariantRegistry';
import type { TimedSemanticEvent } from '../src/protocol/protocol';
import {
  acceptMatchCommand, advanceMatchDeadline, beginGameplayDisconnectGrace, createOnlineMatch,
  markPlayerConnected, markPlayerDisconnected, projectOnlineMatch, resolveDisconnectDeadline,
  type OnlineMatchState,
} from '../src/core/onlineMatch';
import type { MatchCommandPayload, MatchPlayer } from '../src/protocol/protocol';
import {
  createEmptyWhiteboard, pruneWhiteboardOperationPrefix, WHITEBOARD_COLORS, type WhiteboardClientMessage, type WhiteboardColor,
  type WhiteboardOperation, type WhiteboardPoint, type WhiteboardServerMessage, type WhiteboardSnapshot,
} from '../src/whiteboard/protocol';
import { isLobbyPresence, type LobbyPlayer, type LobbyPresence, type LobbyServerMessage } from '../src/lobby/protocol';
import { eloDeltas } from '../src/core/elo';
import { WhiteboardRateLimiter, type WhiteboardRateCategory } from '../src/whiteboard/rateLimiter';
import { LOBBY_SOCKET_PROTOCOL, MATCH_SOCKET_PROTOCOL, socketCredential, WHITEBOARD_SOCKET_PROTOCOL } from '../src/protocol/webSocketAuth';
import { consumeSlidingWindow, messageFitsUtf8Limit, readJsonBody, RequestBodyError } from '../src/protocol/abuseProtection';
import { corsHeadersForOrigin, isAllowedRequestOrigin } from '../src/protocol/originPolicy';

interface Env {
  MATCHES: DurableObjectNamespace<MatchObject>;
  MATCHMAKER: DurableObjectNamespace<MatchmakerObject>;
  LOBBY: DurableObjectNamespace<LobbyObject>;
  WHITEBOARD: DurableObjectNamespace<WhiteboardObject>;
  DB: D1Database;
  SOCKET_RATE: RateLimit;
  MATCHMAKING_IP_RATE: RateLimit;
  MATCHMAKING_GUEST_RATE: RateLimit;
  ALLOWED_ORIGINS?: string;
}

type Seat = 'p1' | 'p2';
const MATCH_MESSAGE_MAX_BYTES = 256_000;
interface MatchRecord extends OnlineMatchState {
  tokens: Record<Seat, string>;
  accepted: Array<{ revision: number; seat: Seat; command: ClientCommand }>;
  playerIds?: Record<Seat, string>;
  ratingsFinalized?: boolean;
  ratingRetryAt?: number;
}
interface SocketAttachment { seat: Seat; messageTimes: number[] }
const MATCH_SOCKETS_PER_SEAT = 2;

export class MatchObject extends DurableObject<Env> {
  private record?: MatchRecord;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.record = await ctx.storage.get<MatchRecord>('match');
      if (!this.record) return;
      // Normalize records written before connection tracking and authoritative
      // ABM completion were introduced.
      this.record.connections ??= { p1: false, p2: false };
      this.record.disconnectDeadlines ??= {};
      if (this.record.format === 'abm-only' && this.record.winner && this.record.phase === 'playing') {
        this.record.phase = 'complete';
        this.record.completionReason ??= 'played';
        this.record.deadlineAt = undefined;
        this.record.disconnectDeadlines = {};
      }
      for (const socket of ctx.getWebSockets()) {
        const seat = (socket.deserializeAttachment() as SocketAttachment | null)?.seat;
        if (seat) this.record.connections[seat] = true;
      }
    });
  }

  async initialize(matchId: string, players?: Record<Seat, MatchPlayer>, playerIds?: Record<Seat, string>, format: 'abm-only' | 'multi-slot' = 'multi-slot'): Promise<{ matchId: string; seats: Record<Seat, string> }> {
    if (!this.record) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      this.record = Object.assign(createOnlineMatch(matchId, players ?? {
        p1: { name: 'Player 1', platform: 'Web', rating: 1500 },
        p2: { name: 'Player 2', platform: 'Web', rating: 1500 },
      }, seed, Date.now(), format), {
        tokens: { p1: token(), p2: token() },
        accepted: [],
        connections: { p1: false, p2: false },
        ...(playerIds ? { playerIds } : {}),
      });
      await this.ctx.storage.put('match', this.record);
      await this.scheduleAlarm();
    }
    return { matchId: this.record.matchId, seats: this.record.tokens };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
    const url = new URL(request.url);
    const seat = url.searchParams.get('seat');
    const resumeToken = socketCredential(request.headers.get('Sec-WebSocket-Protocol'), MATCH_SOCKET_PROTOCOL);
    if (!this.record || !isSeat(seat) || this.record.tokens[seat] !== resumeToken) return json({ error: 'Invalid seat token.' }, 401);
    if (this.ctx.getWebSockets().filter((socket) => (socket.deserializeAttachment() as SocketAttachment | null)?.seat === seat).length >= MATCH_SOCKETS_PER_SEAT) {
      return rateLimited();
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat, messageTimes: [] } satisfies SocketAttachment);
    const reconnected = markPlayerConnected(this.record, seat);
    if (reconnected) {
      await this.ctx.storage.put('match', this.record);
      await this.scheduleAlarm();
    }
    server.send(JSON.stringify(this.snapshot(seat)));
    if (reconnected) this.broadcast(server);
    return webSocketResponse(client, MATCH_SOCKET_PROTOCOL);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || !this.record) return;
    if (!messageFitsUtf8Limit(message, MATCH_MESSAGE_MAX_BYTES)) {
      socket.send(JSON.stringify({ type: 'error', message: 'Message too large.' })); return;
    }
    if (!allowSocketMessage(socket, attachment, Date.now())) return;
    try {
      const command = parseClientCommand(JSON.parse(message));
      if (command.matchId !== this.record.matchId) throw new Error('Wrong match.');
      if (this.record.processed.includes(command.commandId)) {
        socket.send(JSON.stringify({ type: 'duplicate', snapshot: this.snapshot(attachment.seat) }));
        return;
      }
      if (command.expectedRevision !== this.record.revision) {
        socket.send(JSON.stringify({ type: 'stale', snapshot: this.snapshot(attachment.seat) }));
        return;
      }
      const status = acceptMatchCommand(this.record, attachment.seat, {
        commandId: command.commandId,
        expectedRevision: command.expectedRevision,
        payload: command.payload as MatchCommandPayload,
      }, Date.now());
      if (status !== 'accepted') {
        socket.send(JSON.stringify({ type: status, snapshot: this.snapshot(attachment.seat) }));
        return;
      }
      this.record.accepted.push({ revision: this.record.revision, seat: attachment.seat, command });
      await this.finalizeRating();
      await this.ctx.storage.put('match', this.record);
      await this.scheduleAlarm();
      this.broadcast();
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Invalid command.' }));
    }
  }

  async alarm(): Promise<void> {
    if (!this.record) return;
    const now = Date.now();
    const disconnected = resolveDisconnectDeadline(this.record, now);
    const advanced = !disconnected && advanceMatchDeadline(this.record, now);
    if (advanced) beginGameplayDisconnectGrace(this.record, now);
    const retryingRating = Boolean(this.record.ratingRetryAt && this.record.ratingRetryAt <= now);
    if (disconnected || advanced || retryingRating) await this.finalizeRating();
    if (!disconnected && !advanced && !retryingRating) return;
    await this.ctx.storage.put('match', this.record);
    await this.scheduleAlarm();
    if (disconnected || advanced) this.broadcast();
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || !this.record || this.hasConnectedSeat(attachment.seat, socket)) return;
    if (!markPlayerDisconnected(this.record, attachment.seat, Date.now())) return;
    await this.ctx.storage.put('match', this.record);
    await this.scheduleAlarm();
    this.broadcast();
  }

  private snapshot(seat: Seat) {
    const projection = this.record ? projectOnlineMatch(this.record, seat) : undefined;
    return {
      protocolVersion: PROTOCOL_VERSION,
      matchId: this.record?.matchId,
      revision: this.record?.revision ?? 0,
      serverTime: Date.now(),
      deadlineAt: this.record?.deadlineAt,
      projection,
      events: this.record?.events ?? [],
    };
  }

  private broadcast(exclude?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue;
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment) socket.send(JSON.stringify({ type: 'snapshot', snapshot: this.snapshot(attachment.seat) }));
    }
  }

  private hasConnectedSeat(seat: Seat, exclude?: WebSocket): boolean {
    return this.ctx.getWebSockets().some((socket) => {
      if (socket === exclude) return false;
      return (socket.deserializeAttachment() as SocketAttachment | null)?.seat === seat;
    });
  }

  private async scheduleAlarm(): Promise<void> {
    const deadlines = [this.record?.deadlineAt, this.record?.ratingRetryAt,
      ...Object.values(this.record?.disconnectDeadlines ?? {})].filter((value): value is number => value !== undefined);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.min(...deadlines));
    else await this.ctx.storage.deleteAlarm();
  }

  private async finalizeRating(): Promise<void> {
    const record = this.record;
    if (!record?.winner || !record.playerIds || record.ratingsFinalized) return;
    const deltas = eloDeltas(record.players.p1.rating, record.players.p2.rating, record.winner);
    try {
      await finalizeMatch(this.env.DB, {
        resultId: record.matchId, matchId: record.matchId, seasonId: 'public-abm-test',
        p1Id: record.playerIds.p1, p2Id: record.playerIds.p2, winnerId: record.playerIds[record.winner],
        p1Delta: deltas.p1, p2Delta: deltas.p2,
        summary: JSON.stringify({ format: record.format, games: record.games, winner: record.winner,
          completionReason: record.completionReason, disconnectedPlayer: record.disconnectedPlayer,
          ratings: { p1: record.players.p1.rating, p2: record.players.p2.rating }, deltas }),
      });
      record.ratingsFinalized = true;
      record.ratingRetryAt = undefined;
    } catch {
      record.ratingRetryAt = Date.now() + 5_000;
    }
  }
}

interface QueueEntry { guestId: string; name: string; rating: number; queuedAt: number }
interface MatchTicket { matchId: string; seat: Seat; token: string }

export class MatchmakerObject extends DurableObject<Env> {
  async enqueue(guestId: string, guestSecret: string, name: string): Promise<{ status: 'waiting' } | ({ status: 'matched' } & MatchTicket)> {
    const player = await authenticateGuest(this.env.DB, guestId, guestSecret, name);
    const ticket = await this.ctx.storage.get<MatchTicket>(`ticket:${guestId}`);
    if (ticket) {
      await this.ctx.storage.delete(`ticket:${guestId}`);
      return { status: 'matched', ...ticket };
    }
    const queue = (await this.ctx.storage.get<QueueEntry[]>('queue')) ?? [];
    const opponent = queue.find((entry) => entry.guestId !== guestId);
    if (!opponent) {
      if (!queue.some((entry) => entry.guestId === guestId)) queue.push({ guestId, name, rating: player.rating, queuedAt: Date.now() });
      await this.ctx.storage.put('queue', queue);
      return { status: 'waiting' };
    }
    await this.ctx.storage.put('queue', queue.filter((entry) => entry.guestId !== opponent.guestId));
    const id = this.env.MATCHES.newUniqueId();
    const matchId = id.toString();
    const initialized = await this.env.MATCHES.get(id).initialize(matchId, {
      p1: { name: opponent.name, platform: 'Web', rating: opponent.rating },
      p2: { name, platform: 'Web', rating: player.rating },
    }, { p1: opponent.guestId, p2: guestId }, 'abm-only');
    const first: MatchTicket = { matchId, seat: 'p1', token: initialized.seats.p1 };
    const second: MatchTicket = { matchId, seat: 'p2', token: initialized.seats.p2 };
    await this.ctx.storage.put(`ticket:${opponent.guestId}`, first);
    return { status: 'matched', ...second };
  }

  async cancel(guestId: string, guestSecret: string): Promise<void> {
    await authenticateExistingGuest(this.env.DB, guestId, guestSecret);
    const queue = (await this.ctx.storage.get<QueueEntry[]>('queue')) ?? [];
    await this.ctx.storage.put('queue', queue.filter((entry) => entry.guestId !== guestId));
    await this.ctx.storage.delete(`ticket:${guestId}`);
  }
}

abstract class BroadcastObject extends DurableObject<Env> {
  abstract maxMessageBytes: number;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(sender: WebSocket, message: string | ArrayBuffer): void {
    const size = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (size > this.maxMessageBytes) {
      sender.send(JSON.stringify({ type: 'error', message: 'Message too large.' }));
      return;
    }
    for (const socket of this.ctx.getWebSockets()) if (socket !== sender) socket.send(message);
  }
}

interface LobbyAttachment extends LobbyPlayer { messageTimes: number[]; clientKey: string }
interface LobbyGracePlayer extends LobbyPlayer { expiresAt: number }
const LOBBY_GRACE_MS = 5_000;
const CHANNEL_SOCKETS_PER_GUEST = 3;
const CHANNEL_SOCKETS_PER_CLIENT = 20;

export class LobbyObject extends DurableObject<Env> {
  async getOnlinePlayerCount(): Promise<number> { return (await this.roster()).length; }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
    const url = new URL(request.url);
    const playerId = url.searchParams.get('guest');
    if (!playerId || !validClientId(playerId)) return json({ error: 'Invalid guest.' }, 400);
    const displayName = sanitizeText(url.searchParams.get('name'), 50) || 'Guest';
    const guestSecret = socketCredential(request.headers.get('Sec-WebSocket-Protocol'), LOBBY_SOCKET_PROTOCOL);
    if (!guestSecret) return json({ error: 'Invalid guest credentials.' }, 401);
    try { await authenticateGuest(this.env.DB, playerId, guestSecret, displayName); }
    catch { return json({ error: 'Invalid guest credentials.' }, 401); }
    const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown-client';
    const connections = this.connectedPlayers();
    if (connections.filter((player) => player.playerId === playerId).length >= CHANNEL_SOCKETS_PER_GUEST
      || connections.filter((player) => player.clientKey === clientKey).length >= CHANNEL_SOCKETS_PER_CLIENT) return rateLimited();
    await this.ctx.storage.delete(`lobby:grace:${playerId}`);
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, displayName, presence: 'idle', messageTimes: [], clientKey } satisfies LobbyAttachment);
    await this.broadcastRoster();
    return webSocketResponse(client, LOBBY_SOCKET_PROTOCOL);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 2_000) return;
    try {
      const message = JSON.parse(raw) as { type?: unknown; presence?: unknown };
      if (message.type !== 'presence' || !isLobbyPresence(message.presence)) throw new Error('Invalid presence.');
      const attachment = socket.deserializeAttachment() as LobbyAttachment | null;
      if (!attachment) return;
      if (!allowSocketMessage(socket, attachment, Date.now())) return;
      if (attachment.presence === message.presence) return;
      for (const candidate of this.ctx.getWebSockets()) {
        const player = candidate.deserializeAttachment() as LobbyAttachment | null;
        if (player?.playerId === attachment.playerId) candidate.serializeAttachment({ ...player, presence: message.presence });
      }
      await this.broadcastRoster();
    } catch { socket.send(JSON.stringify({ type: 'error', message: 'Invalid lobby message.' } satisfies LobbyServerMessage)); }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const player = socket.deserializeAttachment() as LobbyAttachment | null;
    if (!player || this.connectedPlayers(socket).some((candidate) => candidate.playerId === player.playerId)) return;
    await this.ctx.storage.put(`lobby:grace:${player.playerId}`, { ...player, expiresAt: Date.now() + LOBBY_GRACE_MS } satisfies LobbyGracePlayer);
    await this.ctx.storage.setAlarm(Date.now() + LOBBY_GRACE_MS);
    await this.broadcastRoster();
  }

  async alarm(): Promise<void> {
    const grace = await this.ctx.storage.list<LobbyGracePlayer>({ prefix: 'lobby:grace:' });
    const now = Date.now(); const expired = [...grace].filter(([, player]) => player.expiresAt <= now).map(([key]) => key);
    if (expired.length) await this.ctx.storage.delete(expired);
    const remaining = [...grace.values()].filter((player) => player.expiresAt > now);
    if (remaining.length) await this.ctx.storage.setAlarm(Math.min(...remaining.map((player) => player.expiresAt)));
    await this.broadcastRoster();
  }

  private connectedPlayers(exclude?: WebSocket): LobbyAttachment[] {
    return this.ctx.getWebSockets().flatMap((socket) => {
      if (socket === exclude) return [];
      const player = socket.deserializeAttachment() as LobbyAttachment | null; return player ? [player] : [];
    });
  }

  private async roster(): Promise<LobbyPlayer[]> {
    const players = new Map<string, LobbyPlayer>();
    const grace = await this.ctx.storage.list<LobbyGracePlayer>({ prefix: 'lobby:grace:' });
    for (const player of grace.values()) if (player.expiresAt > Date.now()) players.set(player.playerId, player);
    for (const player of this.connectedPlayers()) players.set(player.playerId, player);
    return [...players.values()].map(({ playerId, displayName, presence }) => ({ playerId, displayName, presence }));
  }

  private async broadcastRoster(): Promise<void> {
    const players = await this.roster();
    for (const socket of this.ctx.getWebSockets()) {
      const self = socket.deserializeAttachment() as LobbyAttachment | null;
      if (self) socket.send(JSON.stringify({ type: 'roster', selfId: self.playerId, players } satisfies LobbyServerMessage));
    }
  }
}

interface WhiteboardAttachment { guestId: string; displayName: string; clientKey: string }
interface WhiteboardPrune { throughSequence: number; removed: WhiteboardOperation[] }
const WHITEBOARD_MAX_OPERATIONS = 800;
const WHITEBOARD_PRUNE_OPERATIONS = 200;
const WHITEBOARD_MAX_POINTS = 180;

export class WhiteboardObject extends DurableObject<Env> {
  private board: WhiteboardSnapshot = createEmptyWhiteboard();
  private readonly rateLimiter = new WhiteboardRateLimiter();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const meta = await ctx.storage.get<Omit<WhiteboardSnapshot, 'operations'>>('board:meta');
      const stored = await ctx.storage.list<WhiteboardOperation>({ prefix: 'board:operation:' });
      if (meta) this.board = { ...meta, operations: [...stored.values()].sort((a, b) => a.sequence - b.sequence) };
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
    const url = new URL(request.url);
    const guestId = url.searchParams.get('guest');
    if (!guestId || !validClientId(guestId)) return json({ error: 'Invalid guest.' }, 400);
    const displayName = sanitizeText(url.searchParams.get('name'), 50) || 'Guest';
    const guestSecret = socketCredential(request.headers.get('Sec-WebSocket-Protocol'), WHITEBOARD_SOCKET_PROTOCOL);
    if (!guestSecret) return json({ error: 'Invalid guest credentials.' }, 401);
    try { await authenticateGuest(this.env.DB, guestId, guestSecret, displayName); }
    catch { return json({ error: 'Invalid guest credentials.' }, 401); }
    const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown-client';
    const connections = this.ctx.getWebSockets().flatMap((socket) => {
      const attachment = socket.deserializeAttachment() as WhiteboardAttachment | null; return attachment ? [attachment] : [];
    });
    if (connections.filter((player) => player.guestId === guestId).length >= CHANNEL_SOCKETS_PER_GUEST
      || connections.filter((player) => player.clientKey === clientKey).length >= CHANNEL_SOCKETS_PER_CLIENT) return rateLimited();
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server); server.serializeAttachment({ guestId, displayName, clientKey } satisfies WhiteboardAttachment);
    this.send(server, { type: 'snapshot', board: this.board });
    const visit = url.searchParams.get('visit');
    if (visit && validClientId(visit) && !this.board.operations.some((operation) => operation.clientOperationId === `join:${visit}`)) {
      if (this.rateLimiter.allow(guestId, 'text', Date.now())) {
        const operation = this.createSystemText(`${displayName} entered the lobby!`, `join:${visit}`);
        const prune = this.pruneIfNeeded();
        this.board.operations.push(operation); this.board.sequence = operation.sequence; this.board.nextY = operation.rowY + operation.rowSpan * this.board.rowHeight;
        await this.persistOperation(operation, prune); this.broadcastPrune(prune);
        this.broadcast({ type: 'operation', operation }); await this.trimIfNeeded();
      }
    }
    return webSocketResponse(client, WHITEBOARD_SOCKET_PROTOCOL);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > 16_000) { this.error(socket, 'message-too-large', 'Message too large.'); return; }
    try {
      const message = JSON.parse(raw) as WhiteboardClientMessage;
      if (!message || !['chat', 'status', 'stroke', 'erase'].includes(message.type) || !validClientId(message.clientOperationId)) throw new Error('Invalid whiteboard message.');
      const duplicate = this.board.operations.find((operation) => operation.clientOperationId === message.clientOperationId);
      if (duplicate) { this.send(socket, { type: 'operation', operation: duplicate }); return; }
      const attachment = socket.deserializeAttachment() as WhiteboardAttachment | null;
      if (!attachment) throw new Error('Missing guest identity.');
      const operation = this.createOperation(message, attachment.displayName);
      if (!operation) throw new Error('Invalid whiteboard content.');
      const category: WhiteboardRateCategory = message.type === 'stroke' || message.type === 'erase' ? 'draw' : 'text';
      if (!this.rateLimiter.allow(attachment.guestId, category, Date.now())) {
        this.error(socket, 'rate-limited', 'Too many whiteboard operations.', message.clientOperationId); return;
      }
      const prune = this.pruneIfNeeded();
      this.board.operations.push(operation); this.board.sequence = operation.sequence;
      if (operation.kind === 'text') this.board.nextY = operation.rowY + operation.rowSpan * this.board.rowHeight;
      await this.persistOperation(operation, prune);
      this.broadcastPrune(prune);
      this.broadcast({ type: 'operation', operation });
      if (operation.kind === 'text') await this.trimIfNeeded();
    } catch (error) { this.error(socket, 'invalid-message', error instanceof Error ? error.message : 'Invalid whiteboard message.'); }
  }

  private createOperation(message: WhiteboardClientMessage, displayName: string): WhiteboardOperation | undefined {
    const common = { id: crypto.randomUUID(), sequence: this.board.sequence + 1, clientOperationId: message.clientOperationId };
    if (message.type === 'status') {
      if (message.status !== 'ready') return;
      return this.createSystemText(`${displayName} is ready to play!`, message.clientOperationId);
    }
    if (message.type === 'chat') {
      const text = sanitizeText(message.text, 200);
      if (!text) return;
      const color = normalizeColor(message.color);
      const rowSpan = Math.max(1, Math.min(3, Math.ceil((displayName.length + text.length + 2) / 37)));
      return { ...common, kind: 'text', displayName, text, color, rowY: this.board.nextY, rowSpan };
    }
    const points = sanitizePoints(message.points, this.board.top, this.board.top + this.board.maxHeight);
    if (points.length < 2) return;
    return message.type === 'erase'
      ? { ...common, kind: 'erase', width: 120, points }
      : { ...common, kind: 'stroke', color: normalizeColor(message.color), width: 5, points };
  }

  private createSystemText(text: string, clientOperationId: string): Extract<WhiteboardOperation, { kind: 'text' }> {
    const rowSpan = Math.max(1, Math.min(3, Math.ceil(text.length / 37)));
    return { kind: 'text', id: crypto.randomUUID(), sequence: this.board.sequence + 1, clientOperationId,
      displayName: '', text, color: 'black', system: true, rowY: this.board.nextY, rowSpan };
  }

  private async persistOperation(operation: WhiteboardOperation, prune?: WhiteboardPrune): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      if (prune) await storage.delete(prune.removed.map((item) => operationKey(item.sequence)));
      await storage.put(operationKey(operation.sequence), operation);
      await storage.put('board:meta', boardMeta(this.board));
    });
  }

  private pruneIfNeeded(): WhiteboardPrune | undefined {
    const result = pruneWhiteboardOperationPrefix(this.board.operations, WHITEBOARD_MAX_OPERATIONS, WHITEBOARD_PRUNE_OPERATIONS);
    if (result.throughSequence === undefined) return;
    this.board.operations = result.retained;
    return { throughSequence: result.throughSequence, removed: result.removed };
  }

  private broadcastPrune(prune?: WhiteboardPrune): void {
    if (prune) this.broadcast({ type: 'prune', throughSequence: prune.throughSequence });
  }

  private async trimIfNeeded(): Promise<void> {
    const overflow = this.board.nextY - this.board.top - this.board.maxHeight;
    if (overflow <= 0) return;
    const old = this.board.operations; this.board.top += Math.ceil(overflow / this.board.rowHeight) * this.board.rowHeight;
    this.board.operations = old.filter((operation) => operation.kind === 'text'
      ? operation.rowY + operation.rowSpan * this.board.rowHeight > this.board.top
      : operation.points.some((point) => point.y >= this.board.top));
    const removed = old.filter((operation) => !this.board.operations.includes(operation));
    await this.ctx.storage.transaction(async (storage) => {
      await storage.delete(removed.map((operation) => operationKey(operation.sequence)));
      await storage.put('board:meta', boardMeta(this.board));
    });
    this.broadcast({ type: 'trim', top: this.board.top });
  }

  private broadcast(message: WhiteboardServerMessage): void { for (const socket of this.ctx.getWebSockets()) this.send(socket, message); }
  private send(socket: WebSocket, message: WhiteboardServerMessage): void { socket.send(JSON.stringify(message)); }
  private error(socket: WebSocket, code: string, message: string, clientOperationId?: string): void {
    this.send(socket, { type: 'error', code, message, ...(clientOperationId ? { clientOperationId } : {}) });
  }
}

function boardMeta(board: WhiteboardSnapshot): Omit<WhiteboardSnapshot, 'operations'> { const { operations: _operations, ...meta } = board; return meta; }
function operationKey(sequence: number): string { return `board:operation:${String(sequence).padStart(12, '0')}`; }
function validClientId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 100; }
function normalizeColor(value: unknown): WhiteboardColor { return WHITEBOARD_COLORS.includes(value as WhiteboardColor) ? value as WhiteboardColor : 'black'; }
function sanitizeText(value: unknown, max: number): string { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''; }
function sanitizePoints(value: unknown, minimumY: number, maximumY: number): WhiteboardPoint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, WHITEBOARD_MAX_POINTS).flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const candidate = point as { x?: unknown; y?: unknown };
    if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number' || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return [];
    return [{ x: Math.max(0, Math.min(760, candidate.x)), y: Math.max(minimumY, Math.min(maximumY, candidate.y)) }];
  });
}

export async function finalizeMatch(db: D1Database, result: {
  resultId: string; matchId: string; seasonId: string; p1Id: string; p2Id: string;
  winnerId: string | null; p1Delta: number; p2Delta: number; summary: string;
}): Promise<'applied' | 'duplicate'> {
  const statements = [
    db.prepare('INSERT OR IGNORE INTO match_results (result_id, match_id, season_id, p1_id, p2_id, winner_id, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(result.resultId, result.matchId, result.seasonId, result.p1Id, result.p2Id, result.winnerId, result.summary),
    db.prepare('UPDATE players SET rating = rating + ? WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND ratings_applied = 0)').bind(result.p1Delta, result.p1Id, result.resultId),
    db.prepare('UPDATE players SET rating = rating + ? WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND ratings_applied = 0)').bind(result.p2Delta, result.p2Id, result.resultId),
    db.prepare('UPDATE match_results SET ratings_applied = 1 WHERE result_id = ? AND ratings_applied = 0').bind(result.resultId),
  ];
  const responses = await db.batch(statements);
  return responses[3]?.meta.changes === 1 ? 'applied' : 'duplicate';
}

async function authenticateGuest(db: D1Database, guestId: string, secret: string, displayName: string): Promise<{ rating: number }> {
  if (!validClientId(guestId) || secret.length < 32 || secret.length > 256) throw new Error('Invalid guest credentials.');
  const secretHash = await sha256(secret);
  await db.prepare('INSERT OR IGNORE INTO players (player_id, guest_secret_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(guestId, secretHash, displayName, Date.now(), Date.now()).run();
  const player = await db.prepare('SELECT guest_secret_hash, rating FROM players WHERE player_id = ?').bind(guestId)
    .first<{ guest_secret_hash: string; rating: number }>();
  if (!player || player.guest_secret_hash !== secretHash) throw new Error('Invalid guest credentials.');
  await db.prepare('UPDATE players SET display_name = ?, updated_at = ? WHERE player_id = ?').bind(displayName, Date.now(), guestId).run();
  return { rating: player.rating };
}

async function authenticateExistingGuest(db: D1Database, guestId: string, secret: string): Promise<void> {
  if (!validClientId(guestId) || secret.length < 32 || secret.length > 256) throw new Error('Invalid guest credentials.');
  const secretHash = await sha256(secret);
  const player = await db.prepare('SELECT guest_secret_hash FROM players WHERE player_id = ?').bind(guestId)
    .first<{ guest_secret_hash: string }>();
  if (!player || player.guest_secret_hash !== secretHash) throw new Error('Invalid guest credentials.');
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (!isAllowedRequestOrigin(origin, url.origin, env.ALLOWED_ORIGINS)) return json({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: origin ? corsHeadersForOrigin(origin) : undefined });
    return withCors(await routeRequest(request, env, url), origin);
  },
} satisfies ExportedHandler<Env>;

async function routeRequest(request: Request, env: Env, url: URL): Promise<Response> {
    const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown-client';
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/online-status') {
      if (!await allowed(env.SOCKET_RATE, `status:${clientKey}`)) return rateLimited();
      return json({ playersOnline: await env.LOBBY.getByName('global').getOnlinePlayerCount() });
    }
    if (url.pathname === '/matchmaking' && request.method === 'POST') {
      try {
        if (!await allowed(env.MATCHMAKING_IP_RATE, clientKey)) return rateLimited();
        const body = await readJsonBody<{ guestId?: string; guestSecret?: string; name?: string }>(request);
        if (!body.guestId || !body.guestSecret || !body.name) return json({ error: 'guestId, guestSecret, and name are required.' }, 400);
        if (!await allowed(env.MATCHMAKING_GUEST_RATE, body.guestId)) return rateLimited();
        return json(await env.MATCHMAKER.getByName('global').enqueue(body.guestId, body.guestSecret, sanitizeText(body.name, 50) || 'Guest'));
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        return json({ error: error instanceof Error ? error.message : 'Matchmaking failed.' }, 401);
      }
    }
    if (url.pathname === '/matchmaking' && request.method === 'DELETE') {
      try {
        if (!await allowed(env.MATCHMAKING_IP_RATE, clientKey)) return rateLimited();
        const body = await readJsonBody<{ guestId?: string; guestSecret?: string }>(request);
        if (!body.guestId || !body.guestSecret) return json({ error: 'guestId and guestSecret are required.' }, 400);
        if (!await allowed(env.MATCHMAKING_GUEST_RATE, body.guestId)) return rateLimited();
        await env.MATCHMAKER.getByName('global').cancel(body.guestId, body.guestSecret);
        return new Response(null, { status: 204 });
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        return json({ error: error instanceof Error ? error.message : 'Cancellation failed.' }, 401);
      }
    }
    const match = url.pathname.match(/^\/matches\/([a-f0-9]{64})$/);
    if (match?.[1]) {
      if (!await allowed(env.SOCKET_RATE, `socket:${clientKey}`)) return rateLimited();
      return env.MATCHES.get(env.MATCHES.idFromString(match[1])).fetch(request);
    }
    if (url.pathname === '/lobby' || url.pathname === '/whiteboard') {
      if (!await allowed(env.SOCKET_RATE, `socket:${clientKey}`)) return rateLimited();
      const guestId = url.searchParams.get('guest');
      if (!guestId || !validClientId(guestId)) return json({ error: 'Invalid guest.' }, 400);
      if (!await allowed(env.SOCKET_RATE, `guest:${guestId}`)) return rateLimited();
      return url.pathname === '/lobby' ? env.LOBBY.getByName('global').fetch(request) : env.WHITEBOARD.getByName('global').fetch(request);
    }
    return json({ error: 'Not found.' }, 404);
}

function token(): string { return crypto.randomUUID(); }
function isSeat(value: string | null): value is Seat { return value === 'p1' || value === 'p2'; }
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

const SOCKET_MESSAGE_LIMIT = 30;
const SOCKET_MESSAGE_WINDOW_MS = 10_000;
function allowSocketMessage<T extends { messageTimes: number[] }>(socket: WebSocket, attachment: T, now: number): boolean {
  const result = consumeSlidingWindow(attachment.messageTimes ?? [], now, SOCKET_MESSAGE_LIMIT, SOCKET_MESSAGE_WINDOW_MS);
  attachment.messageTimes = result.times;
  if (!result.allowed) return false;
  socket.serializeAttachment(attachment); return true;
}

async function allowed(limiter: RateLimit, key: string): Promise<boolean> {
  return (await limiter.limit({ key })).success;
}

function rateLimited(): Response {
  return Response.json({ error: 'Too many requests.' }, {
    status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60' },
  });
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin || response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeadersForOrigin(origin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}


function webSocketResponse(socket: WebSocket, protocol: string): Response {
  return new Response(null, { status: 101, webSocket: socket, headers: { 'Sec-WebSocket-Protocol': protocol } });
}
