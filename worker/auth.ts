import { betterAuth } from 'better-auth';
import { anonymous, emailOTP } from 'better-auth/plugins';
import { createResendMailer, type AuthMailer } from './resendMailer';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY?: string;
  DEV_AUTH_EMAIL_CODE?: string;
}

export type { AuthMailer } from './resendMailer';

async function anonymizePlayer(db: D1Database, authUserId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM local_match_grants WHERE player_id IN (SELECT player_id FROM players WHERE auth_user_id = ?)').bind(authUserId),
    db.prepare('DELETE FROM local_progress_awards WHERE player_id IN (SELECT player_id FROM players WHERE auth_user_id = ?)').bind(authUserId),
    db.prepare(`DELETE FROM players WHERE auth_user_id = ? AND NOT EXISTS (
      SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id
    )`).bind(authUserId),
    db.prepare(`UPDATE players SET display_name = 'Deleted player', auth_user_id = NULL,
      rating = 1500, total_progress_units = 0, unlock_all_classes = 0, updated_at = ? WHERE auth_user_id = ?`)
      .bind(Date.now(), authUserId),
  ]);
}

export function createAuth(env: AuthEnv, mailer: AuthMailer | undefined = env.RESEND_API_KEY
  ? createResendMailer(env.RESEND_API_KEY)
  : env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')
    ? { sendSignInCode: async () => {} }
    : undefined) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: ['http://localhost:5173', 'http://localhost:8787', 'https://abm.jpconan.ca'],
    advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://') },
    session: { freshAge: 5 * 60 },
    account: { encryptOAuthTokens: true, accountLinking: { disableImplicitLinking: true } },
    emailAndPassword: { enabled: false },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => anonymizePlayer(env.DB, user.id),
      },
    },
    databaseHooks: {
      user: { delete: { before: async (user) => { await anonymizePlayer(env.DB, user.id); } } },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ['openid', 'email', 'profile'],
      },
    },
    plugins: [emailOTP({
      expiresIn: 10 * 60,
      otpLength: 6,
      allowedAttempts: 3,
      storeOTP: 'hashed',
      resendStrategy: 'rotate',
      disableSignUp: false,
      generateOTP: env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')
        ? () => env.DEV_AUTH_EMAIL_CODE
        : undefined,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (!mailer || type !== 'sign-in') throw new Error('Email signup is unavailable.');
        await mailer.sendSignInCode({ email, code: otp });
      },
    }), anonymous({
      generateName: () => 'Guest',
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const anonymousId = anonymousUser.user.id;
        const newId = newUser.user.id;
        const target = await env.DB.prepare('SELECT player_id FROM players WHERE auth_user_id = ?').bind(newId)
          .first<{ player_id: string }>();
        const pending = await env.DB.prepare(`SELECT terms_version, privacy_version, accepted_at
          FROM email_signup_pending WHERE anonymous_user_id = ? AND email = ? AND expires_at > ?`)
          .bind(anonymousId, newUser.user.email.toLowerCase(), Date.now())
          .first<{ terms_version: string; privacy_version: string; accepted_at: number }>();
        if (!pending) throw new Error('Email signup challenge is missing or expired.');
        if (target) {
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM players WHERE auth_user_id = ? AND NOT EXISTS (
              SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id
            )`).bind(anonymousId),
            env.DB.prepare(`UPDATE players SET display_name = 'Deleted player', auth_user_id = NULL,
              rating = 1500, total_progress_units = 0, unlock_all_classes = 0, updated_at = ? WHERE auth_user_id = ?`)
              .bind(Date.now(), anonymousId),
            env.DB.prepare(`UPDATE players SET terms_version = ?, privacy_version = ?, legal_accepted_at = ?, updated_at = ?
              WHERE auth_user_id = ?`).bind(pending.terms_version, pending.privacy_version, pending.accepted_at, Date.now(), newId),
            env.DB.prepare('DELETE FROM email_signup_pending WHERE anonymous_user_id = ?').bind(anonymousId),
          ]);
          return;
        }
        await env.DB.batch([
          env.DB.prepare(`UPDATE players SET auth_user_id = ?, terms_version = ?, privacy_version = ?, legal_accepted_at = ?, updated_at = ?
            WHERE auth_user_id = ?`).bind(newId, pending.terms_version, pending.privacy_version, pending.accepted_at, Date.now(), anonymousId),
          env.DB.prepare('DELETE FROM email_signup_pending WHERE anonymous_user_id = ?').bind(anonymousId),
        ]);
      },
    })],
  });
}

export type GameAuth = ReturnType<typeof createAuth>;
