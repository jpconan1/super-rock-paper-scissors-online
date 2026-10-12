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
  createEmptyWhiteboard, pruneWhiteboardOperationPrefix, shouldPruneWhiteboardOperations, WHITEBOARD_COLORS, WHITEBOARD_MAX_HEIGHT,
  type WhiteboardClientMessage, type WhiteboardColor,
  type WhiteboardOperation, type WhiteboardPoint, type WhiteboardServerMessage, type WhiteboardSnapshot,
} from '../src/whiteboard/protocol';
import { isLobbyPresence, type LobbyPlayer, type LobbyPresence, type LobbyServerMessage } from '../src/lobby/protocol';
import { eloDeltas } from '../src/core/elo';
import { countNewestClassRoundWins, createProgressAward, createTokenProgressAward, createTutorialProgressAward, isClassUnlocked, type ProgressAward } from '../src/core/progression';
import { ABM_CLASS_IDS, type AbmCommand, type AbmClassId, type AbmState } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { WhiteboardRateLimiter, type WhiteboardRateCategory } from '../src/whiteboard/rateLimiter';
import { LOBBY_SOCKET_PROTOCOL, MATCH_SOCKET_PROTOCOL, socketCredential, WHITEBOARD_SOCKET_PROTOCOL } from '../src/protocol/webSocketAuth';
import { consumeSlidingWindow, messageFitsUtf8Limit, readJsonBody, RequestBodyError } from '../src/protocol/abuseProtection';
import { corsHeadersForOrigin, isAllowedRequestOrigin } from '../src/protocol/originPolicy';
import { refreshMatchmakingQueue, type MatchmakingQueueEntry } from '../src/core/matchmakingQueue';
import {
  createMatchTicketRecords, matchmakingTicketKey, recoverableMatchTicket, type MatchTicket,
} from '../src/core/matchmakingTickets';
import {
  PLAYER_NAME_MAX_LENGTH, normalizePlayerDisplayName, playerProfile,
} from '../src/protocol/playerProfile';
import { claimReadablePlayerId, type PlayerAccountType } from '../src/protocol/playerId';
import { createAuth, type AuthEnv } from './auth';
import { createResendMailer, type AuthMailer } from './resendMailer';
import { accountDeletionChallengeStatus, accountDeletionCodeHash, purgeAccountData } from './accountDeletion';
import { adminRoute } from './admin';
import { maintenanceCookie, maintenancePassExpiry, readMaintenanceState, verifyMaintenancePass } from './maintenance';
import { hashPassword } from 'better-auth/crypto';
import {
  emailChallengeHash, emailChallengeStatus, generateEmailCode, normalizeAuthEmail, validEmailPassword,
  type EmailChallengePurpose, type EmailChallengeRecord,
} from './emailAccounts';
import {
  hasFullLocalMatchAwardAllowance, LOCAL_MATCH_AWARD_WINDOW_MS, LOCAL_MATCH_GRANT_TTL_MS,
  localMatchGrantProblem, type LocalMatchGrant, type LocalMatchKind,
} from '../src/protocol/localMatchReceipt';

interface Env extends AuthEnv {
  MATCHES: DurableObjectNamespace<MatchObject>;
  MATCHMAKER: DurableObjectNamespace<MatchmakerObject>;
  LOBBY: DurableObjectNamespace<LobbyObject>;
  WHITEBOARD: DurableObjectNamespace<WhiteboardObject>;
  DB: D1Database;
  SOCKET_RATE: RateLimit;
  MATCHMAKING_IP_RATE: RateLimit;
  MATCHMAKING_GUEST_RATE: RateLimit;
  SIGNUP_REQUEST_RATE: RateLimit;
  SIGNUP_VERIFY_RATE: RateLimit;
  ALLOWED_ORIGINS?: string;
  ADMIN_EMAILS?: string;
}

const LOCAL_MATCH_GRANT_DEBOUNCE_MS = 2_000;
const EMAIL_SIGNUP_TTL_MS = 10 * 60_000;
const EMAIL_RATE_WINDOW_MS = 15 * 60_000;
const ACCOUNT_DELETION_TTL_MS = 10 * 60_000;
const ACCOUNT_DELETION_RESEND_MS = 60_000;
const ACCOUNT_DELETION_MAX_ATTEMPTS = 3;
const TERMS_VERSION = '2026-09-13';
const PRIVACY_VERSION = '2026-09-13';

type Seat = 'p1' | 'p2';
const MATCH_MESSAGE_MAX_BYTES = 256_000;
interface MatchRecord extends OnlineMatchState {
  tokens: Record<Seat, string>;
  accepted: Array<{ revision: number; seat: Seat; command: ClientCommand }>;
  playerIds?: Record<Seat, string>;
  ratingsFinalized?: boolean;
  ratingRetryAt?: number;
  playerProgress?: Record<Seat, number>;
  playerUnlockAll?: Record<Seat, boolean>;
  progressAwards?: Partial<Record<Seat, ProgressAward>>;
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

  async initialize(matchId: string, players?: Record<Seat, MatchPlayer>, playerIds?: Record<Seat, string>, format: 'abm-only' | 'multi-slot' = 'multi-slot', playerProgress?: Record<Seat, number>, playerUnlockAll?: Record<Seat, boolean>): Promise<{ matchId: string; seats: Record<Seat, string> }> {
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
        ...(playerProgress ? { playerProgress } : {}),
        ...(playerUnlockAll ? { playerUnlockAll } : {}),
      });
      await this.ctx.storage.put('match', this.record);
      await recordEvent(this.env.DB, `match-start:${matchId}`, 'match-start', Date.now(), undefined, undefined, playerIds?.p1,
        { matchId, opponentId: playerIds?.p2 });
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
    if (!allowSocketMessage(socket, attachment, Date.now())) return;
    if (!messageFitsUtf8Limit(message, MATCH_MESSAGE_MAX_BYTES)) {
      socket.send(JSON.stringify({ type: 'error', message: 'Message too large.' })); return;
    }
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
      this.assertClassUnlocked(attachment.seat, command.payload as MatchCommandPayload);
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
      projection: projection && this.record?.progressAwards?.[seat]
        ? { ...projection, progressAward: this.record.progressAwards[seat] }
        : projection,
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
    const progressAwards = record.progressAwards ??= this.createProgressAwards(record);
    try {
      await finalizeMatch(this.env.DB, {
        resultId: record.matchId, matchId: record.matchId, seasonId: 'public-abm-test',
        p1Id: record.playerIds.p1, p2Id: record.playerIds.p2, winnerId: record.playerIds[record.winner],
        p1Delta: deltas.p1, p2Delta: deltas.p2,
        p1ProgressAward: progressAwards.p1?.gainedProgressUnits ?? 0,
        p2ProgressAward: progressAwards.p2?.gainedProgressUnits ?? 0,
        summary: JSON.stringify({ format: record.format, games: record.games, winner: record.winner,
          completionReason: record.completionReason, disconnectedPlayer: record.disconnectedPlayer,
          ratings: { p1: record.players.p1.rating, p2: record.players.p2.rating }, deltas }),
      });
      record.ratingsFinalized = true;
      await recordEvent(this.env.DB, `match-complete:${record.matchId}`, record.completionReason === 'disconnect' ? 'match-disconnect' : 'match-complete',
        Date.now(), undefined, undefined, record.playerIds.p1, { matchId: record.matchId, reason: record.completionReason });
      record.ratingRetryAt = undefined;
    } catch {
      record.ratingRetryAt = Date.now() + 5_000;
    }
  }

  private createProgressAwards(record: MatchRecord): Partial<Record<Seat, ProgressAward>> {
    if (!record.playerProgress || !record.winner) return {};
    const awards: Partial<Record<Seat, ProgressAward>> = {};
    const abm = record.gameState as AbmState | undefined;
    for (const seat of ['p1', 'p2'] as const) {
      if (record.completionReason === 'disconnect' && record.disconnectedPlayer === seat) continue;
      const newestClassRoundWins = countNewestClassRoundWins(record.playerProgress[seat], abm?.roundWinningClassIds?.[seat] ?? []);
      awards[seat] = createProgressAward(record.playerProgress[seat], seat === record.winner ? 'win' : 'loss', {
        opponent: 'human', newestClassRoundWins, paused: record.playerUnlockAll?.[seat],
      });
    }
    return awards;
  }

  private assertClassUnlocked(seat: Seat, payload: MatchCommandPayload): void {
    if (payload.type !== 'variant-command' || payload.slotId !== 'slot-1' || !this.record?.playerProgress) return;
    const command = payload.command as Partial<AbmCommand> | null;
    if (command?.type === 'lock-class' && command.classId && !this.record.playerUnlockAll?.[seat] && !isClassUnlocked(this.record.playerProgress[seat], command.classId)) {
      throw new Error('Class is locked.');
    }
  }
}

const MATCHMAKING_QUEUE_TTL_MS = 5_000;
const MATCH_TICKET_TTL_MS = 30_000;

export class MatchmakerObject extends DurableObject<Env> {
  async getAdminSnapshot(): Promise<{ players: Array<MatchmakingQueueEntry & { startedAt: number; isTest: boolean }>; longestWaitMs: number }> {
    const now = Date.now();
    const active = ((await this.ctx.storage.get<MatchmakingQueueEntry[]>('queue')) ?? []).filter((entry) => now - entry.queuedAt < MATCHMAKING_QUEUE_TTL_MS);
    const players = await Promise.all(active.map(async (entry) => {
      const attempt = await this.env.DB.prepare(`SELECT a.started_at, CASE WHEN t.player_id IS NULL THEN 0 ELSE 1 END is_test
        FROM matchmaking_attempts a LEFT JOIN test_players t ON t.player_id = a.player_id WHERE a.attempt_id = ?`)
        .bind(entry.attemptId).first<{ started_at: number; is_test: number }>();
      return { ...entry, startedAt: attempt?.started_at ?? entry.queuedAt, isTest: attempt?.is_test === 1 };
    }));
    return { players, longestWaitMs: players.length ? Math.max(...players.map((entry) => now - entry.startedAt)) : 0 };
  }

  async enqueue(guestId: string, attemptId: string): Promise<{ status: 'waiting' | 'owned-elsewhere' } | ({ status: 'matched' } & MatchTicket)> {
    const player = await getPlayer(this.env.DB, guestId);
    const name = player.displayName;
    const now = Date.now();
    const ticketKey = matchmakingTicketKey(guestId, attemptId);
    const ticket = await this.ctx.storage.get<MatchTicket>(ticketKey);
    const recovered = recoverableMatchTicket(ticket, now);
    if (recovered) return { status: 'matched', ...recovered };
    if (ticket) {
      await this.ctx.storage.delete(ticketKey);
    }
    const queue = (await this.ctx.storage.get<MatchmakingQueueEntry[]>('queue')) ?? [];
    const refreshed = refreshMatchmakingQueue(queue, guestId, attemptId, name, player.rating, now, MATCHMAKING_QUEUE_TTL_MS, player.totalProgressUnits, player.unlockAllClasses);
    if (refreshed.ownedElsewhere) return { status: 'owned-elsewhere' };
    await this.env.DB.prepare(`INSERT OR IGNORE INTO matchmaking_attempts (attempt_id, player_id, started_at) VALUES (?, ?, ?)`)
      .bind(attemptId, guestId, now).run();
    await recordEvent(this.env.DB, `queue-start:${attemptId}`, 'queue-start', now, undefined, undefined, guestId);
    const opponent = refreshed.opponent;
    if (!opponent) {
      await this.ctx.storage.put('queue', refreshed.queue);
      await this.scheduleCleanup(now + MATCHMAKING_QUEUE_TTL_MS);
      return { status: 'waiting' };
    }
    await this.ctx.storage.put('queue', refreshed.queue);
    const id = this.env.MATCHES.newUniqueId();
    const matchId = id.toString();
    const initialized = await this.env.MATCHES.get(id).initialize(matchId, {
      p1: { name: opponent.name, platform: 'Web', rating: opponent.rating },
      p2: { name, platform: 'Web', rating: player.rating },
    }, { p1: opponent.guestId, p2: guestId }, 'abm-only', {
      p1: opponent.totalProgressUnits ?? 0, p2: player.totalProgressUnits,
    }, {
      p1: opponent.unlockAllClasses ?? false, p2: player.unlockAllClasses,
    });
    const expiresAt = now + MATCH_TICKET_TTL_MS;
    const ticketRecords = createMatchTicketRecords(matchId, initialized.seats, {
      p1: { guestId: opponent.guestId, attemptId: opponent.attemptId },
      p2: { guestId, attemptId },
    }, expiresAt);
    await this.ctx.storage.put(ticketRecords);
    await this.env.DB.batch([
      this.env.DB.prepare(`UPDATE matchmaking_attempts SET ended_at = ?, outcome = 'matched', match_id = ? WHERE attempt_id = ? AND ended_at IS NULL`).bind(now, matchId, attemptId),
      this.env.DB.prepare(`UPDATE matchmaking_attempts SET ended_at = ?, outcome = 'matched', match_id = ? WHERE attempt_id = ? AND ended_at IS NULL`).bind(now, matchId, opponent.attemptId),
    ]);
    await Promise.all([attemptId, opponent.attemptId].map((id) => recordEvent(this.env.DB, `queue-match:${id}`, 'queue-match', now, undefined, undefined,
      id === attemptId ? guestId : opponent.guestId, { matchId })));
    await this.scheduleCleanup(expiresAt);
    return { status: 'matched', ...ticketRecords[ticketKey]! };
  }

  async cancel(guestId: string, attemptId: string): Promise<void> {
    const queue = (await this.ctx.storage.get<MatchmakingQueueEntry[]>('queue')) ?? [];
    await this.ctx.storage.put('queue', queue.filter((entry) => entry.guestId !== guestId || entry.attemptId !== attemptId));
    await this.ctx.storage.delete(matchmakingTicketKey(guestId, attemptId));
    const now = Date.now();
    await this.env.DB.prepare(`UPDATE matchmaking_attempts SET ended_at = ?, outcome = 'cancelled' WHERE attempt_id = ? AND player_id = ? AND ended_at IS NULL`)
      .bind(now, attemptId, guestId).run();
    await recordEvent(this.env.DB, `queue-cancel:${attemptId}`, 'queue-cancel', now, undefined, undefined, guestId);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const storedQueue = (await this.ctx.storage.get<MatchmakingQueueEntry[]>('queue')) ?? [];
    const expired = storedQueue.filter((entry) => now - entry.queuedAt >= MATCHMAKING_QUEUE_TTL_MS);
    const queue = storedQueue.filter((entry) => now - entry.queuedAt < MATCHMAKING_QUEUE_TTL_MS);
    for (const entry of expired) {
      await this.env.DB.prepare(`UPDATE matchmaking_attempts SET ended_at = ?, outcome = 'timed-out' WHERE attempt_id = ? AND ended_at IS NULL`)
        .bind(entry.queuedAt + MATCHMAKING_QUEUE_TTL_MS, entry.attemptId).run();
      await recordEvent(this.env.DB, `queue-timeout:${entry.attemptId}`, 'queue-timeout', entry.queuedAt + MATCHMAKING_QUEUE_TTL_MS,
        undefined, undefined, entry.guestId);
    }
    await this.ctx.storage.put('queue', queue);
    const tickets = await this.ctx.storage.list<MatchTicket>({ prefix: 'ticket:' });
    const expiredTicketKeys = [...tickets].filter(([, ticket]) => ticket.expiresAt <= now).map(([key]) => key);
    if (expiredTicketKeys.length) await this.ctx.storage.delete(expiredTicketKeys);
    const deadlines = [
      ...queue.map((entry) => entry.queuedAt + MATCHMAKING_QUEUE_TTL_MS),
      ...[...tickets].filter(([key, ticket]) => !expiredTicketKeys.includes(key) && ticket.expiresAt > now).map(([, ticket]) => ticket.expiresAt),
    ];
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  private async scheduleCleanup(deadline: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || deadline < current) await this.ctx.storage.setAlarm(deadline);
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

interface LobbyAttachment extends LobbyPlayer { messageTimes: number[]; clientKey: string; connectedAt: number; accountType: 'guest' | 'protected'; isTest: boolean }
interface LobbyGracePlayer extends LobbyPlayer { expiresAt: number; connectedAt: number; accountType: 'guest' | 'protected'; isTest: boolean }
const LOBBY_GRACE_MS = 5_000;
const CHANNEL_SOCKETS_PER_GUEST = 3;
const CHANNEL_SOCKETS_PER_CLIENT = 20;

export class LobbyObject extends DurableObject<Env> {
  async getOnlinePlayerCount(): Promise<number> { return (await this.roster()).length; }
  async getAdminSnapshot(): Promise<unknown[]> {
    const players = new Map<string, LobbyAttachment | LobbyGracePlayer>();
    const grace = await this.ctx.storage.list<LobbyGracePlayer>({ prefix: 'lobby:grace:' });
    for (const player of grace.values()) if (player.expiresAt > Date.now()) players.set(player.playerId, player);
    for (const player of this.connectedPlayers()) players.set(player.playerId, player);
    return [...players.values()].map(({ playerId, displayName, presence, connectedAt, accountType, isTest }) => ({ playerId, displayName, presence, connectedAt, accountType, isTest }));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
    const url = new URL(request.url);
    let playerId: string; let displayName: string; let accountType: 'guest' | 'protected'; let isTest: boolean;
    try {
      const player = await authenticateRequestPlayer(request, this.env);
      playerId = player.playerId; displayName = player.displayName; accountType = player.accountType === 'guest' ? 'guest' : 'protected'; isTest = player.isTest;
    }
    catch { return json({ error: 'Authentication required.' }, 401); }
    const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown-client';
    const connections = this.connectedPlayers();
    if (connections.filter((player) => player.playerId === playerId).length >= CHANNEL_SOCKETS_PER_GUEST
      || connections.filter((player) => player.clientKey === clientKey).length >= CHANNEL_SOCKETS_PER_CLIENT) return rateLimited();
    await this.ctx.storage.delete(`lobby:grace:${playerId}`);
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, displayName, presence: 'idle', messageTimes: [], clientKey, connectedAt: Date.now(), accountType, isTest } satisfies LobbyAttachment);
    await this.broadcastRoster();
    return webSocketResponse(client, LOBBY_SOCKET_PROTOCOL);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as LobbyAttachment | null;
    if (!attachment || !allowSocketMessage(socket, attachment, Date.now())) return;
    if (typeof raw !== 'string' || raw.length > 2_000) return;
    try {
      const message = JSON.parse(raw) as { type?: unknown; presence?: unknown };
      if (message.type !== 'presence' || !isLobbyPresence(message.presence)) throw new Error('Invalid presence.');
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

interface WhiteboardAttachment { guestId: string; displayName: string; clientKey: string; messageTimes: number[]; accountType: 'guest' | 'protected'; isTest: boolean }
interface WhiteboardPrune { throughSequence: number; removed: WhiteboardOperation[] }
const WHITEBOARD_MAX_OPERATIONS = 2_000;
const WHITEBOARD_PRUNE_OPERATIONS = 500;
const WHITEBOARD_MAX_POINTS = 180;
const WHITEBOARD_MAX_OPERATION_BYTES = 2.5 * 1024 * 1024;

export class WhiteboardObject extends DurableObject<Env> {
  private board: WhiteboardSnapshot = createEmptyWhiteboard();
  private operationBytes = 0;
  private readonly rateLimiter = new WhiteboardRateLimiter();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const meta = await ctx.storage.get<Omit<WhiteboardSnapshot, 'operations'>>('board:meta');
      const stored = await ctx.storage.list<WhiteboardOperation>({ prefix: 'board:operation:' });
      if (meta) {
        const normalized: Omit<WhiteboardSnapshot, 'operations'> = { ...meta, maxHeight: WHITEBOARD_MAX_HEIGHT };
        this.board = { ...normalized, operations: [...stored.values()].sort((a, b) => a.sequence - b.sequence) };
        this.operationBytes = this.board.operations.reduce((total, operation) => total + operationByteLength(operation), 0);
        const removed: WhiteboardOperation[] = [];
        while (this.board.operations.length > WHITEBOARD_MAX_OPERATIONS || this.operationBytes > WHITEBOARD_MAX_OPERATION_BYTES) {
          const batch = this.board.operations.splice(0, WHITEBOARD_PRUNE_OPERATIONS);
          if (batch.length === 0) break;
          removed.push(...batch);
          this.operationBytes -= batch.reduce((total, operation) => total + operationByteLength(operation), 0);
        }
        if (removed.length > 0) await ctx.storage.delete(removed.map((operation) => operationKey(operation.sequence)));
        if (Number(meta.maxHeight) !== WHITEBOARD_MAX_HEIGHT) await ctx.storage.put('board:meta', normalized);
      }
    });
  }

  async getAdminSnapshot(): Promise<WhiteboardSnapshot> { return this.board; }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
    const url = new URL(request.url);
    let guestId: string; let displayName: string; let accountType: 'guest' | 'protected'; let isTest: boolean;
    try {
      const player = await authenticateRequestPlayer(request, this.env);
      guestId = player.playerId; displayName = player.displayName; accountType = player.accountType === 'guest' ? 'guest' : 'protected'; isTest = player.isTest;
    }
    catch { return json({ error: 'Authentication required.' }, 401); }
    const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown-client';
    const connections = this.ctx.getWebSockets().flatMap((socket) => {
      const attachment = socket.deserializeAttachment() as WhiteboardAttachment | null; return attachment ? [attachment] : [];
    });
    if (connections.filter((player) => player.guestId === guestId).length >= CHANNEL_SOCKETS_PER_GUEST
      || connections.filter((player) => player.clientKey === clientKey).length >= CHANNEL_SOCKETS_PER_CLIENT) return rateLimited();
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server); server.serializeAttachment({ guestId, displayName, clientKey, messageTimes: [], accountType, isTest } satisfies WhiteboardAttachment);
    this.send(server, { type: 'snapshot', board: this.board });
    const visit = url.searchParams.get('visit');
    if (visit && validClientId(visit) && !this.board.operations.some((operation) => operation.clientOperationId === `join:${visit}`)) {
      if (this.rateLimiter.allow(guestId, 'text', Date.now())) {
        const operation = this.createSystemText(`${displayName} entered the lobby!`, `join:${visit}`);
        const prune = this.pruneIfNeeded(operation);
        this.board.operations.push(operation); this.operationBytes += operationByteLength(operation);
        this.board.sequence = operation.sequence; this.board.nextY = operation.rowY + operation.rowSpan * this.board.rowHeight;
        await this.persistOperation(operation, prune); this.broadcastPrune(prune);
        await this.archiveOperation(operation, guestId, displayName, accountType, isTest);
        this.broadcast({ type: 'operation', operation }); await this.trimIfNeeded();
      }
    }
    return webSocketResponse(client, WHITEBOARD_SOCKET_PROTOCOL);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as WhiteboardAttachment | null;
    if (!attachment || !allowSocketMessage(socket, attachment, Date.now())) return;
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > 16_000) { this.error(socket, 'message-too-large', 'Message too large.'); return; }
    try {
      const message = JSON.parse(raw) as WhiteboardClientMessage;
      if (!message || !['chat', 'status', 'stroke', 'erase'].includes(message.type) || !validClientId(message.clientOperationId)) throw new Error('Invalid whiteboard message.');
      const duplicate = this.board.operations.find((operation) => operation.clientOperationId === message.clientOperationId);
      if (duplicate) { this.send(socket, { type: 'operation', operation: duplicate }); return; }
      const operation = this.createOperation(message, attachment.displayName);
      if (!operation) throw new Error('Invalid whiteboard content.');
      const category: WhiteboardRateCategory = message.type === 'stroke' || message.type === 'erase' ? 'draw' : 'text';
      if (!this.rateLimiter.allow(attachment.guestId, category, Date.now())) {
        this.error(socket, 'rate-limited', 'Too many whiteboard operations.', message.clientOperationId); return;
      }
      const prune = this.pruneIfNeeded(operation);
      this.board.operations.push(operation); this.operationBytes += operationByteLength(operation); this.board.sequence = operation.sequence;
      if (operation.kind === 'text') this.board.nextY = operation.rowY + operation.rowSpan * this.board.rowHeight;
      await this.persistOperation(operation, prune);
      await this.archiveOperation(operation, attachment.guestId, attachment.displayName, attachment.accountType, attachment.isTest);
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

  private async archiveOperation(operation: WhiteboardOperation, playerId: string, displayName: string, accountType: 'guest' | 'protected', isTest: boolean): Promise<void> {
    try {
      await this.env.DB.prepare(`INSERT OR IGNORE INTO whiteboard_archive
        (operation_id, sequence, occurred_at, player_id, display_name, account_type, operation_json, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(operation.id, operation.sequence, Date.now(), playerId, displayName, accountType, JSON.stringify(operation), isTest ? 1 : 0).run();
    } catch { /* Archiving must never interrupt the public board. */ }
  }

  private pruneIfNeeded(nextOperation: WhiteboardOperation): WhiteboardPrune | undefined {
    const nextBytes = operationByteLength(nextOperation);
    if (!shouldPruneWhiteboardOperations(this.board.operations.length, this.operationBytes, nextBytes,
      WHITEBOARD_MAX_OPERATIONS, WHITEBOARD_MAX_OPERATION_BYTES)) return;
    const result = pruneWhiteboardOperationPrefix(this.board.operations, this.board.operations.length, WHITEBOARD_PRUNE_OPERATIONS);
    if (result.throughSequence === undefined) return;
    this.board.operations = result.retained;
    this.operationBytes -= result.removed.reduce((total, operation) => total + operationByteLength(operation), 0);
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
    this.operationBytes -= removed.reduce((total, operation) => total + operationByteLength(operation), 0);
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
function operationByteLength(operation: WhiteboardOperation): number { return new TextEncoder().encode(JSON.stringify(operation)).byteLength; }
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
  winnerId: string | null; p1Delta: number; p2Delta: number; p1ProgressAward: number; p2ProgressAward: number; summary: string;
}): Promise<'applied' | 'duplicate'> {
  const statements = [
    db.prepare('INSERT OR IGNORE INTO match_results (result_id, match_id, season_id, p1_id, p2_id, winner_id, summary_json, progress_applied, p1_progress_award, p2_progress_award) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .bind(result.resultId, result.matchId, result.seasonId, result.p1Id, result.p2Id, result.winnerId, result.summary, result.p1ProgressAward, result.p2ProgressAward),
    db.prepare('UPDATE players SET rating = rating + ? WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND ratings_applied = 0)').bind(result.p1Delta, result.p1Id, result.resultId),
    db.prepare('UPDATE players SET rating = rating + ? WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND ratings_applied = 0)').bind(result.p2Delta, result.p2Id, result.resultId),
    db.prepare('UPDATE match_results SET ratings_applied = 1 WHERE result_id = ? AND ratings_applied = 0').bind(result.resultId),
    db.prepare('UPDATE players SET total_progress_units = MIN(200000, total_progress_units + ?) WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND progress_applied = 0)').bind(result.p1ProgressAward, result.p1Id, result.resultId),
    db.prepare('UPDATE players SET total_progress_units = MIN(200000, total_progress_units + ?) WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND progress_applied = 0)').bind(result.p2ProgressAward, result.p2Id, result.resultId),
    db.prepare('UPDATE match_results SET progress_applied = 1 WHERE result_id = ? AND progress_applied = 0').bind(result.resultId),
  ];
  const responses = await db.batch(statements);
  return responses[3]?.meta.changes === 1 || responses[6]?.meta.changes === 1 ? 'applied' : 'duplicate';
}

export async function applyLocalProgressAward(db: D1Database, playerId: string, resultId: string, kind: LocalMatchKind, award: ProgressAward, fullReward: boolean, createdAt = Date.now()): Promise<ProgressAward> {
  const awardJson = JSON.stringify(award);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO local_progress_awards
      (result_id, player_id, kind, gained_progress_units, award_json, full_reward, progress_applied, created_at)
      SELECT ?, ?, ?, ?, ?, ?, 0, ? WHERE EXISTS (
        SELECT 1 FROM local_match_grants WHERE grant_id = ? AND player_id = ? AND claimed_at IS NULL
      )`).bind(resultId, playerId, kind, award.gainedProgressUnits, awardJson, fullReward ? 1 : 0, createdAt, resultId, playerId),
    db.prepare(`UPDATE players SET total_progress_units = MIN(200000, total_progress_units + (
      SELECT gained_progress_units FROM local_progress_awards WHERE result_id = ? AND player_id = ? AND progress_applied = 0
    )) WHERE player_id = ? AND EXISTS (
      SELECT 1 FROM local_progress_awards WHERE result_id = ? AND player_id = ? AND progress_applied = 0
    )`).bind(resultId, playerId, playerId, resultId, playerId),
    db.prepare('UPDATE local_progress_awards SET progress_applied = 1 WHERE result_id = ? AND player_id = ? AND progress_applied = 0')
      .bind(resultId, playerId),
    db.prepare('UPDATE local_match_grants SET claimed_at = ? WHERE grant_id = ? AND player_id = ? AND claimed_at IS NULL')
      .bind(createdAt, resultId, playerId),
  ]);
  const stored = await db.prepare('SELECT player_id, award_json FROM local_progress_awards WHERE result_id = ?').bind(resultId)
    .first<{ player_id: string; award_json: string }>();
  if (!stored || stored.player_id !== playerId) throw new LocalProgressAwardConflictError();
  return JSON.parse(stored.award_json) as ProgressAward;
}

class GuestAuthError extends Error {}
class LocalProgressAwardConflictError extends Error {}

interface AuthenticatedPlayer { playerId: string; displayName: string; rating: number; totalProgressUnits: number; unlockAllClasses: boolean; accountType: PlayerAccountType; isTest: boolean }

async function getPlayer(db: D1Database, playerId: string): Promise<{ displayName: string; rating: number; totalProgressUnits: number; unlockAllClasses: boolean }> {
  const player = await db.prepare('SELECT display_name, rating, total_progress_units, unlock_all_classes FROM players WHERE player_id = ?').bind(playerId)
    .first<{ display_name: string; rating: number; total_progress_units: number; unlock_all_classes: number }>();
  if (!player) throw new GuestAuthError('Player not found.');
  return { displayName: player.display_name, rating: player.rating, totalProgressUnits: player.total_progress_units, unlockAllClasses: player.unlock_all_classes === 1 };
}

async function authenticateRequestPlayer(request: Request, env: Env): Promise<AuthenticatedPlayer> {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session) throw new GuestAuthError('Authentication required.');
  const player = await env.DB.prepare(`SELECT p.player_id, p.display_name, p.rating, p.total_progress_units, p.unlock_all_classes, p.account_type,
    CASE WHEN t.player_id IS NULL THEN 0 ELSE 1 END is_test FROM players p LEFT JOIN test_players t ON t.player_id = p.player_id WHERE p.auth_user_id = ?`)
    .bind(session.user.id).first<{ player_id: string; display_name: string; rating: number; total_progress_units: number; unlock_all_classes: number; account_type: PlayerAccountType; is_test: number }>();
  if (!player) throw new GuestAuthError('Player not found.');
  return { playerId: player.player_id, displayName: player.display_name, rating: player.rating, totalProgressUnits: player.total_progress_units,
    unlockAllClasses: player.unlock_all_classes === 1, accountType: player.account_type, isTest: player.is_test === 1 };
}

async function createPlayerRow(env: Env, authUserId: string, displayName: string, accountType: PlayerAccountType): Promise<string> {
  const now = Date.now();
  return claimReadablePlayerId(async (playerId) => {
    try {
      const inserted = await env.DB.prepare(`INSERT INTO players
        (player_id, display_name, auth_user_id, account_type, created_at, updated_at, terms_version, privacy_version, legal_accepted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(playerId, displayName, authUserId, accountType, now, now,
          accountType === 'google' ? TERMS_VERSION : null, accountType === 'google' ? PRIVACY_VERSION : null,
          accountType === 'google' ? now : null).run();
      return inserted.meta.changes === 1;
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) return false;
      throw error;
    }
  });
}

async function accountTypeForSession(db: D1Database, userId: string, anonymous: boolean): Promise<PlayerAccountType> {
  if (anonymous) return 'guest';
  const provider = await db.prepare('SELECT providerId FROM account WHERE userId = ? ORDER BY createdAt ASC LIMIT 1')
    .bind(userId).first<{ providerId: string }>();
  if (provider?.providerId === 'google') return 'google';
  if (provider?.providerId === 'apple') return 'apple';
  return 'email';
}

function emailSignupEnabled(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY) || (env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? ''));
}

async function rateKey(prefix: string, value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `${prefix}:${[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function useSignupRateLimit(db: D1Database, key: string, limit: number, now: number): Promise<boolean> {
  const cutoff = now - EMAIL_RATE_WINDOW_MS;
  const row = await db.prepare(`INSERT INTO email_signup_rate_limits (rate_key, window_started_at, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(rate_key) DO UPDATE SET
      window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END,
      request_count = CASE WHEN window_started_at <= ? THEN 1 ELSE request_count + 1 END
    RETURNING request_count`).bind(key, now, cutoff, cutoff).first<{ request_count: number }>();
  return Boolean(row && row.request_count <= limit);
}

async function anonymousSignupSession(request: Request, env: Env) {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAnonymous?: boolean }).isAnonymous) return null;
  const player = await env.DB.prepare('SELECT player_id FROM players WHERE auth_user_id = ?').bind(session.user.id).first();
  return player ? session : null;
}

interface StoredEmailChallenge extends EmailChallengeRecord {
  challenge_key: string;
  purpose: EmailChallengePurpose;
  user_id: string | null;
  email: string;
  context_json: string;
}

function emailMailer(env: Env): AuthMailer | undefined {
  if (env.RESEND_API_KEY) return createResendMailer(env.RESEND_API_KEY);
  if (env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')) {
    return { sendSignupCode: async () => {}, sendSignInCode: async () => {}, sendPasswordCode: async () => {}, sendDeletionCode: async () => {} };
  }
  return undefined;
}

function challengeCode(env: Env): string {
  return env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')
    ? env.DEV_AUTH_EMAIL_CODE! : generateEmailCode();
}

async function storeEmailChallenge(env: Env, challengeKey: string, purpose: EmailChallengePurpose, userId: string | null,
  email: string, binding: string, context: object, now: number): Promise<string> {
  const code = challengeCode(env);
  const codeHash = await emailChallengeHash(env.BETTER_AUTH_SECRET, purpose, binding, code);
  await env.DB.prepare(`INSERT INTO email_auth_challenges
    (challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, failed_attempts, requested_at, last_sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(challenge_key) DO UPDATE SET purpose = excluded.purpose, user_id = excluded.user_id, email = excluded.email,
      code_hash = excluded.code_hash, context_json = excluded.context_json, expires_at = excluded.expires_at,
      failed_attempts = 0, requested_at = excluded.requested_at, last_sent_at = excluded.last_sent_at`)
    .bind(challengeKey, purpose, userId, email, codeHash, JSON.stringify(context), now + EMAIL_SIGNUP_TTL_MS, now, now).run();
  return code;
}

async function storeEmailLoginOtp(env: Env, email: string, now: number): Promise<string> {
  const code = challengeCode(env);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const binary = String.fromCharCode(...new Uint8Array(digest));
  const storedCode = `${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}:0`;
  const identifier = `sign-in-otp-${email}`;
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + EMAIL_SIGNUP_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM verification WHERE identifier = ?').bind(identifier),
    env.DB.prepare(`INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), identifier, storedCode, expiresAt, createdAt, createdAt),
  ]);
  return code;
}

async function verifyStoredEmailChallenge(env: Env, challengeKey: string, purpose: EmailChallengePurpose, binding: string,
  code: string): Promise<StoredEmailChallenge | null> {
  const row = await env.DB.prepare(`SELECT challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, failed_attempts
    FROM email_auth_challenges WHERE challenge_key = ? AND purpose = ?`).bind(challengeKey, purpose).first<StoredEmailChallenge>();
  const candidate = await emailChallengeHash(env.BETTER_AUTH_SECRET, purpose, binding, code);
  const status = emailChallengeStatus(row, candidate, Date.now());
  if (status === 'valid') return row;
  if (row) {
    const attempts = row.failed_attempts + 1;
    if (status === 'expired' || status === 'exhausted' || attempts >= 3) {
      await env.DB.prepare('DELETE FROM email_auth_challenges WHERE challenge_key = ?').bind(challengeKey).run();
    } else await env.DB.prepare('UPDATE email_auth_challenges SET failed_attempts = ? WHERE challenge_key = ?').bind(attempts, challengeKey).run();
  }
  return null;
}

async function requestEmailSignup(request: Request, env: Env, clientKey: string): Promise<Response> {
  if (!emailSignupEnabled(env)) return json({ error: 'Email signup is unavailable.' }, 503);
  try {
    const session = await anonymousSignupSession(request, env);
    if (!session) return json({ error: 'Start a guest profile before signing up.' }, 401);
    const body = await readJsonBody<{ email?: unknown; displayName?: unknown; legalAccepted?: unknown }>(request, 2_000);
    const email = normalizeAuthEmail(body.email);
    const displayName = normalizePlayerDisplayName(body.displayName);
    if (!email) return json({ error: 'Enter a valid email address.' }, 400);
    if (!displayName) return json({ error: `Display name must be 1-${PLAYER_NAME_MAX_LENGTH} characters.` }, 400);
    if (body.legalAccepted !== true) return json({ error: 'Accept the Terms and Privacy Policy to continue.' }, 400);
    const now = Date.now();
    const emailKey = await rateKey('signup-email', email);
    const ipKey = await rateKey('signup-ip', clientKey);
    const [bindingAllowed, emailAllowed, ipAllowed] = await Promise.all([
      allowed(env.SIGNUP_REQUEST_RATE, ipKey),
      useSignupRateLimit(env.DB, emailKey, 3, now),
      useSignupRateLimit(env.DB, ipKey, 10, now),
    ]);
    if (!bindingAllowed || !emailAllowed || !ipAllowed) return rateLimited(15 * 60);
    const existing = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first<{ id: string }>();
    if (existing) return json({ error: "There's an existing account associated with this email. Try the sign-in providers or another email." }, 409);
    const code = await storeEmailChallenge(env, `signup:${session.user.id}`, 'signup', session.user.id, email, session.user.id,
      { available: true, displayName, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now }, now);
    try {
      const mailer = emailMailer(env)!;
      await mailer.sendSignupCode({ email, code });
    } catch {
      await env.DB.prepare('DELETE FROM email_auth_challenges WHERE challenge_key = ?').bind(`signup:${session.user.id}`).run();
    }
    return json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ error: 'Could not send code. Try again.' }, 500);
  }
}

async function verifyEmailSignup(request: Request, env: Env, url: URL, clientKey: string): Promise<Response> {
  if (!emailSignupEnabled(env)) return json({ error: 'Email signup is unavailable.' }, 503);
  try {
    const body = await readJsonBody<{ email?: unknown; code?: unknown; password?: unknown }>(request, 4_000);
    const email = normalizeAuthEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    if (!email || !/^\d{6}$/.test(code)) return json({ error: 'Enter the six-digit code.' }, 400);
    if (body.password !== undefined && body.password !== '' && !validEmailPassword(body.password)) return json({ error: 'Password must be 8-128 characters.' }, 400);
    const current = await createAuth(env).api.getSession({ headers: request.headers });
    if (current && !(current.user as { isAnonymous?: boolean }).isAnonymous && current.user.email.toLowerCase() === email) {
      const player = await env.DB.prepare(`SELECT 1 present FROM players WHERE auth_user_id = ? AND account_type = 'email'`).bind(current.user.id).first();
      if (player) return json({ success: true });
    }
    const session = await anonymousSignupSession(request, env);
    if (!session) return json({ error: 'Signup session expired.' }, 401);
    const now = Date.now();
    const ipKey = await rateKey('verify-ip', clientKey);
    const [bindingAllowed, ipAllowed] = await Promise.all([
      allowed(env.SIGNUP_VERIFY_RATE, ipKey), useSignupRateLimit(env.DB, ipKey, 20, now),
    ]);
    if (!bindingAllowed || !ipAllowed) return rateLimited(15 * 60);
    const pending = await verifyStoredEmailChallenge(env, `signup:${session.user.id}`, 'signup', session.user.id, code);
    const context = pending ? JSON.parse(pending.context_json) as { available?: boolean; displayName?: string } : null;
    if (!pending || pending.email !== email || context?.available !== true || !context.displayName) return json({ error: 'Code invalid or expired.' }, 400);
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    const password = typeof body.password === 'string' && body.password ? body.password : crypto.randomUUID() + crypto.randomUUID();
    const authRequest = new Request(new URL('/api/auth/sign-up/email', url.origin), {
      method: 'POST', headers, body: JSON.stringify({ email, password, name: context.displayName }),
    });
    let response = await createAuth(env).handler(authRequest);
    if (!response.ok) {
      const linked = await env.DB.prepare(`SELECT u.id FROM user u JOIN players p ON p.auth_user_id = u.id
        WHERE u.email = ? AND p.account_type = 'email'`).bind(email).first<{ id: string }>();
      if (linked) {
        response = await createAuth(env).handler(new Request(new URL('/api/auth/sign-in/email', url.origin), {
          method: 'POST', headers, body: JSON.stringify({ email, password }),
        }));
      } else {
        const orphan = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first<{ id: string }>();
        if (orphan) await env.DB.batch([
          env.DB.prepare('DELETE FROM session WHERE userId = ?').bind(orphan.id),
          env.DB.prepare('DELETE FROM account WHERE userId = ?').bind(orphan.id),
          env.DB.prepare('DELETE FROM user WHERE id = ?').bind(orphan.id),
        ]);
      }
    }
    if (!response.ok) return json({ error: 'Code invalid or expired.' }, response.status === 429 ? 429 : 400);
    const created = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first<{ id: string }>();
    if (!created) return json({ error: 'Could not complete signup.' }, 500);
    await env.DB.batch([
      env.DB.prepare('UPDATE user SET emailVerified = 1, updatedAt = ? WHERE id = ?').bind(now, created.id),
      ...(typeof body.password === 'string' && body.password ? [] : [env.DB.prepare(`UPDATE account SET password = NULL WHERE userId = ? AND providerId = 'credential'`).bind(created.id)]),
      env.DB.prepare('DELETE FROM email_auth_challenges WHERE challenge_key = ?').bind(`signup:${session.user.id}`),
    ]);
    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ error: 'Could not verify code. Try again.' }, 500);
  }
}

async function requestEmailLogin(request: Request, env: Env, clientKey: string): Promise<Response> {
  if (!emailSignupEnabled(env)) return json({ error: 'Email login is unavailable.' }, 503);
  try {
    const body = await readJsonBody<{ email?: unknown }>(request, 1_000);
    const email = normalizeAuthEmail(body.email);
    if (!email) return json({ error: 'Enter a valid email address.' }, 400);
    const now = Date.now();
    const emailKey = await rateKey('login-email', email); const ipKey = await rateKey('login-ip', clientKey);
    const [bindingAllowed, emailAllowed, ipAllowed] = await Promise.all([allowed(env.SIGNUP_REQUEST_RATE, ipKey), useSignupRateLimit(env.DB, emailKey, 5, now), useSignupRateLimit(env.DB, ipKey, 15, now)]);
    if (!bindingAllowed || !emailAllowed || !ipAllowed) return rateLimited(15 * 60);
    const player = await env.DB.prepare(`SELECT u.id FROM user u JOIN players p ON p.auth_user_id = u.id
      WHERE u.email = ? AND p.account_type = 'email'`).bind(email).first<{ id: string }>();
    if (player) {
      try {
        const code = await storeEmailLoginOtp(env, email, now);
        await emailMailer(env)!.sendSignInCode({ email, code });
      } catch (error) {
        await env.DB.prepare('DELETE FROM verification WHERE identifier = ?').bind(`sign-in-otp-${email}`).run();
        console.error('Could not send email login code.', error);
      }
    } else await hashPassword(crypto.randomUUID());
    return json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ success: true });
  }
}

async function verifyEmailLogin(request: Request, env: Env, url: URL, clientKey: string): Promise<Response> {
  try {
    const body = await readJsonBody<{ email?: unknown; code?: unknown }>(request, 1_000);
    const email = normalizeAuthEmail(body.email); const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    if (!email || !/^\d{6}$/.test(code)) return json({ error: 'Code invalid or expired.' }, 400);
    const ipKey = await rateKey('login-verify-ip', clientKey);
    if (!await allowed(env.SIGNUP_VERIFY_RATE, ipKey) || !await useSignupRateLimit(env.DB, ipKey, 20, Date.now())) return rateLimited(15 * 60);
    const player = await env.DB.prepare(`SELECT u.id FROM user u JOIN players p ON p.auth_user_id = u.id
      WHERE u.email = ? AND p.account_type = 'email'`).bind(email).first();
    if (!player) return json({ error: 'Code invalid or expired.' }, 400);
    const headers = new Headers(request.headers); headers.set('content-type', 'application/json');
    const response = await createAuth(env).handler(new Request(new URL('/api/auth/sign-in/email-otp', url.origin), {
      method: 'POST', headers, body: JSON.stringify({ email, otp: code }),
    }));
    return response.ok ? response : json({ error: 'Code invalid or expired.' }, 400);
  } catch (error) {
    return error instanceof RequestBodyError ? json({ error: error.message }, error.status) : json({ error: 'Could not sign in.' }, 500);
  }
}

async function requestPasswordCode(request: Request, env: Env, clientKey: string): Promise<Response> {
  if (!emailSignupEnabled(env)) return json({ error: 'Password management is unavailable.' }, 503);
  try {
    const body = await readJsonBody<{ email?: unknown }>(request, 1_000);
    const email = normalizeAuthEmail(body.email);
    if (!email) return json({ error: 'Enter a valid email address.' }, 400);
    const now = Date.now(); const ipKey = await rateKey('password-ip', clientKey); const emailKey = await rateKey('password-email', email);
    const [bindingAllowed, emailAllowed, ipAllowed] = await Promise.all([allowed(env.SIGNUP_REQUEST_RATE, ipKey), useSignupRateLimit(env.DB, emailKey, 5, now), useSignupRateLimit(env.DB, ipKey, 15, now)]);
    if (!bindingAllowed || !emailAllowed || !ipAllowed) return rateLimited(15 * 60);
    const user = await env.DB.prepare(`SELECT u.id FROM user u JOIN players p ON p.auth_user_id = u.id
      WHERE u.email = ? AND p.account_type = 'email'`).bind(email).first<{ id: string }>();
    if (user) {
      const code = await storeEmailChallenge(env, `password:${user.id}`, 'password', user.id, email, user.id, {}, now);
      try { await emailMailer(env)!.sendPasswordCode({ email, code }); }
      catch { await env.DB.prepare('DELETE FROM email_auth_challenges WHERE challenge_key = ?').bind(`password:${user.id}`).run(); }
    } else await hashPassword(crypto.randomUUID());
    return json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ success: true });
  }
}

async function updateEmailPassword(request: Request, env: Env, clientKey: string): Promise<Response> {
  try {
    const body = await readJsonBody<{ email?: unknown; code?: unknown; password?: unknown; remove?: unknown }>(request, 3_000);
    const email = normalizeAuthEmail(body.email); const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    if (!email || !/^\d{6}$/.test(code)) return json({ error: 'Code invalid or expired.' }, 400);
    const ipKey = await rateKey('password-verify-ip', clientKey);
    if (!await allowed(env.SIGNUP_VERIFY_RATE, ipKey) || !await useSignupRateLimit(env.DB, ipKey, 20, Date.now())) return rateLimited(15 * 60);
    if (body.remove !== true && !validEmailPassword(body.password)) return json({ error: 'Password must be 8-128 characters.' }, 400);
    const user = await env.DB.prepare(`SELECT u.id FROM user u JOIN players p ON p.auth_user_id = u.id
      WHERE u.email = ? AND p.account_type = 'email'`).bind(email).first<{ id: string }>();
    if (!user) return json({ error: 'Code invalid or expired.' }, 400);
    const challenge = await verifyStoredEmailChallenge(env, `password:${user.id}`, 'password', user.id, code);
    if (!challenge || challenge.email !== email) return json({ error: 'Code invalid or expired.' }, 400);
    const session = await createAuth(env).api.getSession({ headers: request.headers });
    if (body.remove === true && session?.user.id !== user.id) return json({ error: 'Sign in before removing your password.' }, 401);
    const account = await env.DB.prepare(`SELECT id FROM account WHERE userId = ? AND providerId = 'credential'`).bind(user.id).first<{ id: string }>();
    if (!account) return json({ error: 'Password account is unavailable.' }, 409);
    const passwordHash = body.remove === true ? null : await hashPassword(body.password as string);
    const statements = [
      env.DB.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').bind(passwordHash, Date.now(), account.id),
      env.DB.prepare('DELETE FROM email_auth_challenges WHERE challenge_key = ?').bind(`password:${user.id}`),
    ];
    if (session?.user.id === user.id) statements.push(env.DB.prepare('DELETE FROM session WHERE userId = ? AND id != ?').bind(user.id, session.session.id));
    else statements.push(env.DB.prepare('DELETE FROM session WHERE userId = ?').bind(user.id));
    await env.DB.batch(statements);
    return json({ success: true, hasPassword: body.remove !== true });
  } catch (error) {
    return error instanceof RequestBodyError ? json({ error: error.message }, error.status) : json({ error: 'Could not update password.' }, 500);
  }
}

interface DeletionSession {
  user: { id: string; email: string; isAnonymous?: boolean };
}

async function deletionSession(request: Request, env: Env): Promise<DeletionSession | null> {
  return await createAuth(env).api.getSession({ headers: request.headers }) as DeletionSession | null;
}

function deletionMailer(env: Env): AuthMailer | undefined {
  if (env.RESEND_API_KEY) return createResendMailer(env.RESEND_API_KEY);
  if (env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')) {
    return { sendSignupCode: async () => {}, sendSignInCode: async () => {}, sendPasswordCode: async () => {}, sendDeletionCode: async () => {} };
  }
  return undefined;
}

function generateSixDigitCode(env: Env): string {
  if (env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')) return env.DEV_AUTH_EMAIL_CODE!;
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
}

async function requestAccountDeletion(request: Request, env: Env, clientKey: string): Promise<Response> {
  const session = await deletionSession(request, env);
  if (!session) return json({ error: 'Authentication required.' }, 401);
  if (session.user.isAnonymous) return json({ error: 'Guest accounts do not use email verification.' }, 400);
  const mailer = deletionMailer(env);
  if (!mailer) return json({ error: 'Account deletion email is unavailable.' }, 503);
  const now = Date.now();
  const current = await env.DB.prepare('SELECT last_sent_at FROM account_deletion_challenges WHERE user_id = ?')
    .bind(session.user.id).first<{ last_sent_at: number }>();
  if (current && now - current.last_sent_at < ACCOUNT_DELETION_RESEND_MS) return rateLimited(Math.ceil((ACCOUNT_DELETION_RESEND_MS - (now - current.last_sent_at)) / 1_000));
  const email = session.user.email.toLowerCase();
  const userKey = await rateKey('deletion-user', session.user.id);
  const emailKey = await rateKey('deletion-email', email);
  const ipKey = await rateKey('deletion-ip', clientKey);
  const [userAllowed, emailAllowed, ipAllowed] = await Promise.all([
    useSignupRateLimit(env.DB, userKey, 3, now), useSignupRateLimit(env.DB, emailKey, 3, now), useSignupRateLimit(env.DB, ipKey, 10, now),
  ]);
  if (!userAllowed || !emailAllowed || !ipAllowed) return rateLimited(15 * 60);
  const code = generateSixDigitCode(env);
  const codeHash = await accountDeletionCodeHash(env.BETTER_AUTH_SECRET, session.user.id, code);
  await env.DB.prepare(`INSERT INTO account_deletion_challenges
    (user_id, code_hash, expires_at, failed_attempts, requested_at, last_sent_at) VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      failed_attempts = 0, requested_at = excluded.requested_at, last_sent_at = excluded.last_sent_at`)
    .bind(session.user.id, codeHash, now + ACCOUNT_DELETION_TTL_MS, now, now).run();
  try {
    await mailer.sendDeletionCode({ email, code });
  } catch {
    await env.DB.prepare('DELETE FROM account_deletion_challenges WHERE user_id = ?').bind(session.user.id).run();
    return json({ error: 'Could not send deletion code. Try again.' }, 502);
  }
  return json({ success: true });
}

async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const session = await deletionSession(request, env);
  if (!session) return json({ error: 'Authentication required.' }, 401);
  if (!session.user.isAnonymous) {
    let body: { code?: unknown };
    try { body = await readJsonBody<{ code?: unknown }>(request, 1_000); }
    catch (error) { return error instanceof RequestBodyError ? json({ error: error.message }, error.status) : json({ error: 'Invalid request.' }, 400); }
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    if (!/^\d{6}$/.test(code)) return json({ error: 'Enter the six-digit code.' }, 400);
    const now = Date.now();
    const challenge = await env.DB.prepare(`SELECT code_hash, expires_at, failed_attempts FROM account_deletion_challenges WHERE user_id = ?`)
      .bind(session.user.id).first<{ code_hash: string; expires_at: number; failed_attempts: number }>();
    const candidate = await accountDeletionCodeHash(env.BETTER_AUTH_SECRET, session.user.id, code);
    const status = accountDeletionChallengeStatus(challenge, candidate, now, ACCOUNT_DELETION_MAX_ATTEMPTS);
    if (!challenge || status === 'expired' || status === 'exhausted') {
      if (challenge) await env.DB.prepare('DELETE FROM account_deletion_challenges WHERE user_id = ?').bind(session.user.id).run();
      return json({ error: 'Code invalid or expired.' }, 400);
    }
    if (status !== 'valid') {
      const attempts = challenge.failed_attempts + 1;
      if (attempts >= ACCOUNT_DELETION_MAX_ATTEMPTS) await env.DB.prepare('DELETE FROM account_deletion_challenges WHERE user_id = ?').bind(session.user.id).run();
      else await env.DB.prepare('UPDATE account_deletion_challenges SET failed_attempts = ? WHERE user_id = ?').bind(attempts, session.user.id).run();
      return json({ error: 'Code invalid or expired.' }, 400);
    }
  }
  await purgeAccountData(env.DB, session.user.id, session.user.email);
  return json({ success: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (!isAllowedRequestOrigin(origin, url.origin, env.ALLOWED_ORIGINS)) return json({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: origin ? corsHeadersForOrigin(origin) : undefined });
    return withCors(await routeRequest(request, env, url), origin);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    const cutoffDay = new Date(now - 90 * 86_400_000).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM email_signup_pending WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM email_auth_challenges WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM verification WHERE expiresAt <= ?').bind(now),
      env.DB.prepare('DELETE FROM email_signup_rate_limits WHERE window_started_at <= ?').bind(now - EMAIL_RATE_WINDOW_MS),
      env.DB.prepare('DELETE FROM account_deletion_challenges WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM email_signup_pending WHERE anonymous_user_id NOT IN (SELECT id FROM user)'),
      env.DB.prepare(`INSERT INTO analytics_daily (day, event_type, event_count)
        SELECT substr(datetime(occurred_at / 1000, 'unixepoch'), 1, 10), event_type, COUNT(*) FROM analytics_events
        WHERE is_test = 0 GROUP BY 1, 2 ON CONFLICT(day, event_type) DO UPDATE SET event_count = excluded.event_count`),
      env.DB.prepare(`DELETE FROM analytics_events WHERE substr(datetime(occurred_at / 1000, 'unixepoch'), 1, 10) < ?`).bind(cutoffDay),
      env.DB.prepare(`DELETE FROM whiteboard_archive WHERE substr(datetime(occurred_at / 1000, 'unixepoch'), 1, 10) < ?`).bind(cutoffDay),
    ]);
    const orphans = await env.DB.prepare(`SELECT auth_user_id FROM players
      WHERE auth_user_id IS NOT NULL AND auth_user_id NOT IN (SELECT id FROM user) LIMIT 100`)
      .all<{ auth_user_id: string }>();
    for (const orphan of orphans.results) await purgeAccountData(env.DB, orphan.auth_user_id, undefined, now);
  },
} satisfies ExportedHandler<Env>;

async function routeRequest(request: Request, env: Env, url: URL): Promise<Response> {
    const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown-client';
    if (url.pathname === '/admin/auth/google' && request.method === 'GET') return beginAdminGoogleLogin(request, env, url);
    if (url.pathname.startsWith('/admin/api/')) return adminRoute(request, env as never, url);
    if (url.pathname === '/maintenance-status' && request.method === 'GET') {
      const access = await maintenanceAccess(request, env); return json({ enabled: access.state.enabled, bypassed: access.bypassed,
        passExpiresAt: access.bypassed ? maintenancePassExpiry(maintenanceCookie(request)) : null });
    }
    if (!maintenanceExempt(url.pathname)) {
      const access = await maintenanceAccess(request, env);
      if (access.state.enabled && !access.bypassed) return maintenanceResponse();
    }
    if (url.pathname === '/analytics/events' && request.method === 'POST') return ingestAnalytics(request, env);
    if (url.pathname === '/account-deletion/request' && request.method === 'POST') return requestAccountDeletion(request, env, clientKey);
    if (url.pathname === '/account-deletion' && request.method === 'DELETE') return deleteAccount(request, env);
    if (url.pathname === '/email-signup/request' && request.method === 'POST') return requestEmailSignup(request, env, clientKey);
    if (url.pathname === '/email-signup/verify' && request.method === 'POST') return verifyEmailSignup(request, env, url, clientKey);
    if (url.pathname === '/email-login/request' && request.method === 'POST') return requestEmailLogin(request, env, clientKey);
    if (url.pathname === '/email-login/verify' && request.method === 'POST') return verifyEmailLogin(request, env, url, clientKey);
    if (url.pathname === '/email-password/request' && request.method === 'POST') return requestPasswordCode(request, env, clientKey);
    if (url.pathname === '/email-password/update' && request.method === 'POST') return updateEmailPassword(request, env, clientKey);
    const blockedAuthPaths = new Set(['/api/auth/sign-up/email', '/api/auth/sign-in/email-otp',
      '/api/auth/request-password-reset', '/api/auth/reset-password', '/api/auth/change-password', '/api/auth/set-password', '/api/auth/change-email',
      '/api/auth/link-social', '/api/auth/unlink-account']);
    if (blockedAuthPaths.has(url.pathname) || url.pathname.startsWith('/api/auth/email-otp/')) return json({ error: 'Use the game account flow.' }, 404);
    if (url.pathname.startsWith('/api/auth/')) return createAuth(env).handler(request);
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/auth-capabilities') return json({
      emailSignup: emailSignupEnabled(env), emailCodeLogin: emailSignupEnabled(env), password: emailSignupEnabled(env),
    });
    if (url.pathname === '/online-status') {
      if (!await allowed(env.SOCKET_RATE, `status:${clientKey}`)) return rateLimited();
      return json({ playersOnline: await env.LOBBY.getByName('global').getOnlinePlayerCount() });
    }
    if (url.pathname === '/account-method') return json({ error: 'Account types are fixed.' }, 404);
    if (url.pathname === '/player-session') {
      try {
        const authSession = await createAuth(env).api.getSession({ headers: request.headers });
        if (!authSession) return json({ error: 'Authentication required.' }, 401);
        if (request.method === 'POST') {
          const body = await readJsonBody<{ displayName?: unknown }>(request, 1_000);
          const displayName = normalizePlayerDisplayName(body.displayName);
          if (!displayName) return json({ error: `Display name must be 1-${PLAYER_NAME_MAX_LENGTH} characters.` }, 400);
          const now = Date.now();
          let created = await env.DB.prepare('SELECT player_id FROM players WHERE auth_user_id = ?').bind(authSession.user.id).first<{ player_id: string }>();
          if (!created) {
            const accountType = await accountTypeForSession(env.DB, authSession.user.id, Boolean((authSession.user as { isAnonymous?: boolean }).isAnonymous));
            const newPlayerId = await createPlayerRow(env, authSession.user.id, displayName, accountType);
            if (await requestHasTesterPass(request, env)) {
              await env.DB.prepare('INSERT OR IGNORE INTO test_players (player_id, created_at) VALUES (?, ?)').bind(newPlayerId, now).run();
            }
            created = { player_id: newPlayerId };
          }
          if (created) await recordEvent(env.DB, `account:${created.player_id}:${(authSession.user as { isAnonymous?: boolean }).isAnonymous ? 'guest' : 'protected'}`,
            (authSession.user as { isAnonymous?: boolean }).isAnonymous ? 'guest-created' : 'protected-account', now, undefined, undefined, created.player_id);
        } else if (request.method === 'PUT') {
          const body = await readJsonBody<{ displayName?: unknown }>(request, 1_000);
          const displayName = normalizePlayerDisplayName(body.displayName);
          if (!displayName) return json({ error: `Display name must be 1-${PLAYER_NAME_MAX_LENGTH} characters.` }, 400);
          await env.DB.prepare('UPDATE players SET display_name = ?, updated_at = ? WHERE auth_user_id = ?')
            .bind(displayName, Date.now(), authSession.user.id).run();
        } else if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
        const player = await env.DB.prepare(`SELECT p.player_id, p.display_name, p.rating, p.total_progress_units, p.unlock_all_classes, p.account_type,
          CASE WHEN EXISTS (SELECT 1 FROM account a WHERE a.userId = p.auth_user_id AND a.providerId = 'credential' AND a.password IS NOT NULL) THEN 1 ELSE 0 END has_password
          FROM players p WHERE p.auth_user_id = ?`)
          .bind(authSession.user.id).first<{ player_id: string; display_name: string; rating: number; total_progress_units: number; unlock_all_classes: number; account_type: PlayerAccountType; has_password: number }>();
        if (!player) return json({ error: 'Player not found.' }, 404);
        return json({ ...playerProfile(player.player_id, player.account_type, player.display_name, player.rating, player.total_progress_units, player.unlock_all_classes === 1),
          email: player.account_type === 'email' ? authSession.user.email : undefined,
          hasPassword: player.account_type === 'email' && player.has_password === 1 });
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        return json({ error: 'Player session failed.' }, 500);
      }
    }
    if (url.pathname === '/player-progression' && request.method === 'PUT') {
      try {
        const authSession = await createAuth(env).api.getSession({ headers: request.headers });
        if (!authSession) return json({ error: 'Authentication required.' }, 401);
        const body = await readJsonBody<{ unlockAllClasses?: unknown }>(request, 1_000);
        if (typeof body.unlockAllClasses !== 'boolean') return json({ error: 'unlockAllClasses must be a boolean.' }, 400);
        await env.DB.prepare('UPDATE players SET unlock_all_classes = ?, updated_at = ? WHERE auth_user_id = ?')
          .bind(body.unlockAllClasses ? 1 : 0, Date.now(), authSession.user.id).run();
        const player = await env.DB.prepare('SELECT player_id, display_name, rating, total_progress_units, unlock_all_classes, account_type FROM players WHERE auth_user_id = ?')
          .bind(authSession.user.id).first<{ player_id: string; display_name: string; rating: number; total_progress_units: number; unlock_all_classes: number; account_type: PlayerAccountType }>();
        if (!player) return json({ error: 'Player not found.' }, 404);
        return json(playerProfile(player.player_id, player.account_type, player.display_name, player.rating, player.total_progress_units, player.unlock_all_classes === 1));
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        return json({ error: 'Progression update failed.' }, 500);
      }
    }
    if (url.pathname === '/local-match-grant' && request.method === 'POST') {
      try {
        const body = await readJsonBody<{ kind?: unknown }>(request, 1_000);
        if (body.kind !== 'tutorial' && body.kind !== 'computer') return json({ error: 'Unknown local match kind.' }, 400);
        const player = await authenticateRequestPlayer(request, env);
        const now = Date.now();
        const current = await env.DB.prepare('SELECT grant_id, kind, issued_at, expires_at, claimed_at FROM local_match_grants WHERE player_id = ?')
          .bind(player.playerId).first<{ grant_id: string; kind: LocalMatchKind; issued_at: number; expires_at: number; claimed_at: number | null }>();
        if (current && current.kind === body.kind && current.claimed_at === null && now - current.issued_at < LOCAL_MATCH_GRANT_DEBOUNCE_MS) {
          return json({ receipt: current.grant_id, kind: current.kind, issuedAt: current.issued_at, expiresAt: current.expires_at } satisfies LocalMatchGrant);
        }
        const grant: LocalMatchGrant = { receipt: crypto.randomUUID(), kind: body.kind, issuedAt: now, expiresAt: now + LOCAL_MATCH_GRANT_TTL_MS };
        await env.DB.prepare(`INSERT INTO local_match_grants (player_id, grant_id, kind, issued_at, expires_at, claimed_at)
          VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(player_id) DO UPDATE SET grant_id = excluded.grant_id,
          kind = excluded.kind, issued_at = excluded.issued_at, expires_at = excluded.expires_at, claimed_at = NULL`)
          .bind(player.playerId, grant.receipt, grant.kind, grant.issuedAt, grant.expiresAt).run();
        return json(grant, 201);
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        if (error instanceof GuestAuthError) return json({ error: error.message }, 401);
        return json({ error: 'Local match could not start.' }, 500);
      }
    }
    if (url.pathname === '/local-progress-award' && request.method === 'POST') {
      try {
        const body = await readJsonBody<{ receipt?: unknown; kind?: unknown; outcome?: unknown; roundWinningClassIds?: unknown }>(request, 4_000);
        if (!validClientId(body.receipt)) return json({ error: 'receipt is required.' }, 400);
        if (body.kind !== 'tutorial' && body.kind !== 'computer') return json({ error: 'Unknown local award kind.' }, 400);
        if (body.outcome !== 'win' && body.outcome !== 'loss') return json({ error: 'Unknown progress outcome.' }, 400);
        const roundWinningClassIds = body.roundWinningClassIds ?? [];
        if (!Array.isArray(roundWinningClassIds) || roundWinningClassIds.length > 2
          || !roundWinningClassIds.every((classId): classId is AbmClassId => typeof classId === 'string' && (ABM_CLASS_IDS as readonly string[]).includes(classId))) {
          return json({ error: 'Invalid round-winning classes.' }, 400);
        }
        const player = await authenticateRequestPlayer(request, env);
        const stored = await env.DB.prepare('SELECT player_id, kind, award_json FROM local_progress_awards WHERE result_id = ?').bind(body.receipt)
          .first<{ player_id: string; kind: LocalMatchKind; award_json: string }>();
        if (stored) {
          if (stored.player_id !== player.playerId) return json({ error: 'Receipt belongs to another player.' }, 403);
          if (stored.kind !== body.kind) return json({ error: 'Receipt kind does not match.' }, 409);
          return json(JSON.parse(stored.award_json));
        }
        const grant = await env.DB.prepare('SELECT player_id, kind, issued_at, expires_at, claimed_at FROM local_match_grants WHERE grant_id = ?').bind(body.receipt)
          .first<{ player_id: string; kind: LocalMatchKind; issued_at: number; expires_at: number; claimed_at: number | null }>();
        const now = Date.now();
        const problem = localMatchGrantProblem(grant ? {
          playerId: grant.player_id, kind: grant.kind, issuedAt: grant.issued_at, expiresAt: grant.expires_at, claimedAt: grant.claimed_at,
        } : undefined, player.playerId, body.kind, now);
        if (problem === 'unknown') return json({ error: 'Unknown or superseded receipt.' }, 404);
        if (problem === 'wrong-player') return json({ error: 'Receipt belongs to another player.' }, 403);
        if (problem === 'wrong-kind') return json({ error: 'Receipt kind does not match.' }, 409);
        if (problem === 'premature') return json({ error: 'Match finished too quickly.' }, 409);
        if (problem === 'expired') return json({ error: 'Receipt expired.' }, 410);
        if (problem === 'claimed') return json({ error: 'Receipt already claimed.' }, 409);
        let fullReward: boolean;
        let award: ProgressAward;
        if (body.kind === 'tutorial') {
          const previous = await env.DB.prepare(`SELECT 1 AS present FROM local_progress_awards
            WHERE player_id = ? AND kind = 'tutorial' LIMIT 1`).bind(player.playerId).first<{ present: number }>();
          const firstCompletion = !previous;
          fullReward = firstCompletion;
          award = createTutorialProgressAward(player.totalProgressUnits, body.outcome, firstCompletion);
        } else {
          const recent = await env.DB.prepare(`SELECT COUNT(*) AS count FROM local_progress_awards
            WHERE player_id = ? AND kind = ? AND full_reward = 1 AND created_at > ?`)
            .bind(player.playerId, body.kind, now - LOCAL_MATCH_AWARD_WINDOW_MS).first<{ count: number }>();
          fullReward = hasFullLocalMatchAwardAllowance(recent?.count ?? 0);
          award = !fullReward ? createTokenProgressAward(player.totalProgressUnits, body.outcome, player.unlockAllClasses)
            : createProgressAward(player.totalProgressUnits, body.outcome, {
              opponent: 'computer', newestClassRoundWins: countNewestClassRoundWins(player.totalProgressUnits, roundWinningClassIds), paused: player.unlockAllClasses,
            });
        }
        const applied = await applyLocalProgressAward(env.DB, player.playerId, body.receipt, body.kind, award, fullReward, now);
        await recordEvent(env.DB, `local-match:${body.receipt}`, body.kind === 'tutorial' ? 'tutorial-match' : 'computer-match', now,
          undefined, undefined, player.playerId, { outcome: body.outcome });
        return json(applied);
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        if (error instanceof GuestAuthError) return json({ error: error.message }, 401);
        if (error instanceof LocalProgressAwardConflictError) return json({ error: 'Result ID belongs to another player.' }, 409);
        return json({ error: 'Progress award failed.' }, 500);
      }
    }
    if (url.pathname === '/matchmaking' && request.method === 'POST') {
      try {
        if (!await allowed(env.MATCHMAKING_IP_RATE, clientKey)) return rateLimited();
        const body = await readJsonBody<{ attemptId?: string }>(request);
        if (!validClientId(body.attemptId)) return json({ error: 'attemptId is required.' }, 400);
        const player = await authenticateRequestPlayer(request, env);
        if (!await allowed(env.MATCHMAKING_GUEST_RATE, player.playerId)) return rateLimited();
        return json(await env.MATCHMAKER.getByName('global').enqueue(player.playerId, body.attemptId));
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        return json({ error: error instanceof Error ? error.message : 'Matchmaking failed.' }, 401);
      }
    }
    if (url.pathname === '/matchmaking' && request.method === 'DELETE') {
      try {
        if (!await allowed(env.MATCHMAKING_IP_RATE, clientKey)) return rateLimited();
        const body = await readJsonBody<{ attemptId?: string }>(request);
        if (!validClientId(body.attemptId)) return json({ error: 'attemptId is required.' }, 400);
        const player = await authenticateRequestPlayer(request, env);
        if (!await allowed(env.MATCHMAKING_GUEST_RATE, player.playerId)) return rateLimited();
        await env.MATCHMAKER.getByName('global').cancel(player.playerId, body.attemptId);
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
      if (!await allowed(env.SOCKET_RATE, `guest:${clientKey}`)) return rateLimited();
      return url.pathname === '/lobby' ? env.LOBBY.getByName('global').fetch(request) : env.WHITEBOARD.getByName('global').fetch(request);
    }
    return json({ error: 'Not found.' }, 404);
}

async function beginAdminGoogleLogin(request: Request, env: Env, url: URL): Promise<Response> {
  const callback = url.searchParams.get('callback');
  if (!callback) return json({ error: 'Missing callback.' }, 400);
  let callbackUrl: URL;
  try { callbackUrl = new URL(callback); } catch { return json({ error: 'Invalid callback.' }, 400); }
  const allowedCallbacks = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://abm.jpconan.ca']);
  if (!allowedCallbacks.has(callbackUrl.origin) || callbackUrl.pathname !== '/admin') return json({ error: 'Invalid callback.' }, 400);
  const headers = new Headers(request.headers); headers.set('content-type', 'application/json');
  const authRequest = new Request(`${url.origin}/api/auth/sign-in/social`, { method: 'POST', headers,
    body: JSON.stringify({ provider: 'google', callbackURL: callbackUrl.toString(), errorCallbackURL: callbackUrl.toString(), disableRedirect: true }) });
  const response = await createAuth(env).handler(authRequest);
  const payload = await response.clone().json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !payload.url) return json({ error: payload.error ?? 'Google sign-in could not start.' }, response.status || 500);
  const redirectHeaders = new Headers(); redirectHeaders.set('location', payload.url);
  const cookie = response.headers.get('set-cookie'); if (cookie) redirectHeaders.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers: redirectHeaders });
}

function maintenanceExempt(pathname: string): boolean {
  return pathname === '/health' || pathname === '/api/auth/sign-out' || pathname === '/api/auth/callback/google';
}

async function maintenanceAccess(request: Request, env: Env): Promise<{ state: Awaited<ReturnType<typeof readMaintenanceState>>; bypassed: boolean }> {
  const state = await readMaintenanceState(env.DB);
  const bypassed = state.enabled && await verifyMaintenancePass(env.BETTER_AUTH_SECRET, maintenanceCookie(request), state.version);
  return { state, bypassed };
}

async function requestHasTesterPass(request: Request, env: Env): Promise<boolean> { return (await maintenanceAccess(request, env)).bypassed; }
function maintenanceResponse(): Response { return Response.json({ error: 'Maintenance in progress.', code: 'maintenance' }, {
  status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' },
}); }

const PUBLIC_ANALYTICS_EVENTS = new Set(['title-view', 'lobby-enter']);
async function ingestAnalytics(request: Request, env: Env): Promise<Response> {
  try {
    const body = await readJsonBody<{ eventId?: unknown; eventType?: unknown; browserId?: unknown; visitId?: unknown }>(request, 2_000);
    if (!validClientId(body.eventId) || !validClientId(body.browserId) || !validClientId(body.visitId)
      || typeof body.eventType !== 'string' || !PUBLIC_ANALYTICS_EVENTS.has(body.eventType)) return json({ error: 'Invalid analytics event.' }, 400);
    let playerId: string | undefined;
    if (body.eventType === 'lobby-enter') playerId = (await authenticateRequestPlayer(request, env)).playerId;
    await recordEvent(env.DB, body.eventId, body.eventType, Date.now(), body.browserId, body.visitId, playerId, {}, await requestHasTesterPass(request, env));
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    if (error instanceof GuestAuthError) return json({ error: error.message }, 401);
    return json({ error: 'Analytics event failed.' }, 500);
  }
}

async function recordEvent(db: D1Database, eventId: string, eventType: string, occurredAt: number, browserId?: string,
  visitId?: string, playerId?: string, metadata: object = {}, forcedTest?: boolean): Promise<void> {
  const test = forcedTest ?? (playerId ? Boolean(await db.prepare('SELECT 1 present FROM test_players WHERE player_id = ?').bind(playerId).first()) : false);
  await db.prepare(`INSERT OR IGNORE INTO analytics_events
    (event_id, event_type, occurred_at, browser_id, visit_id, player_id, metadata_json, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(eventId, eventType, occurredAt, browserId ?? null, visitId ?? null, playerId ?? null, JSON.stringify(metadata), test ? 1 : 0).run();
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
  if (!result.allowed) {
    socket.close(1008, 'Message rate limit exceeded.');
    return false;
  }
  socket.serializeAttachment(attachment); return true;
}

async function allowed(limiter: RateLimit, key: string): Promise<boolean> {
  return (await limiter.limit({ key })).success;
}

function rateLimited(retryAfterSeconds = 60): Response {
  return Response.json({ error: 'Too many requests.' }, {
    status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(retryAfterSeconds) },
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
