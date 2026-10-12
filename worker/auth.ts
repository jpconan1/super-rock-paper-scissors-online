import { betterAuth } from 'better-auth';
import { anonymous, emailOTP } from 'better-auth/plugins';
import { createResendMailer, type AuthMailer } from './resendMailer';

const TERMS_VERSION = '2026-09-13';
const PRIVACY_VERSION = '2026-09-13';

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

export function createAuth(env: AuthEnv, mailer: AuthMailer | undefined = env.RESEND_API_KEY
  ? createResendMailer(env.RESEND_API_KEY)
  : env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')
    ? { sendSignupCode: async () => {}, sendSignInCode: async () => {}, sendPasswordCode: async () => {}, sendDeletionCode: async () => {} }
    : undefined) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: ['http://localhost:5173', 'http://localhost:8787', 'https://abm.jpconan.ca'],
    advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://') },
    session: { freshAge: 5 * 60 },
    account: { encryptOAuthTokens: true, accountLinking: { disableImplicitLinking: true } },
    emailAndPassword: { enabled: true, disableSignUp: false, minPasswordLength: 8, maxPasswordLength: 128 },
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
      disableSignUp: true,
      generateOTP: env.BETTER_AUTH_URL.startsWith('http://localhost') && /^\d{6}$/.test(env.DEV_AUTH_EMAIL_CODE ?? '')
        ? () => env.DEV_AUTH_EMAIL_CODE
        : undefined,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (!mailer || type !== 'sign-in') throw new Error('Email login is unavailable.');
        await mailer.sendSignInCode({ email, code: otp });
      },
    }), anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => 'Guest',
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const anonymousId = anonymousUser.user.id;
        const newId = newUser.user.id;
        const target = await env.DB.prepare('SELECT player_id FROM players WHERE auth_user_id = ?').bind(newId)
          .first<{ player_id: string }>();
        const now = Date.now();
        const provider = await env.DB.prepare('SELECT providerId FROM account WHERE userId = ? ORDER BY createdAt ASC LIMIT 1')
          .bind(newId).first<{ providerId: string }>();
        if (provider?.providerId !== 'google' && provider?.providerId !== 'credential') throw new Error('Unsupported account protection type.');
        if (target) {
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM players WHERE auth_user_id = ? AND NOT EXISTS (
              SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id
            )`).bind(anonymousId),
            env.DB.prepare(`UPDATE players SET display_name = 'Deleted player', auth_user_id = NULL, account_type = NULL,
              rating = 1500, total_progress_units = 0, unlock_all_classes = 0, updated_at = ? WHERE auth_user_id = ?`)
              .bind(now, anonymousId),
            env.DB.prepare(`INSERT OR IGNORE INTO analytics_events
              (event_id, event_type, occurred_at, player_id, metadata_json, is_test)
              SELECT ?, 'protected-account', ?, ?, '{}', CASE WHEN EXISTS (SELECT 1 FROM test_players WHERE player_id = ?) THEN 1 ELSE 0 END`)
              .bind(`protected-account:${target.player_id}`, now, target.player_id, target.player_id),
          ]);
          return;
        }
        const emailProtection = provider?.providerId === 'credential';
        const pending = emailProtection ? await env.DB.prepare(`SELECT context_json FROM email_auth_challenges
          WHERE challenge_key = ? AND purpose = 'signup' AND email = ? AND expires_at > ?`)
          .bind(`signup:${anonymousId}`, newUser.user.email.toLowerCase(), now).first<{ context_json: string }>() : null;
        const context = pending ? JSON.parse(pending.context_json) as { displayName?: string; termsVersion?: string; privacyVersion?: string; acceptedAt?: number } : null;
        if (emailProtection && !context) throw new Error('Email signup challenge expired.');
        await env.DB.batch([
          env.DB.prepare(`UPDATE players SET auth_user_id = ?, account_type = ?, display_name = COALESCE(?, display_name), terms_version = ?, privacy_version = ?, legal_accepted_at = ?, updated_at = ?
            WHERE auth_user_id = ?`).bind(newId, emailProtection ? 'email' : 'google', context?.displayName ?? null,
              context?.termsVersion ?? TERMS_VERSION, context?.privacyVersion ?? PRIVACY_VERSION, context?.acceptedAt ?? now, now, anonymousId),
          ...(emailProtection ? [env.DB.prepare('DELETE FROM email_auth_challenges WHERE challenge_key = ?').bind(`signup:${anonymousId}`)] : []),
          env.DB.prepare(`INSERT OR IGNORE INTO analytics_events
            (event_id, event_type, occurred_at, player_id, metadata_json, is_test)
            SELECT ?, 'protected-account', ?, p.player_id, '{}', CASE WHEN t.player_id IS NULL THEN 0 ELSE 1 END
            FROM players p LEFT JOIN test_players t ON t.player_id = p.player_id WHERE p.auth_user_id = ?`)
            .bind(`protected-account:${newId}`, now, newId),
        ]);
      },
    })],
  });
}

export type GameAuth = ReturnType<typeof createAuth>;
