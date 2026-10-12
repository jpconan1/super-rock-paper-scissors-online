import { describe, expect, test } from 'vitest';
import { emailChallengeHash, emailChallengeStatus, normalizeAuthEmail, validEmailPassword } from '../worker/emailAccounts';

describe('email accounts', () => {
  test('normalizes valid addresses and rejects malformed input', () => {
    expect(normalizeAuthEmail(' Player@Example.COM ')).toBe('player@example.com');
    expect(normalizeAuthEmail('missing-at.example.com')).toBeNull();
    expect(normalizeAuthEmail('a@b')).toBeNull();
  });

  test('uses the selected 8-128 character password policy', () => {
    expect(validEmailPassword('1234567')).toBe(false);
    expect(validEmailPassword('12345678')).toBe(true);
    expect(validEmailPassword('x'.repeat(128))).toBe(true);
    expect(validEmailPassword('x'.repeat(129))).toBe(false);
  });

  test('binds challenge hashes to purpose and subject', async () => {
    const signup = await emailChallengeHash('secret', 'signup', 'user-a', '123456');
    expect(signup).toMatch(/^[a-f0-9]{64}$/);
    expect(signup).not.toContain('123456');
    expect(await emailChallengeHash('secret', 'login', 'user-a', '123456')).not.toBe(signup);
    expect(await emailChallengeHash('secret', 'signup', 'user-b', '123456')).not.toBe(signup);
  });

  test('rejects expired, exhausted, missing, and replaced codes', () => {
    expect(emailChallengeStatus(null, 'new', 10)).toBe('invalid');
    expect(emailChallengeStatus({ code_hash: 'new', expires_at: 10, failed_attempts: 0 }, 'new', 10)).toBe('expired');
    expect(emailChallengeStatus({ code_hash: 'new', expires_at: 20, failed_attempts: 3 }, 'new', 10)).toBe('exhausted');
    expect(emailChallengeStatus({ code_hash: 'new', expires_at: 20, failed_attempts: 0 }, 'old', 10)).toBe('invalid');
    expect(emailChallengeStatus({ code_hash: 'new', expires_at: 20, failed_attempts: 0 }, 'new', 10)).toBe('valid');
  });
});
