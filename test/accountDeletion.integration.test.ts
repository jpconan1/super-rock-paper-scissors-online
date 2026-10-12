import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { accountDeletionChallengeStatus, accountDeletionCodeHash, purgeAccountData } from '../worker/accountDeletion';
import migration1 from '../worker/migrations/0001_initial.sql?raw';
import migration2 from '../worker/migrations/0002_public_abm_test.sql?raw';
import migration3 from '../worker/migrations/0003_better_auth.sql?raw';
import migration4 from '../worker/migrations/0004_progression.sql?raw';
import migration5 from '../worker/migrations/0005_unlock_all_classes.sql?raw';
import migration6 from '../worker/migrations/0006_local_progress_awards.sql?raw';
import migration7 from '../worker/migrations/0007_auth_rewrite.sql?raw';
import migration8 from '../worker/migrations/0008_email_signup.sql?raw';
import migration9 from '../worker/migrations/0009_account_deletion.sql?raw';
import migration10 from '../worker/migrations/0010_admin_dashboard.sql?raw';
import migration11 from '../worker/migrations/0011_maintenance_mode.sql?raw';
import migration12 from '../worker/migrations/0012_fixed_account_identity.sql?raw';
import migration13 from '../worker/migrations/0013_email_accounts.sql?raw';

const migrations = [migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13];
let miniflare: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;

async function applyMigrations(database: Awaited<ReturnType<Miniflare['getD1Database']>>): Promise<void> {
  for (const migration of migrations) {
    const sql = migration.replace(/^--.*$/gm, '');
    for (const statement of sql.split(';').map((item) => item.trim()).filter(Boolean)) {
      if (!statement.startsWith('PRAGMA ')) await database.prepare(statement).run();
    }
  }
}

async function seedUser(userId: string, playerId: string, email: string): Promise<void> {
  const now = 1_000;
  await db.batch([
    db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, isAnonymous)
      VALUES (?, ?, ?, 1, NULL, ?, ?, 0)`).bind(userId, userId, email, now, now),
    db.prepare(`INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
      VALUES (?, ?, 'google', ?, ?, ?)`).bind(`account-${userId}`, email, userId, now, now),
    db.prepare(`INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(`session-${userId}`, 999_999, `token-${userId}`, now, now, userId),
    db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, auth_user_id,
      total_progress_units, unlock_all_classes, terms_version, privacy_version, legal_accepted_at)
      VALUES (?, ?, 1777, ?, ?, ?, 42000, 1, 'terms-v1', 'privacy-v1', 777)`).bind(playerId, `Name ${userId}`, now, now, userId),
    db.prepare(`INSERT INTO account_deletion_challenges
      (user_id, code_hash, expires_at, failed_attempts, requested_at, last_sent_at) VALUES (?, 'hash', 999999, 1, ?, ?)`).bind(userId, now, now),
    db.prepare(`INSERT INTO email_signup_pending
      (anonymous_user_id, email, terms_version, privacy_version, accepted_at, expires_at)
      VALUES (?, ?, 'terms-v1', 'privacy-v1', ?, 999999)`).bind(userId, email, now),
    db.prepare(`INSERT INTO email_auth_challenges
      (challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, failed_attempts, requested_at, last_sent_at)
      VALUES (?, 'password', ?, ?, 'hash', '{}', 999999, 0, ?, ?)`).bind(`password:${userId}`, userId, email, now, now),
    db.prepare(`INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
      VALUES (?, ?, 'otp-hash', 999999, ?, ?)`).bind(`verification-${userId}`, `sign-in-otp-${email}`, now, now),
    db.prepare(`INSERT INTO local_progress_awards
      (result_id, player_id, kind, gained_progress_units, award_json, full_reward, progress_applied, created_at)
      VALUES (?, ?, 'tutorial', 10000, '{}', 1, 1, ?)`).bind(`award-${userId}`, playerId, now),
    db.prepare(`INSERT INTO local_match_grants (player_id, grant_id, kind, issued_at, expires_at, claimed_at)
      VALUES (?, ?, 'tutorial', ?, 999999, NULL)`).bind(playerId, `grant-${userId}`, now),
  ]);
}

beforeEach(async () => {
  miniflare = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    compatibilityDate: '2026-08-12',
    d1Databases: { DB: `deletion-${crypto.randomUUID()}` },
  }));
  db = await miniflare.getD1Database('DB');
  await applyMigrations(db);
});

afterEach(async () => { await miniflare.dispose(); });

describe('account deletion D1 lifecycle', () => {
  test('installs the reset identity schema while preserving game configuration', async () => {
    expect(await db.prepare("SELECT season_id FROM seasons WHERE season_id = 'public-abm-test'").first()).toEqual({ season_id: 'public-abm-test' });
    expect(await db.prepare('SELECT singleton_id FROM maintenance_state WHERE singleton_id = 1').first()).toEqual({ singleton_id: 1 });
    for (const table of ['players', 'user', 'session', 'account', 'match_results', 'analytics_events', 'analytics_daily', 'matchmaking_attempts', 'whiteboard_archive']) {
      expect(await db.prepare(`SELECT COUNT(*) count FROM ${table}`).first(), table).toEqual({ count: 0 });
    }
    await db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, account_type)
      VALUES ('apple-omega-pizza-turtle-45', 'Player', 1500, 1, 1, 'guest')`).run();
    await expect(db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, account_type)
      VALUES ('anchor-bold-bagel-badger-00', 'Player', 1500, 1, 1, 'linked')`).run()).rejects.toThrow();
    await expect(db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, account_type)
      VALUES ('apple-omega-pizza-turtle-45', 'Other', 1500, 1, 1, 'guest')`).run()).rejects.toThrow();
  });

  test('deletes an unmatched account and all dependent account data', async () => {
    await seedUser('user-a', 'player-a', 'a@example.com');

    await purgeAccountData(db, 'user-a', 'a@example.com', 5_000);

    for (const table of ['user', 'account', 'session', 'players', 'account_deletion_challenges', 'email_signup_pending', 'email_auth_challenges', 'verification', 'local_progress_awards', 'local_match_grants']) {
      expect((await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, table).toBe(0);
    }
  });

  test('keeps match history and anonymous consent proof while removing identity and progression', async () => {
    await seedUser('user-a', 'player-a', 'a@example.com');
    await seedUser('user-b', 'player-b', 'b@example.com');
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO seasons (season_id, name, status, starts_at) VALUES ('season-test', 'Test', 'active', 1)`),
      db.prepare(`INSERT INTO match_results
        (result_id, match_id, season_id, p1_id, p2_id, winner_id, summary_json, ratings_applied, completed_at)
        VALUES ('result-1', 'match-1', 'season-test', 'player-a', 'player-b', 'player-a', '{}', 1, 2)`),
    ]);

    await purgeAccountData(db, 'user-a', 'a@example.com', 5_000);

    expect(await db.prepare('SELECT * FROM user WHERE id = ?').bind('user-a').first()).toBeNull();
    expect(await db.prepare('SELECT match_id FROM match_results WHERE match_id = ?').bind('match-1').first()).toEqual({ match_id: 'match-1' });
    expect(await db.prepare(`SELECT display_name, auth_user_id, account_type, rating, total_progress_units, unlock_all_classes,
      terms_version, privacy_version, legal_accepted_at FROM players WHERE player_id = 'player-a'`).first()).toEqual({
      display_name: 'Deleted player', auth_user_id: null, account_type: null, rating: 1500, total_progress_units: 0, unlock_all_classes: 0,
      terms_version: 'terms-v1', privacy_version: 'privacy-v1', legal_accepted_at: 777,
    });
    expect(await db.prepare("SELECT display_name, auth_user_id FROM players WHERE player_id = 'player-b'").first()).toEqual({
      display_name: 'Name user-b', auth_user_id: 'user-b',
    });
  });

  test('rolls back every cleanup statement when the atomic batch fails', async () => {
    await seedUser('user-a', 'player-a', 'a@example.com');
    await db.prepare(`CREATE TRIGGER prevent_user_delete BEFORE DELETE ON user
      WHEN OLD.id = 'user-a' BEGIN SELECT RAISE(ABORT, 'blocked'); END`).run();

    await expect(purgeAccountData(db, 'user-a', 'a@example.com', 5_000)).rejects.toThrow();

    expect(await db.prepare("SELECT id FROM user WHERE id = 'user-a'").first()).toEqual({ id: 'user-a' });
    expect(await db.prepare("SELECT display_name, auth_user_id FROM players WHERE player_id = 'player-a'").first()).toEqual({
      display_name: 'Name user-a', auth_user_id: 'user-a',
    });
    expect(await db.prepare("SELECT result_id FROM local_progress_awards WHERE player_id = 'player-a'").first()).toEqual({ result_id: 'award-user-a' });
  });

  test('uses a keyed, user-bound hash instead of storing the six-digit code', async () => {
    const first = await accountDeletionCodeHash('secret', 'user-a', '123456');
    expect(first).not.toContain('123456');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await accountDeletionCodeHash('secret', 'user-a', '123456')).toBe(first);
    expect(await accountDeletionCodeHash('secret', 'user-b', '123456')).not.toBe(first);
  });

  test('rejects missing, expired, exhausted, and replaced deletion codes', () => {
    expect(accountDeletionChallengeStatus(null, 'new', 10)).toBe('invalid');
    expect(accountDeletionChallengeStatus({ code_hash: 'new', expires_at: 10, failed_attempts: 0 }, 'new', 10)).toBe('expired');
    expect(accountDeletionChallengeStatus({ code_hash: 'new', expires_at: 20, failed_attempts: 3 }, 'new', 10)).toBe('exhausted');
    expect(accountDeletionChallengeStatus({ code_hash: 'new', expires_at: 20, failed_attempts: 0 }, 'old', 10)).toBe('invalid');
    expect(accountDeletionChallengeStatus({ code_hash: 'new', expires_at: 20, failed_attempts: 0 }, 'new', 10)).toBe('valid');
  });
});
