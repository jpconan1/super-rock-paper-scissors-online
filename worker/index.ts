import { DurableObject } from 'cloudflare:workers';
import { parseClientCommand, PROTOCOL_VERSION, type ClientCommand } from '../src/protocol/protocol';
import { getServerVariant } from '../src/core/serverVariantRegistry';
import type { TimedSemanticEvent } from '../src/protocol/protocol';

interface Env {
  MATCHES: DurableObjectNamespace<MatchObject>;
  MATCHMAKER: DurableObjectNamespace<MatchmakerObject>;
  LOBBY: DurableObjectNamespace<LobbyObject>;
  WHITEBOARD: DurableObjectNamespace<WhiteboardObject>;
  DB: D1Database;
}

type Seat = 'p1' | 'p2';
interface MatchRecord {
  matchId: string;
  revision: number;
  variantId: string;
  rulesVersion: number;
  gameState: unknown;
  events: readonly TimedSemanticEvent[];
  seed: number;
  tokens: Record<Seat, string>;
  processed: string[];
  accepted: Array<{ revision: number; seat: Seat; command: ClientCommand }>;
  deadlineAt?: number;
}
interface SocketAttachment { seat: Seat }

export class MatchObject extends DurableObject<Env> {
  private record?: MatchRecord;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get<MatchRecord>('match'); });
  }

  async initialize(matchId: string, variantId = 'fireball-war'): Promise<{ matchId: string; seats: Record<Seat, string> }> {
    if (!this.record) {
      const rules = getServerVariant(variantId);
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      this.record = {
        matchId,
        revision: 0,
        variantId: rules.variantId,
        rulesVersion: rules.rulesVersion,
        gameState: rules.initialize(deterministicContext(seed, Date.now())),
        events: [],
        seed,
        tokens: { p1: token(), p2: token() },
        processed: [],
        accepted: [],
      };
      await this.ctx.storage.put('match', this.record);
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
      const rules = getServerVariant(this.record.variantId, this.record.rulesVersion);
      const nextRevision = this.record.revision + 1;
      const resolution = rules.resolve(this.record.gameState, attachment.seat, command.payload, deterministicContext(this.record.seed + nextRevision, Date.now()));
      this.record.gameState = resolution.state;
      this.record.events = (resolution.events ?? []).map((event, index) => ({ ...event, id: `${this.record!.matchId}:${nextRevision}:${index}` }));
      this.record.revision++;
      this.record.processed.push(command.commandId);
      this.record.accepted.push({ revision: this.record.revision, seat: attachment.seat, command });
      await this.ctx.storage.put('match', this.record);
      this.broadcast();
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Invalid command.' }));
    }
  }

  async alarm(): Promise<void> {
    if (!this.record?.deadlineAt || this.record.deadlineAt > Date.now()) return;
    this.record.deadlineAt = undefined;
    await this.ctx.storage.put('match', this.record);
    this.broadcast();
  }

  private snapshot(seat: Seat) {
    const projection = this.record
      ? getServerVariant(this.record.variantId, this.record.rulesVersion).project(this.record.gameState, seat)
      : undefined;
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
}

interface QueueEntry { guestId: string; queuedAt: number }

export class MatchmakerObject extends DurableObject<Env> {
  async enqueue(guestId: string): Promise<{ status: 'waiting' } | { status: 'matched'; opponentId: string }> {
    const queue = (await this.ctx.storage.get<QueueEntry[]>('queue')) ?? [];
    const opponent = queue.find((entry) => entry.guestId !== guestId);
    if (!opponent) {
      if (!queue.some((entry) => entry.guestId === guestId)) queue.push({ guestId, queuedAt: Date.now() });
      await this.ctx.storage.put('queue', queue);
      return { status: 'waiting' };
    }
    await this.ctx.storage.put('queue', queue.filter((entry) => entry.guestId !== opponent.guestId));
    return { status: 'matched', opponentId: opponent.guestId };
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
export class WhiteboardObject extends BroadcastObject { maxMessageBytes = 16_000; }

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
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/matches' && request.method === 'POST') {
      const id = env.MATCHES.newUniqueId();
      return json(await env.MATCHES.get(id).initialize(id.toString()), 201);
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
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

function deterministicContext(seed: number, now: number) {
  let value = seed >>> 0;
  return {
    now,
    random: () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x1_0000_0000;
    },
  };
}
