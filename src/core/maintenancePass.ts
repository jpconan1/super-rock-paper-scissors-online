export const MAINTENANCE_PASS_MS = 4 * 60 * 60_000;

export async function createMaintenancePass(secret: string, version: number, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + MAINTENANCE_PASS_MS; const payload = `${version}.${expiresAt}`;
  return { token: `${payload}.${await signature(secret, payload)}`, expiresAt };
}

export async function verifyMaintenancePass(secret: string, token: string | undefined, version: number, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.'); if (parts.length !== 3) return false;
  const tokenVersion = Number(parts[0]); const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion !== version || !Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = await signature(secret, `${parts[0]}.${parts[1]}`); return constantTimeEqual(parts[2]!, expected);
}

async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const value = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`maintenance:${payload}`));
  return toBase64Url(new Uint8Array(value));
}
function toBase64Url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function constantTimeEqual(left: string, right: string): boolean { if (left.length !== right.length) return false; let difference = 0; for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i); return difference === 0; }
