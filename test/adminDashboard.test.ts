import { describe, expect, test } from 'vitest';
import { isAllowedAdminEmail } from '../src/core/adminAccess';

describe('admin dashboard authorization', () => {
  test('matches a case-insensitive email allowlist', () => {
    expect(isAllowedAdminEmail('JP@Example.com', 'other@example.com, jp@example.COM')).toBe(true);
  });

  test('rejects missing, partial, and empty allowlists', () => {
    expect(isAllowedAdminEmail('jp@example.com')).toBe(false);
    expect(isAllowedAdminEmail('jp@example.com', 'not-jp@example.com')).toBe(false);
    expect(isAllowedAdminEmail('', 'jp@example.com')).toBe(false);
  });
});
