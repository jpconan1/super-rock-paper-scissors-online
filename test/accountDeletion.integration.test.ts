import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { accountDeletionChallengeStatus, accountDeletionCodeHash, consumeAccountDeletionChallenge, purgeAccountData } from '../worker/accountDeletion';
import { consumeEmailChallenge, emailChallengeHash, verifySignupChallengeForLink } from '../worker/emailAccounts';
import { createAuth } from '../worker/auth';
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
import migration14 from '../worker/migrations/0014_emblems.sql?raw';
import { completeEmblemMission, grantPlayerEmblem, hasCustomEmblemAccess, ownedPlayerEmblems, prestigePlayer, revokePlayerEmblem } from '../worker/playerEmblems';
import { MAX_PROGRESS_UNITS } from '../src/core/progression';
import { finalizeMatch } from '../worker/matchPersistence';

const migrations = [migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14];
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
    db.prepare(`INSERT INTO player_emblems
      (player_id, emblem_id, awarded_at, source_kind, source_id) VALUES (?, 'beta-og', ?, 'mission', 'claim-account')`)
      .bind(playerId, now),
    db.prepare(`INSERT INTO emblem_mission_completions
      (player_id, mission_id, completed_at) VALUES (?, 'claim-account', ?)`).bind(playerId, now),
    db.prepare('INSERT INTO unlock_all_class_finishes (player_id, completed_at) VALUES (?, ?)').bind(playerId, now),
    db.prepare(`INSERT INTO custom_emblems (player_id, drawing_json, crop_x, crop_y, crop_width, crop_height, border_number, artwork_webp, updated_at)
      VALUES (?, '{"operations":[],"crop":{"x":188,"y":130,"width":384,"height":192},"borderNumber":1}', 188, 130, 384, 192, 1, X'524946460000000057454250', ?)`)
      .bind(playerId, now),
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

test('verified signup code stays available until Better Auth links the guest', async () => {
  const auth = createAuth({ DB: db, BETTER_AUTH_SECRET: 'test-secret', BETTER_AUTH_URL: 'http://localhost:8787',
    GOOGLE_CLIENT_ID: 'unused', GOOGLE_CLIENT_SECRET: 'unused', DEV_AUTH_EMAIL_CODE: '123456' });
  const guestResponse = await auth.handler(new Request('http://localhost:8787/api/auth/sign-in/anonymous', {
    method: 'POST', headers: { origin: 'http://localhost:8787' },
  }));
  expect(guestResponse.ok).toBe(true);
  const guest = await guestResponse.json() as { user: { id: string } };
  const cookie = guestResponse.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toContain('session_token');
  const now = Date.now();
  await db.prepare(`INSERT INTO players (player_id, display_name, created_at, updated_at, auth_user_id, account_type)
    VALUES ('guest-player', 'Guest', ?, ?, ?, 'guest')`).bind(now, now, guest.user.id).run();
  const hash = await emailChallengeHash('test-secret', 'signup', guest.user.id, '123456');
  await db.prepare(`INSERT INTO email_auth_challenges
    (challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, requested_at, last_sent_at)
    VALUES (?, 'signup', ?, 'new@example.com', ?, ?, ?, ?, ?)`)
    .bind(`signup:${guest.user.id}`, guest.user.id, hash,
      JSON.stringify({ available: true, displayName: 'New Player', termsVersion: 'v1', privacyVersion: 'v1', acceptedAt: now }), now + 600_000, now, now).run();
  expect(await verifySignupChallengeForLink(db, 'test-secret', `signup:${guest.user.id}`, guest.user.id,
    'new@example.com', '123456', now)).not.toBeNull();
  expect(await db.prepare('SELECT challenge_key FROM email_auth_challenges WHERE challenge_key = ?')
    .bind(`signup:${guest.user.id}`).first()).not.toBeNull();
  const signupResponse = await auth.handler(new Request('http://localhost:8787/api/auth/sign-up/email', {
    method: 'POST', headers: { origin: 'http://localhost:8787', cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new@example.com', password: 'long-enough-password', name: 'New Player' }),
  }));
  expect(signupResponse.status).toBe(200);
  expect(await db.prepare("SELECT account_type, display_name FROM players WHERE player_id = 'guest-player'").first())
    .toEqual({ account_type: 'email', display_name: 'New Player' });
  expect(await db.prepare('SELECT challenge_key FROM email_auth_challenges WHERE challenge_key = ?')
    .bind(`signup:${guest.user.id}`).first()).toBeNull();
});

describe('account deletion D1 lifecycle', () => {
  test('applies online prestige exactly once across match-finalization retries', async () => {
    await db.batch([
      db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, account_type, total_progress_units)
        VALUES ('player-a', 'A', 1500, 1, 1, 'guest', ?)` ).bind(MAX_PROGRESS_UNITS),
      db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, account_type, total_progress_units)
        VALUES ('player-b', 'B', 1500, 1, 1, 'guest', 0)`),
    ]);
    const result = { resultId: 'prestige-match', matchId: 'prestige-match', seasonId: 'public-abm-test',
      p1Id: 'player-a', p2Id: 'player-b', winnerId: 'player-a', p1Delta: 10, p2Delta: -10,
      p1ProgressAward: 0, p2ProgressAward: 5_000, p1Prestige: true, p2Prestige: false, summary: '{}' };

    expect(await finalizeMatch(db, result)).toBe('applied');
    expect(await finalizeMatch(db, result)).toBe('duplicate');

    expect(await db.prepare("SELECT total_progress_units, prestige_count FROM players WHERE player_id = 'player-a'").first())
      .toEqual({ total_progress_units: 0, prestige_count: 1 });
    expect(await db.prepare("SELECT mission_id FROM emblem_mission_completions WHERE player_id = 'player-a' AND mission_id = 'prestige'").first())
      .toEqual({ mission_id: 'prestige' });
  });

  test('installs the reset identity schema while preserving game configuration', async () => {
    expect(await db.prepare("SELECT season_id FROM seasons WHERE season_id = 'public-abm-test'").first()).toEqual({ season_id: 'public-abm-test' });
    expect(await db.prepare('SELECT singleton_id FROM maintenance_state WHERE singleton_id = 1').first()).toEqual({ singleton_id: 1 });
    for (const table of ['players', 'user', 'session', 'account', 'match_results', 'analytics_events', 'analytics_daily', 'matchmaking_attempts', 'whiteboard_archive',
      'player_emblems', 'emblem_mission_completions', 'unlock_all_class_finishes', 'custom_emblems']) {
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

    for (const table of ['user', 'account', 'session', 'players', 'account_deletion_challenges', 'email_signup_pending', 'email_auth_challenges', 'verification',
      'local_progress_awards', 'local_match_grants', 'player_emblems', 'emblem_mission_completions', 'unlock_all_class_finishes', 'custom_emblems']) {
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
    expect(await db.prepare(`SELECT display_name, auth_user_id, account_type, rating, total_progress_units, unlock_all_classes, equipped_emblem,
      terms_version, privacy_version, legal_accepted_at FROM players WHERE player_id = 'player-a'`).first()).toEqual({
      display_name: 'Deleted player', auth_user_id: null, account_type: null, rating: 1500, total_progress_units: 0, unlock_all_classes: 0, equipped_emblem: null,
      terms_version: 'terms-v1', privacy_version: 'privacy-v1', legal_accepted_at: 777,
    });
    expect(await db.prepare("SELECT display_name, auth_user_id FROM players WHERE player_id = 'player-b'").first()).toEqual({
      display_name: 'Name user-b', auth_user_id: 'user-b',
    });
    for (const table of ['player_emblems', 'emblem_mission_completions', 'unlock_all_class_finishes', 'custom_emblems']) {
      expect(await db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE player_id = 'player-a'`).first(), table).toEqual({ count: 0 });
    }
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

  test('atomically exhausts a deletion code under parallel wrong guesses', async () => {
    const hash = await accountDeletionCodeHash('secret', 'user-a', '123456');
    await db.prepare(`INSERT INTO account_deletion_challenges
      (user_id, code_hash, expires_at, failed_attempts, requested_at, last_sent_at) VALUES ('user-a', ?, 999999, 0, 1, 1)`)
      .bind(hash).run();

    const guesses = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      consumeAccountDeletionChallenge(db, 'secret', 'user-a', String(index).padStart(6, '0'), 10)));

    expect(guesses.every((valid) => !valid)).toBe(true);
    expect(await db.prepare("SELECT user_id FROM account_deletion_challenges WHERE user_id = 'user-a'").first()).toBeNull();
    expect(await consumeAccountDeletionChallenge(db, 'secret', 'user-a', '123456', 10)).toBe(false);
  });

  test('atomically consumes an email code only once under parallel verification', async () => {
    const hash = await emailChallengeHash('secret', 'password', 'user-a', '123456');
    await db.prepare(`INSERT INTO email_auth_challenges
      (challenge_key, purpose, user_id, email, code_hash, context_json, expires_at, failed_attempts, requested_at, last_sent_at)
      VALUES ('password:user-a', 'password', 'user-a', 'a@example.com', ?, '{}', 999999, 0, 1, 1)`).bind(hash).run();

    const results = await Promise.all(Array.from({ length: 10 }, () =>
      consumeEmailChallenge(db, 'secret', 'password:user-a', 'password', 'user-a', 'a@example.com', '123456', 10)));

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.prepare("SELECT challenge_key FROM email_auth_challenges WHERE challenge_key = 'password:user-a'").first()).toBeNull();
  });
});

describe('emblem ownership D1 lifecycle', () => {
  async function seedPlayer(playerId: string, progress = 0, testPlayer = false): Promise<void> {
    await db.prepare(`INSERT INTO players (player_id, display_name, rating, created_at, updated_at, account_type, total_progress_units)
      VALUES (?, ?, 1500, 1, 1, 'guest', ?)`).bind(playerId, playerId, progress).run();
    if (testPlayer) await db.prepare('INSERT INTO test_players (player_id, created_at) VALUES (?, 1)').bind(playerId).run();
  }

  test('starts at None, awards missions once, and only auto-equips the first emblem', async () => {
    await seedPlayer('player-a');
    expect(await db.prepare("SELECT equipped_emblem FROM players WHERE player_id = 'player-a'").first()).toEqual({ equipped_emblem: null });

    const now = Date.now();
    expect(await completeEmblemMission(db, 'player-a', 'claim-account', now)).toBe('beta-og');
    expect(await completeEmblemMission(db, 'player-a', 'claim-account', now + 1)).toBeNull();
    expect(await completeEmblemMission(db, 'player-a', 'finish-tutorial', now + 2)).toBe('new-player');

    expect(await ownedPlayerEmblems(db, 'player-a')).toEqual(['beta-og', 'new-player']);
    expect(await db.prepare("SELECT equipped_emblem FROM players WHERE player_id = 'player-a'").first()).toEqual({ equipped_emblem: 'beta-og' });
    expect(await db.prepare("SELECT COUNT(*) count FROM emblem_mission_completions WHERE player_id = 'player-a'").first()).toEqual({ count: 2 });
  });

  test('unknown missions do not award but existing ownership survives', async () => {
    await seedPlayer('player-a');
    await grantPlayerEmblem(db, 'player-a', 'beta-og', 'mission', 'claim-account', 10);
    expect(await completeEmblemMission(db, 'player-a', 'not-a-mission')).toBeNull();
    expect(await ownedPlayerEmblems(db, 'player-a')).toEqual(['beta-og']);
  });

  test('deletes revoked ownership and permits an admin re-grant', async () => {
    await seedPlayer('player-a');
    await grantPlayerEmblem(db, 'player-a', 'beta-og', 'admin', 'launch gift', 10);
    expect(await revokePlayerEmblem(db, 'player-a', 'beta-og', 20)).toBe(true);
    expect(await ownedPlayerEmblems(db, 'player-a')).toEqual([]);
    expect(await db.prepare("SELECT equipped_emblem FROM players WHERE player_id = 'player-a'").first()).toEqual({ equipped_emblem: null });
    await grantPlayerEmblem(db, 'player-a', 'beta-og', 'admin', 'restored', 30);
    expect(await ownedPlayerEmblems(db, 'player-a')).toEqual(['beta-og']);
    expect(await db.prepare("SELECT source_kind, source_id FROM player_emblems WHERE player_id = 'player-a'").first())
      .toEqual({ source_kind: 'admin', source_id: 'restored' });
  });

  test('unlocks custom emblems from an online-win completion or existing artwork', async () => {
    await seedPlayer('player-a'); await seedPlayer('player-b');
    expect(await hasCustomEmblemAccess(db, 'player-a')).toBe(false);
    await completeEmblemMission(db, 'player-a', 'win-online-match');
    expect(await hasCustomEmblemAccess(db, 'player-a')).toBe(true);
    await db.prepare(`INSERT INTO custom_emblems
      (player_id, drawing_json, crop_x, crop_y, crop_width, crop_height, border_number, artwork_webp, updated_at)
      VALUES ('player-b', '{}', 0, 0, 1, 1, 1, X'00', 1)`).run();
    expect(await hasCustomEmblemAccess(db, 'player-b')).toBe(true);
  });

  test('awards the prestige emblem when the prestige contest is inactive', async () => {
    await seedPlayer('player-a', MAX_PROGRESS_UNITS);

    expect(await prestigePlayer(db, 'player-a', Date.now())).toBe(1);
    expect(await ownedPlayerEmblems(db, 'player-a')).toEqual(['prestige']);
    expect(await db.prepare("SELECT mission_id FROM emblem_mission_completions WHERE player_id = 'player-a'").first())
      .toEqual({ mission_id: 'prestige' });
    expect(await db.prepare("SELECT placement FROM emblem_contest_placements WHERE player_id = 'player-a'").first()).toBeNull();
  });

  test('repeats prestige and awards ordered contest places once per player', async () => {
    await seedPlayer('player-a', MAX_PROGRESS_UNITS); await seedPlayer('player-b', MAX_PROGRESS_UNITS);
    const now = Date.now();
    await db.prepare("UPDATE emblem_contests SET status = 'active', activated_at = 1 WHERE contest_id = 'first-prestige'").run();
    expect(await prestigePlayer(db, 'player-a', now)).toBe(1);
    expect(await db.prepare("SELECT total_progress_units, prestige_count FROM players WHERE player_id = 'player-a'").first())
      .toEqual({ total_progress_units: 0, prestige_count: 1 });
    await db.prepare("UPDATE players SET total_progress_units = ? WHERE player_id = 'player-a'").bind(MAX_PROGRESS_UNITS).run();
    expect(await prestigePlayer(db, 'player-a', now + 1)).toBe(2);
    expect(await prestigePlayer(db, 'player-b', now + 2)).toBe(1);
    expect(await db.prepare("SELECT placement, emblem_id FROM emblem_contest_placements WHERE player_id = 'player-a'").first())
      .toEqual({ placement: 1, emblem_id: 'first-place' });
    expect(await db.prepare("SELECT placement, emblem_id FROM emblem_contest_placements WHERE player_id = 'player-b'").first())
      .toEqual({ placement: 2, emblem_id: 'second-place' });
    expect(await ownedPlayerEmblems(db, 'player-a')).toEqual(['prestige', 'first-place']);
  });

});
