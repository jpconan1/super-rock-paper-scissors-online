export type EmailChallengePurpose = 'signup' | 'login' | 'password';

export interface EmailChallengeRecord {
  code_hash: string;
  expires_at: number;
  failed_attempts: number;
}

export type EmailChallengeStatus = 'valid' | 'invalid' | 'expired' | 'exhausted';

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

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
