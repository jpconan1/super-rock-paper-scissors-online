import { expect, test, vi } from 'vitest';
import { DISCORD_INVITE_URL, formatOnlinePlayerCount, getTitleAccountControlVisibility, getTitleAuthControlVisibility, normalizeForgotPasswordEmail, openDiscordInvite } from '../src/title/titleScreen';

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

test('title authentication modes swap the primary controls for the active form', () => {
  expect(getTitleAuthControlVisibility('none')).toEqual({
    primaryButtons: true, providers: true, onlineCount: true, passwordForm: false, emailCodeForm: false,
  });
  expect(getTitleAuthControlVisibility('password')).toEqual({
    primaryButtons: false, providers: false, onlineCount: false, passwordForm: true, emailCodeForm: false,
  });
  expect(getTitleAuthControlVisibility('email-code')).toEqual({
    primaryButtons: false, providers: false, onlineCount: false, passwordForm: false, emailCodeForm: true,
  });
});

test('title account session distinguishes logged-out, guest, and protected states', () => {
  expect(getTitleAccountControlVisibility('none')).toEqual({
    accountStatus: false, logout: false, enterExistingAccount: false, claimAccount: false, loggedOutAuthentication: true,
  });
  expect(getTitleAccountControlVisibility('guest')).toEqual({
    accountStatus: true, logout: true, enterExistingAccount: true, claimAccount: true, loggedOutAuthentication: false,
  });
  expect(getTitleAccountControlVisibility('protected')).toEqual({
    accountStatus: true, logout: true, enterExistingAccount: true, claimAccount: false, loggedOutAuthentication: false,
  });
});

test('forgot password requires a valid email and normalizes it', () => {
  expect(normalizeForgotPasswordEmail('', false)).toBeUndefined();
  expect(normalizeForgotPasswordEmail('not-an-email', false)).toBeUndefined();
  expect(normalizeForgotPasswordEmail('  Player@Example.COM  ', true)).toBe('player@example.com');
});
