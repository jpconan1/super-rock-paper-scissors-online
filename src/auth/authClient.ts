import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';

export function createGameAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    fetchOptions: { credentials: 'include' },
    plugins: [anonymousClient()],
  });
}

export type GameAuthClient = ReturnType<typeof createGameAuthClient>;
