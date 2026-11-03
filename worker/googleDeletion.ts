import type { AuthEnv } from './auth';
import type { D1Database } from '@cloudflare/workers-types';

interface Env extends AuthEnv { DB: D1Database }
interface Session { user: { id: string }; session: { id: string } }
const ttl = 10 * 60_000;

const callbackUrl = (env: Env) => new URL('/account-deletion/google/callback', env.BETTER_AUTH_URL).toString();
const returnToPopup = (origin: string, nonce: string, result: 'success' | 'error') => {
  const url = new URL('/auth-complete.html', origin);
  url.searchParams.set('nonce', nonce); url.searchParams.set('result', result);
  return Response.redirect(url.toString(), 302);
};

export async function beginGoogleDeletion(env: Env, session: Session, nonce: string, returnOrigin: string): Promise<string> {
  const state = crypto.randomUUID();
  await env.DB.prepare('DELETE FROM google_deletion_confirmations WHERE session_id = ?').bind(session.session.id).run();
  await env.DB.prepare(`INSERT INTO google_deletion_confirmations (state, user_id, session_id, nonce, return_origin, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(state, session.user.id, session.session.id, nonce, returnOrigin, Date.now() + ttl).run();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('max_age', '0');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function finishGoogleDeletion(env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get('state') ?? '';
  const row = await env.DB.prepare(`SELECT user_id, session_id, nonce, return_origin, expires_at, verified_at
    FROM google_deletion_confirmations WHERE state = ?`).bind(state)
    .first<{ user_id: string; session_id: string; nonce: string; return_origin: string; expires_at: number; verified_at: number | null }>();
  if (!row) return new Response('Confirmation expired.', { status: 400 });
  const fail = async () => {
    await env.DB.prepare('DELETE FROM google_deletion_confirmations WHERE state = ?').bind(state).run();
    return returnToPopup(row.return_origin, row.nonce, 'error');
  };
  const code = url.searchParams.get('code');
  if (!code || row.expires_at <= Date.now() || row.verified_at !== null) return fail();
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl(env), grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) return fail();
    const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) return fail();
    const identityResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!identityResponse.ok) return fail();
    const identity = await identityResponse.json() as { sub?: string };
    const account = await env.DB.prepare(`SELECT accountId FROM account WHERE userId = ? AND providerId = 'google'`)
      .bind(row.user_id).first<{ accountId: string }>();
    const active = await env.DB.prepare('SELECT id FROM session WHERE id = ? AND userId = ? AND expiresAt > ?')
      .bind(row.session_id, row.user_id, Date.now()).first();
    if (!active || !account || !identity.sub || identity.sub !== account.accountId) return fail();
    const updated = await env.DB.prepare(`UPDATE google_deletion_confirmations SET verified_at = ?
      WHERE state = ? AND verified_at IS NULL AND expires_at > ?`).bind(Date.now(), state, Date.now()).run();
    if (!updated.meta.changes) return fail();
    return returnToPopup(row.return_origin, row.nonce, 'success');
  } catch { return fail(); }
}

export async function consumeGoogleDeletion(env: Env, session: Session): Promise<boolean> {
  const [consumed] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM google_deletion_confirmations WHERE session_id = ? AND user_id = ?
      AND verified_at IS NOT NULL AND expires_at > ? RETURNING state`).bind(session.session.id, session.user.id, Date.now()),
    env.DB.prepare('DELETE FROM google_deletion_confirmations WHERE session_id = ?').bind(session.session.id),
  ]);
  return Boolean(consumed?.results.length);
}
