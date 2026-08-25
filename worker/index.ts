import { DurableObject } from 'cloudflare:workers';
import { parseClientCommand, PROTOCOL_VERSION, type ClientCommand } from '../src/protocol/protocol';
import { getServerVariant } from '../src/core/serverVariantRegistry';
import type { TimedSemanticEvent } from '../src/protocol/protocol';
import { acceptMatchCommand, advanceMatchDeadline, createOnlineMatch, projectOnlineMatch, type OnlineMatchState } from '../src/core/onlineMatch';
import type { MatchCommandPayload, MatchPlayer } from '../src/protocol/protocol';
import {
  createEmptyWhiteboard, WHITEBOARD_COLORS, type WhiteboardClientMessage, type WhiteboardColor,
  type WhiteboardOperation, type WhiteboardPoint, type WhiteboardServerMessage, type WhiteboardSnapshot,
} from '../src/whiteboard/protocol';

interface Env {
  MATCHES: DurableObjectNamespace<MatchObject>;
  MATCHMAKER: DurableObjectNamespace<MatchmakerObject>;
  LOBBY: DurableObjectNamespace<LobbyObject>;
  WHITEBOARD: DurableObjectNamespace<WhiteboardObject>;
  DB: D1Database;
}

type Seat = 'p1' | 'p2';
interface MatchRecord extends OnlineMatchState {
  tokens: Record<Seat, string>;
  accepted: Array<{ revision: number; seat: Seat; command: ClientCommand }>;
}
interface SocketAttachment { seat: Seat }

export class MatchObject extends DurableObject<Env> {
  private record?: MatchRecord;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get<MatchRecord>('match'); });
  }

  async initialize(matchId: string, players?: Record<Seat, MatchPlayer>): Promise<{ matchId: string; seats: Record<Seat, string> }> {
    if (!this.record) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      this.record = Object.assign(createOnlineMatch(matchId, players ?? {
        p1: { name: 'Player 1', platform: 'Web', rating: 1500 },
        p2: { name: 'Player 2', platform: 'Web', rating: 1500 },
      }, seed, Date.now()), {
        tokens: { p1: token(), p2: token() },
        accepted: [],
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
    const resumeToken = url.searchParams.get('token');
    if (!this.record || !isSeat(seat) || this.record.tokens[seat] !== resumeToken) return json({ error: 'Invalid seat token.' }, 401);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat } satisfies SocketAttachment);
    server.send(JSON.stringify(this.snapshot(seat)));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || typeof message !== 'string' || !this.record) return;
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
      await this.ctx.storage.put('match', this.record);
      await this.scheduleAlarm();
      this.broadcast();
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Invalid command.' }));
    }
  }

  async alarm(): Promise<void> {
    if (!this.record || !advanceMatchDeadline(this.record, Date.now())) return;
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

  private broadcast(): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment) socket.send(JSON.stringify({ type: 'snapshot', snapshot: this.snapshot(attachment.seat) }));
    }
  }

  private async scheduleAlarm(): Promise<void> {
    if (this.record?.deadlineAt) await this.ctx.storage.setAlarm(this.record.deadlineAt);
  }
}

interface QueueEntry { guestId: string; name: string; queuedAt: number }
interface MatchTicket { matchId: string; seat: Seat; token: string }

export class MatchmakerObject extends DurableObject<Env> {
  async enqueue(guestId: string, name: string): Promise<{ status: 'waiting' } | ({ status: 'matched' } & MatchTicket)> {
    const ticket = await this.ctx.storage.get<MatchTicket>(`ticket:${guestId}`);
    if (ticket) {
      await this.ctx.storage.delete(`ticket:${guestId}`);
      return { status: 'matched', ...ticket };
    }
    const queue = (await this.ctx.storage.get<QueueEntry[]>('queue')) ?? [];
    const opponent = queue.find((entry) => entry.guestId !== guestId);
    if (!opponent) {
      if (!queue.some((entry) => entry.guestId === guestId)) queue.push({ guestId, name, queuedAt: Date.now() });
      await this.ctx.storage.put('queue', queue);
      return { status: 'waiting' };
    }
    await this.ctx.storage.put('queue', queue.filter((entry) => entry.guestId !== opponent.guestId));
    const id = this.env.MATCHES.newUniqueId();
    const matchId = id.toString();
    const initialized = await this.env.MATCHES.get(id).initialize(matchId, {
      p1: { name: opponent.name, platform: 'Web', rating: 1500 },
      p2: { name, platform: 'Web', rating: 1500 },
    });
    const first: MatchTicket = { matchId, seat: 'p1', token: initialized.seats.p1 };
    const second: MatchTicket = { matchId, seat: 'p2', token: initialized.seats.p2 };
    await this.ctx.storage.put(`ticket:${opponent.guestId}`, first);
    return { status: 'matched', ...second };
  }

  async cancel(guestId: string): Promise<void> {
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

export class LobbyObject extends BroadcastObject { maxMessageBytes = 2_000; }

interface WhiteboardAttachment { strokeTimes: number[] }
const WHITEBOARD_MAX_OPERATIONS = 800;
const WHITEBOARD_MAX_POINTS = 180;
const WHITEBOARD_STROKES_PER_SECOND = 12;

export class WhiteboardObject extends DurableObject<Env> {
  private board: WhiteboardSnapshot = createEmptyWhiteboard();

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
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server); server.serializeAttachment({ strokeTimes: [] } satisfies WhiteboardAttachment);
    this.send(server, { type: 'snapshot', board: this.board });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > 16_000) { this.error(socket, 'message-too-large', 'Message too large.'); return; }
    try {
      const message = JSON.parse(raw) as WhiteboardClientMessage;
      if (!message || !['chat', 'stroke', 'erase'].includes(message.type) || !validClientId(message.clientOperationId)) throw new Error('Invalid whiteboard message.');
      const duplicate = this.board.operations.find((operation) => operation.clientOperationId === message.clientOperationId);
      if (duplicate) { this.send(socket, { type: 'operation', operation: duplicate }); return; }
      if (message.type !== 'chat' && !this.allowStroke(socket)) { this.error(socket, 'rate-limited', 'Drawing too quickly.'); return; }
      const operation = this.createOperation(message);
      if (!operation) throw new Error('Invalid whiteboard content.');
      this.board.operations.push(operation); this.board.sequence = operation.sequence;
      if (operation.kind === 'text') this.board.nextY = operation.rowY + operation.rowSpan * this.board.rowHeight;
      if (this.board.operations.length > WHITEBOARD_MAX_OPERATIONS) { await this.reset(); return; }
      await this.persistOperation(operation);
      this.broadcast({ type: 'operation', operation });
      if (operation.kind === 'text') await this.trimIfNeeded();
    } catch (error) { this.error(socket, 'invalid-message', error instanceof Error ? error.message : 'Invalid whiteboard message.'); }
  }

  private createOperation(message: WhiteboardClientMessage): WhiteboardOperation | undefined {
    const common = { id: crypto.randomUUID(), sequence: this.board.sequence + 1, clientOperationId: message.clientOperationId };
    if (message.type === 'chat') {
      const text = sanitizeText(message.text, 200); const displayName = sanitizeText(message.displayName, 50);
      if (!text) return;
      const color = normalizeColor(message.color);
      const rowSpan = Math.max(1, Math.min(3, Math.ceil((displayName.length + text.length + 2) / 37)));
      return { ...common, kind: 'text', displayName: displayName || 'Guest', text, color, rowY: this.board.nextY, rowSpan };
    }
    const points = sanitizePoints(message.points, this.board.top, this.board.top + this.board.maxHeight);
    if (points.length < 2) return;
    return message.type === 'erase'
      ? { ...common, kind: 'erase', width: 120, points }
      : { ...common, kind: 'stroke', color: normalizeColor(message.color), width: 5, points };
  }

  private allowStroke(socket: WebSocket): boolean {
    const attachment = (socket.deserializeAttachment() as WhiteboardAttachment | null) ?? { strokeTimes: [] };
    const cutoff = Date.now() - 1_000; attachment.strokeTimes = attachment.strokeTimes.filter((time) => time > cutoff);
    if (attachment.strokeTimes.length >= WHITEBOARD_STROKES_PER_SECOND) return false;
    attachment.strokeTimes.push(Date.now()); socket.serializeAttachment(attachment); return true;
  }

  private async persistOperation(operation: WhiteboardOperation): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put(operationKey(operation.sequence), operation);
      await storage.put('board:meta', boardMeta(this.board));
    });
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

  private async reset(): Promise<void> {
    const keys = [...(await this.ctx.storage.list({ prefix: 'board:operation:' })).keys()];
    this.board = createEmptyWhiteboard();
    await this.ctx.storage.transaction(async (storage) => { await storage.delete(keys); await storage.put('board:meta', boardMeta(this.board)); });
    this.broadcast({ type: 'reset', board: this.board });
  }

  private broadcast(message: WhiteboardServerMessage): void { for (const socket of this.ctx.getWebSockets()) this.send(socket, message); }
  private send(socket: WebSocket, message: WhiteboardServerMessage): void { socket.send(JSON.stringify(message)); }
  private error(socket: WebSocket, code: string, message: string): void { this.send(socket, { type: 'error', code, message }); }
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/matches' && request.method === 'POST') {
      const id = env.MATCHES.newUniqueId();
      return json(await env.MATCHES.get(id).initialize(id.toString()), 201);
    }
    if (url.pathname === '/matchmaking' && request.method === 'POST') {
      const body = await request.json<{ guestId?: string; name?: string }>();
      if (!body.guestId || !body.name) return json({ error: 'guestId and name are required.' }, 400);
      return json(await env.MATCHMAKER.getByName('global').enqueue(body.guestId, body.name));
    }
    if (url.pathname === '/matchmaking' && request.method === 'DELETE') {
      const guestId = url.searchParams.get('guestId');
      if (guestId) await env.MATCHMAKER.getByName('global').cancel(guestId);
      return new Response(null, { status: 204 });
    }
    const match = url.pathname.match(/^\/matches\/([a-f0-9]+)$/);
    if (match?.[1]) return env.MATCHES.get(env.MATCHES.idFromString(match[1])).fetch(request);
    if (url.pathname === '/lobby') return env.LOBBY.getByName('global').fetch(request);
    if (url.pathname === '/whiteboard') return env.WHITEBOARD.getByName('global').fetch(request);
    return json({ error: 'Not found.' }, 404);
  },
} satisfies ExportedHandler<Env>;

function token(): string { return crypto.randomUUID(); }
function isSeat(value: string | null): value is Seat { return value === 'p1' || value === 'p2'; }
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...corsHeaders() } });
}
function corsHeaders(): Record<string, string> {
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type' };
}
