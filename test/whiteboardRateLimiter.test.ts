import { describe, expect, test } from 'vitest';
import { WhiteboardRateLimiter } from '../src/whiteboard/rateLimiter';

describe('WhiteboardRateLimiter', () => {
  test('drawing and text have separate per-guest limits', () => {
    const limiter = new WhiteboardRateLimiter();
    for (let index = 0; index < 30; index++) expect(limiter.allow('guest-a', 'draw', index)).toBe(true);
    expect(limiter.allow('guest-a', 'draw', 30)).toBe(false);
    for (let index = 0; index < 6; index++) expect(limiter.allow('guest-a', 'text', index)).toBe(true);
    expect(limiter.allow('guest-a', 'text', 30)).toBe(false);
  });

  test('sockets sharing a guest share limits while another guest remains independent', () => {
    const limiter = new WhiteboardRateLimiter(10_000, 2, 2, 10);
    expect(limiter.allow('guest-a', 'draw', 0)).toBe(true);
    expect(limiter.allow('guest-a', 'draw', 1)).toBe(true);
    expect(limiter.allow('guest-a', 'draw', 2)).toBe(false);
    expect(limiter.allow('guest-b', 'draw', 2)).toBe(true);
  });

  test('all categories and guests share the global limit', () => {
    const limiter = new WhiteboardRateLimiter(10_000, 10, 10, 3);
    expect(limiter.allow('guest-a', 'draw', 0)).toBe(true);
    expect(limiter.allow('guest-a', 'text', 1)).toBe(true);
    expect(limiter.allow('guest-b', 'draw', 2)).toBe(true);
    expect(limiter.allow('guest-c', 'text', 3)).toBe(false);
  });

  test('allowance returns after the rolling window', () => {
    const limiter = new WhiteboardRateLimiter(10_000, 1, 1, 1);
    expect(limiter.allow('guest-a', 'draw', 0)).toBe(true);
    expect(limiter.allow('guest-a', 'draw', 10_000)).toBe(true);
  });
});
