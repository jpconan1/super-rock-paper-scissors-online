export type EmailChallengePurpose = 'signup' | 'login' | 'password';

export interface EmailChallengeRecord {
  code_hash: string;
  expires_at: number;
  failed_attempts: number;
}

export interface StoredEmailChallenge extends EmailChallengeRecord {
  challenge_key: string;
  purpose: EmailChallengePurpose;
  user_id: string | null;
  email: string;
  context_json: string;
}

export type EmailChallengeStatus = 'valid' | 'invalid' | 'expired' | 'exhausted';

interface AtomicStatement { bind(...values: unknown[]): AtomicStatement }
interface AtomicDatabase {
  prepare(query: string): AtomicStatement;
  batch<T = unknown>(statements: AtomicStatement[]): Promise<Array<{ results: T[] }>>;
}

export function normalizeAuthEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function validEmailPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export function generateEmailCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
}

export async function emailChallengeHash(secret: string, purpose: EmailChallengePurpose, binding: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`email-auth:${purpose}:${binding}:${code}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function emailChallengeStatus(record: EmailChallengeRecord | null | undefined, candidateHash: string, now: number,
  maxAttempts = 3): EmailChallengeStatus {
  if (!record) return 'invalid';
  if (record.expires_at <= now) return 'expired';
  if (record.failed_attempts >= maxAttempts) return 'exhausted';
  return constantTimeEqual(record.code_hash, candidateHash) ? 'valid' : 'invalid';
}

export async function consumeEmailChallenge(db: AtomicDatabase, secret: string, challengeKey: string,
  purpose: EmailChallengePurpose, binding: string, email: string, code: string, now = Date.now(), maxAttempts = 3,
): Promise<StoredEmailChallenge | null> {
  return checkEmailChallenge(db, secret, challengeKey, purpose, binding, email, code, now, maxAttempts, true);
}

export async function verifySignupChallengeForLink(db: AtomicDatabase, secret: string, challengeKey: string,
  binding: string, email: string, code: string, now = Date.now(), maxAttempts = 3,
): Promise<StoredEmailChallenge | null> {
  return checkEmailChallenge(db, secret, challengeKey, 'signup', binding, email, code, now, maxAttempts, false);
}

async function checkEmailChallenge(db: AtomicDatabase, secret: string, challengeKey: string,
  purpose: EmailChallengePurpose, binding: string, email: string, code: string, now: number, maxAttempts: number, consume: boolean,
): Promise<StoredEmailChallenge | null> {
  const candidateHash = await emailChallengeHash(secret, purpose, binding, code);
  const [matched] = await db.batch<StoredEmailChallenge>([
    db.prepare(`${consume ? 'DELETE FROM' : 'SELECT challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, failed_attempts FROM'} email_auth_challenges
      WHERE challenge_key = ? AND purpose = ? AND email = ? AND code_hash = ? AND expires_at > ? AND failed_attempts < ?
      ${consume ? 'RETURNING challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, failed_attempts' : ''}`)
      .bind(challengeKey, purpose, email, candidateHash, now, maxAttempts),
    db.prepare(`UPDATE email_auth_challenges SET failed_attempts = failed_attempts + 1
      WHERE challenge_key = ? AND purpose = ? AND email = ? AND code_hash <> ? AND expires_at > ? AND failed_attempts < ?`)
      .bind(challengeKey, purpose, email, candidateHash, now, maxAttempts),
    db.prepare(`DELETE FROM email_auth_challenges
      WHERE challenge_key = ? AND purpose = ? AND (expires_at <= ? OR failed_attempts >= ?)`)
      .bind(challengeKey, purpose, now, maxAttempts),
  ]);
  return matched?.results[0] ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
