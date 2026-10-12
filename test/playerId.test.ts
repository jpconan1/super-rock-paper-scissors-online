import { describe, expect, test, vi } from 'vitest';
import { claimReadablePlayerId, generateReadablePlayerId, isReadablePlayerId } from '../src/protocol/playerId';

describe('readable player IDs', () => {
  test('generates lowercase category words and a zero-padded suffix', () => {
    expect(generateReadablePlayerId(() => 0)).toBe('apple-bold-bagel-badger-00');
    expect(generateReadablePlayerId(() => 0.999999)).toBe('whistle-wild-yam-wolf-99');
  });

  test('validates the public format', () => {
    expect(isReadablePlayerId('apple-omega-pizza-turtle-45')).toBe(true);
    expect(isReadablePlayerId('Apple-omega-pizza-turtle-45')).toBe(false);
    expect(isReadablePlayerId('apple-omega-pizza-turtle-5')).toBe(false);
    expect(isReadablePlayerId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  test('retries collisions until a candidate is claimed', async () => {
    const claim = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(claimReadablePlayerId(claim, () => 0)).resolves.toBe('apple-bold-bagel-badger-00');
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
