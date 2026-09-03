import { describe, expect, test, vi } from 'vitest';
import { randomUuid } from '../src/core/randomUuid';

describe('randomUuid', () => {
  test('uses native randomUUID when available', () => {
    const native = vi.fn(() => 'native-id' as `${string}-${string}-${string}-${string}-${string}`);
    const cryptoSource = { randomUUID: native, getRandomValues: vi.fn() } as unknown as Crypto;
    expect(randomUuid(cryptoSource)).toBe('native-id');
    expect(native).toHaveBeenCalledOnce();
  });

  test('creates a version 4 UUID when randomUUID is unavailable', () => {
    const cryptoSource = {
      getRandomValues(array: Uint8Array) {
        array.set([...Array(16).keys()]);
        return array;
      },
    } as Crypto;

    expect(randomUuid(cryptoSource)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });
});
