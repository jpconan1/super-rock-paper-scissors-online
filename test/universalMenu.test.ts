import { describe, expect, test } from 'vitest';
import { QUIT_CONFIRMATION_COPY } from '../src/app/universalMenu';

describe('universal menu', () => {
  test('warns that quitting logs out the active account', () => {
    expect(QUIT_CONFIRMATION_COPY).toBe('Are you sure? This will log you out.');
  });
});
