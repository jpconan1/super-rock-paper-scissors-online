import { expect, test } from 'vitest';
import { formatOnlinePlayerCount } from '../src/title/titleScreen';

test('title online count formats known and unavailable counts', () => {
  expect(formatOnlinePlayerCount(0)).toBe('players online: 0');
  expect(formatOnlinePlayerCount(12)).toBe('players online: 12');
  expect(formatOnlinePlayerCount(null)).toBe('players online: ?');
});
