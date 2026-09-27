import { expect, test, vi } from 'vitest';
import { DISCORD_INVITE_URL, formatOnlinePlayerCount, openDiscordInvite } from '../src/title/titleScreen';

test('title online count formats known and unavailable counts', () => {
  expect(formatOnlinePlayerCount(0)).toBe('players online: 0');
  expect(formatOnlinePlayerCount(12)).toBe('players online: 12');
  expect(formatOnlinePlayerCount(null)).toBe('players online: ?');
});

test('Discord invite opens in an isolated new tab', () => {
  const openWindow = vi.fn(() => null);
  openDiscordInvite(openWindow as unknown as typeof window.open);
  expect(DISCORD_INVITE_URL).toBe('https://discord.gg/jNrQe3Kt3T');
  expect(openWindow).toHaveBeenCalledWith(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer');
});
