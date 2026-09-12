import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export function createAuth(env: AuthEnv) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: ['http://localhost:5173', 'http://localhost:8787', 'https://abm.jpconan.ca'],
    advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://') },
    account: { encryptOAuthTokens: true },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ['openid', 'email', 'profile'],
      },
    },
    plugins: [anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => 'Guest',
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const anonymousId = anonymousUser.user.id;
        const newId = newUser.user.id;
        const target = await env.DB.prepare('SELECT player_id FROM players WHERE auth_user_id = ?').bind(newId)
          .first<{ player_id: string }>();
        if (target) {
          await env.DB.prepare('UPDATE players SET auth_user_id = NULL WHERE auth_user_id = ?').bind(anonymousId).run();
          return;
        }
        await env.DB.prepare("UPDATE players SET auth_user_id = ?, guest_secret_hash = 'revoked', updated_at = ? WHERE auth_user_id = ?")
          .bind(newId, Date.now(), anonymousId).run();
      },
    })],
  });
}

export type GameAuth = ReturnType<typeof createAuth>;
