import { createAuth, type AuthEnv } from './auth';
import { isAllowedAdminEmail } from '../src/core/adminAccess';
import { createMaintenancePass, maintenanceSetCookie, readMaintenanceState, rotateMaintenanceVersion, setMaintenanceState } from './maintenance';

interface AdminEnv extends AuthEnv {
  DB: D1Database;
  ADMIN_EMAILS?: string;
  LOBBY: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
  WHITEBOARD: DurableObjectNamespace;
}

export async function adminRoute(request: Request, env: AdminEnv, url: URL): Promise<Response> {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session) return result({ error: 'Authentication required.' }, 401);
  if ((session.user as { isAnonymous?: boolean }).isAnonymous || !isAllowedAdminEmail(session.user.email, env.ADMIN_EMAILS)) {
    return result({ error: 'Admin access required.' }, 403);
  }
  if (url.pathname === '/admin/api/session') return result({ email: session.user.email });
  if (url.pathname === '/admin/api/maintenance') {
    if (request.method === 'GET') return result(await readMaintenanceState(env.DB));
    if (request.method !== 'POST') return result({ error: 'Method not allowed.' }, 405);
    const body = await request.json().catch(() => ({})) as { action?: unknown; enabled?: unknown };
    if (body.action === 'set' && typeof body.enabled === 'boolean') return result(await setMaintenanceState(env.DB, body.enabled, session.user.email));
    if (body.action === 'revoke') return result(await rotateMaintenanceVersion(env.DB, session.user.email));
    if (body.action === 'grant') {
      const state = await readMaintenanceState(env.DB); const pass = await createMaintenancePass(env.BETTER_AUTH_SECRET, state.version);
      const response = result({ ...state, passExpiresAt: pass.expiresAt });
      response.headers.append('set-cookie', maintenanceSetCookie(pass.token, url.protocol === 'https:')); return response;
    }
    return result({ error: 'Invalid maintenance action.' }, 400);
  }
  if (url.pathname === '/admin/api/overview') return overview(env.DB, rangeDays(url));
  if (url.pathname === '/admin/api/live') {
    const [lobby, queue, whiteboard] = await Promise.all([
      adminStub(env.LOBBY).getAdminSnapshot(),
      adminStub(env.MATCHMAKER).getAdminSnapshot(),
      adminStub(env.WHITEBOARD).getAdminSnapshot(),
    ]);
    return result({ lobby, queue, whiteboard, refreshedAt: Date.now() });
  }
  if (url.pathname === '/admin/api/accounts') return accounts(env.DB, url);
  if (url.pathname === '/admin/api/matches') return matches(env.DB, url);
  if (url.pathname === '/admin/api/whiteboard') return whiteboardHistory(env.DB, url);
  return result({ error: 'Not found.' }, 404);
}

async function overview(db: D1Database, days: number): Promise<Response> {
  const since = Date.now() - days * 86_400_000;
  const events = await db.prepare(`SELECT event_type, COUNT(*) count FROM analytics_events WHERE occurred_at >= ? AND is_test = 0 GROUP BY event_type`)
    .bind(since).all<{ event_type: string; count: number }>();
  const counts = Object.fromEntries(events.results.map((row) => [row.event_type, row.count]));
  const unique = await db.prepare(`SELECT COUNT(DISTINCT browser_id) count FROM analytics_events
    WHERE occurred_at >= ? AND event_type = 'title-view' AND browser_id IS NOT NULL AND is_test = 0`).bind(since).first<{ count: number }>();
  const bounces = await db.prepare(`SELECT COUNT(*) count FROM analytics_events views WHERE views.event_type = 'title-view'
    AND views.is_test = 0 AND views.occurred_at BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM analytics_events entered
      WHERE entered.event_type = 'lobby-enter' AND entered.visit_id = views.visit_id)`).bind(since, Date.now() - 30_000).first<{ count: number }>();
  const accounts = await db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN p.account_type = 'guest' THEN 1 ELSE 0 END) guests,
    SUM(CASE WHEN p.account_type <> 'guest' THEN 1 ELSE 0 END) protected
    FROM user u JOIN players p ON p.auth_user_id = u.id LEFT JOIN test_players t ON t.player_id = p.player_id WHERE t.player_id IS NULL`).first<{ total: number; guests: number; protected: number }>();
  const online = await db.prepare(`SELECT COUNT(*) count FROM match_results m WHERE completed_at >= ? AND NOT EXISTS
    (SELECT 1 FROM test_players t WHERE t.player_id = m.p1_id OR t.player_id = m.p2_id)`).bind(since).first<{ count: number }>();
  const local = await db.prepare(`SELECT a.kind, COUNT(*) count FROM local_progress_awards a LEFT JOIN test_players t ON t.player_id = a.player_id
    WHERE a.created_at >= ? AND t.player_id IS NULL GROUP BY a.kind`)
    .bind(since).all<{ kind: string; count: number }>();
  const attempts = await db.prepare(`SELECT a.started_at, a.ended_at, a.outcome FROM matchmaking_attempts a LEFT JOIN test_players t ON t.player_id = a.player_id
    WHERE a.started_at >= ? AND t.player_id IS NULL`)
    .bind(since).all<{ started_at: number; ended_at: number | null; outcome: string | null }>();
  const waits = attempts.results.filter((row) => row.ended_at !== null).map((row) => row.ended_at! - row.started_at).sort((a, b) => a - b);
  const daily = await db.prepare(`SELECT substr(datetime(occurred_at / 1000, 'unixepoch'), 1, 10) day, event_type, COUNT(*) count
    FROM analytics_events WHERE occurred_at >= ? AND is_test = 0 GROUP BY day, event_type ORDER BY day`).bind(since)
    .all<{ day: string; event_type: string; count: number }>();
  const visits = counts['title-view'] ?? 0;
  const protectedCount = accounts?.protected ?? 0;
  return result({ days, counts, uniqueVisitors: unique?.count ?? 0, bounces: bounces?.count ?? 0,
    bounceRate: visits ? (bounces?.count ?? 0) / visits : 0, accounts: accounts ?? { total: 0, guests: 0, protected: 0 },
    conversionRate: (accounts?.total ?? 0) ? protectedCount / accounts!.total : 0,
    matches: { online: online?.count ?? 0, ...Object.fromEntries(local.results.map((row) => [row.kind, row.count])) },
    queue: { attempts: attempts.results.length, averageMs: average(waits), medianMs: percentile(waits, .5), p95Ms: percentile(waits, .95),
      outcomes: countValues(attempts.results.map((row) => row.outcome ?? 'waiting')) }, daily: daily.results });
}

async function accounts(db: D1Database, url: URL): Promise<Response> {
  const page = pageNumber(url); const search = (url.searchParams.get('search') ?? '').slice(0, 100); const like = `%${search}%`;
  const rows = await db.prepare(`SELECT u.createdAt createdAt,
    CASE WHEN p.account_type = 'email' THEN u.email ELSE NULL END email, p.account_type accountType,
    p.player_id playerId, p.display_name displayName, p.rating, p.updated_at lastActivity, CASE WHEN t.player_id IS NULL THEN 0 ELSE 1 END isTest,
    (SELECT COUNT(*) FROM match_results m WHERE m.p1_id = p.player_id OR m.p2_id = p.player_id) matches
    FROM user u LEFT JOIN players p ON p.auth_user_id = u.id LEFT JOIN test_players t ON t.player_id = p.player_id
    WHERE (? = '' OR u.email LIKE ? OR p.display_name LIKE ? OR p.player_id LIKE ?) ORDER BY u.createdAt DESC LIMIT 50 OFFSET ?`)
    .bind(search, like, like, like, page * 50).all();
  const totals = await db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN p.account_type = 'guest' THEN 1 ELSE 0 END) guests,
    SUM(CASE WHEN p.account_type <> 'guest' THEN 1 ELSE 0 END) protected FROM user u JOIN players p ON p.auth_user_id = u.id
    LEFT JOIN test_players t ON t.player_id = p.player_id WHERE t.player_id IS NULL`).first();
  return result({ rows: rows.results, totals, page });
}

async function matches(db: D1Database, url: URL): Promise<Response> {
  const page = pageNumber(url);
  const rows = await db.prepare(`SELECT m.match_id matchId, m.completed_at completedAt, m.winner_id winnerId, m.summary_json summary,
    m.p1_id p1Id, m.p2_id p2Id, MIN(a.started_at) startedAt,
    CASE WHEN t1.player_id IS NOT NULL OR t2.player_id IS NOT NULL THEN 1 ELSE 0 END isTest,
    p1.display_name p1Name, u1.email p1Email, p2.display_name p2Name, u2.email p2Email
    FROM match_results m JOIN players p1 ON p1.player_id = m.p1_id JOIN players p2 ON p2.player_id = m.p2_id
    LEFT JOIN user u1 ON u1.id = p1.auth_user_id LEFT JOIN user u2 ON u2.id = p2.auth_user_id
    LEFT JOIN test_players t1 ON t1.player_id = m.p1_id LEFT JOIN test_players t2 ON t2.player_id = m.p2_id
    LEFT JOIN matchmaking_attempts a ON a.match_id = m.match_id GROUP BY m.match_id
    ORDER BY m.completed_at DESC LIMIT 50 OFFSET ?`).bind(page * 50).all();
  const local = await db.prepare(`SELECT a.kind, COUNT(*) count, CASE WHEN t.player_id IS NULL THEN 0 ELSE 1 END isTest
    FROM local_progress_awards a LEFT JOIN test_players t ON t.player_id = a.player_id GROUP BY a.kind, isTest`).all();
  return result({ rows: rows.results, local: local.results, page });
}

async function whiteboardHistory(db: D1Database, url: URL): Promise<Response> {
  const page = pageNumber(url); const player = (url.searchParams.get('player') ?? '').slice(0, 100);
  const from = boundedTimestamp(url.searchParams.get('from'), 0); const to = boundedTimestamp(url.searchParams.get('to'), Date.now());
  const rows = await db.prepare(`SELECT w.operation_id operationId, w.sequence, w.occurred_at occurredAt, w.player_id playerId,
    w.display_name displayName, w.account_type accountType, w.operation_json operationJson, w.is_test isTest, u.email
    FROM whiteboard_archive w LEFT JOIN players p ON p.player_id = w.player_id LEFT JOIN user u ON u.id = p.auth_user_id
    WHERE (? = '' OR w.player_id = ?) AND w.occurred_at BETWEEN ? AND ? ORDER BY w.sequence ASC LIMIT 500 OFFSET ?`)
    .bind(player, player, from, to, page * 500).all();
  return result({ rows: rows.results.map((row) => ({ ...row, operation: JSON.parse(String(row.operationJson)) })), page });
}

function rangeDays(url: URL): number { const value = Number(url.searchParams.get('days') ?? 30); return value === 7 || value === 90 ? value : 30; }
function pageNumber(url: URL): number { return Math.max(0, Math.min(10_000, Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0)); }
function boundedTimestamp(value: string | null, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function average(values: number[]): number { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function percentile(values: number[], fraction: number): number { return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]! : 0; }
function countValues(values: string[]): Record<string, number> { return values.reduce<Record<string, number>>((all, value) => ({ ...all, [value]: (all[value] ?? 0) + 1 }), {}); }
function result(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { 'cache-control': 'no-store' } }); }
function adminStub(namespace: DurableObjectNamespace): { getAdminSnapshot(): Promise<unknown> } {
  return namespace.getByName('global') as unknown as { getAdminSnapshot(): Promise<unknown> };
}
