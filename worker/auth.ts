import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_MAILER?: AuthMailer;
}

export interface AuthMailer {
  sendVerification(message: { email: string; url: string }): Promise<void>;
  sendPasswordReset(message: { email: string; url: string }): Promise<void>;
}

async function anonymizePlayer(db: D1Database, authUserId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM local_progress_awards WHERE player_id IN (SELECT player_id FROM players WHERE auth_user_id = ?)').bind(authUserId),
    db.prepare(`DELETE FROM players WHERE auth_user_id = ? AND NOT EXISTS (
      SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id
    )`).bind(authUserId),
    db.prepare(`UPDATE players SET display_name = 'Deleted player', auth_user_id = NULL,
      rating = 1500, total_progress_units = 0, unlock_all_classes = 0, updated_at = ? WHERE auth_user_id = ?`)
      .bind(Date.now(), authUserId),
  ]);
}

export function createAuth(env: AuthEnv, mailer: AuthMailer | undefined = env.AUTH_MAILER) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: ['http://localhost:5173', 'http://localhost:8787', 'https://abm.jpconan.ca'],
    advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://') },
    session: { freshAge: 5 * 60 },
    account: { encryptOAuthTokens: true, accountLinking: { disableImplicitLinking: true } },
    emailAndPassword: {
      enabled: Boolean(mailer),
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (!mailer) throw new Error('Email authentication is unavailable.');
        await mailer.sendPasswordReset({ email: user.email, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (!mailer) throw new Error('Email authentication is unavailable.');
        await mailer.sendVerification({ email: user.email, url });
      },
    },
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
    plugins: [anonymous({
      generateName: () => 'Guest',
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const anonymousId = anonymousUser.user.id;
        const newId = newUser.user.id;
        const target = await env.DB.prepare('SELECT player_id FROM players WHERE auth_user_id = ?').bind(newId)
          .first<{ player_id: string }>();
        if (target) {
          await env.DB.prepare('UPDATE players SET auth_user_id = NULL, updated_at = ? WHERE auth_user_id = ?')
            .bind(Date.now(), anonymousId).run();
          return;
        }
        await env.DB.prepare('UPDATE players SET auth_user_id = ?, updated_at = ? WHERE auth_user_id = ?')
          .bind(newId, Date.now(), anonymousId).run();
      },
    })],
  });
}

export type GameAuth = ReturnType<typeof createAuth>;
