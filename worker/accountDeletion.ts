export async function accountDeletionCodeHash(secret: string, userId: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${userId}:${code}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface AccountDeletionChallenge {
  code_hash: string;
  expires_at: number;
  failed_attempts: number;
}

export function accountDeletionChallengeStatus(challenge: AccountDeletionChallenge | null, candidateHash: string, now: number,
  maxAttempts = 3): 'valid' | 'invalid' | 'expired' | 'exhausted' {
  if (!challenge) return 'invalid';
  if (challenge.expires_at <= now) return 'expired';
  if (challenge.failed_attempts >= maxAttempts) return 'exhausted';
  return challenge.code_hash === candidateHash ? 'valid' : 'invalid';
}

interface DeletionStatement { bind(...values: unknown[]): DeletionStatement }
interface DeletionDatabase {
  prepare(query: string): DeletionStatement;
  batch(statements: DeletionStatement[]): Promise<unknown>;
}

export async function purgeAccountData(db: DeletionDatabase, authUserId: string, email: string | undefined, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE analytics_events SET player_id = NULL, metadata_json = '{}' WHERE player_id IN
      (SELECT player_id FROM players WHERE auth_user_id = ?)` ).bind(authUserId),
    db.prepare(`UPDATE whiteboard_archive SET player_id = NULL, display_name = 'Deleted player', account_type = 'deleted' WHERE player_id IN
      (SELECT player_id FROM players WHERE auth_user_id = ?)` ).bind(authUserId),
    db.prepare('DELETE FROM local_match_grants WHERE player_id IN (SELECT player_id FROM players WHERE auth_user_id = ?)').bind(authUserId),
    db.prepare('DELETE FROM local_progress_awards WHERE player_id IN (SELECT player_id FROM players WHERE auth_user_id = ?)').bind(authUserId),
    db.prepare('DELETE FROM email_signup_pending WHERE anonymous_user_id = ?').bind(authUserId),
    db.prepare('DELETE FROM email_auth_challenges WHERE user_id = ? OR email = ?').bind(authUserId, email?.toLowerCase() ?? ''),
    db.prepare('DELETE FROM account_deletion_challenges WHERE user_id = ?').bind(authUserId),
    db.prepare("DELETE FROM verification WHERE value = ? AND identifier LIKE 'delete-account-%'").bind(authUserId),
    ...(email ? [db.prepare('DELETE FROM verification WHERE identifier = ?').bind(`sign-in-otp-${email.toLowerCase()}`)] : []),
    db.prepare('DELETE FROM session WHERE userId = ?').bind(authUserId),
    db.prepare('DELETE FROM account WHERE userId = ?').bind(authUserId),
    db.prepare(`DELETE FROM players WHERE auth_user_id = ? AND NOT EXISTS (
      SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id
    )`).bind(authUserId),
    db.prepare(`UPDATE players SET display_name = 'Deleted player', auth_user_id = NULL, account_type = NULL,
      rating = 1500, total_progress_units = 0, unlock_all_classes = 0, updated_at = ? WHERE auth_user_id = ?`).bind(now, authUserId),
    db.prepare('DELETE FROM user WHERE id = ?').bind(authUserId),
  ]);
}
