import { afterEach, expect, test } from 'vitest';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { claimLegacyGoogleEmblem, revokePlayerEmblem } from '../worker/playerEmblems';
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

const migrations = [migration1, migration2, migration3, migration4, migration5, migration6, migration7,
  migration8, migration9, migration10, migration11, migration12, migration13, migration14];
let miniflare: Miniflare | undefined;

afterEach(async () => { await miniflare?.dispose(); miniflare = undefined; });

test('captures only GUMA’s old Google identity and grants its emblem once after the reset', async () => {
  miniflare = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-08-12',
    d1Databases: { DB: `guma-${crypto.randomUUID()}` },
  }));
  const db = await miniflare.getD1Database('DB');
  const apply = async (sql: string) => {
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').map((part) => part.trim()).filter(Boolean)) {
      if (!statement.startsWith('PRAGMA ')) await db.prepare(statement).run();
    }
  };
  for (const migration of migrations.slice(0, 3)) await apply(migration);
  await db.batch([
    db.prepare("INSERT INTO players (player_id, guest_secret_hash, display_name, created_at, updated_at, auth_user_id) VALUES ('86136ceb-a00a-4e52-8037-d9cbec09be65', 'old', 'GUMA', 1, 1, 'old-google')"),
    db.prepare("INSERT INTO players (player_id, guest_secret_hash, display_name, created_at, updated_at, auth_user_id) VALUES ('old-guest', 'old', 'GUMA', 1, 1, 'old-guest-user')"),
    db.prepare("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('old-google', 'GUMA', 'old@example.test', 1, 1)"),
    db.prepare("INSERT INTO user (id, name, email, createdAt, updatedAt, isAnonymous) VALUES ('old-guest-user', 'GUMA', 'guest@example.test', 1, 1, 1)"),
    db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('old-account', 'stable-google-subject', 'google', 'old-google', 1, 1)"),
  ]);
  for (const migration of migrations.slice(3)) await apply(migration);
  expect(await db.prepare('SELECT provider_id, provider_account_id, emblem_id, claimed_player_id FROM legacy_emblem_entitlements').first())
    .toEqual({ provider_id: 'google', provider_account_id: 'stable-google-subject', emblem_id: 'guma', claimed_player_id: null });
  await db.batch([
    db.prepare("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('new-google', 'GUMA', 'new@example.test', 2, 2)"),
    db.prepare("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('other-google', 'Other', 'other@example.test', 2, 2)"),
    db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('new-account', 'stable-google-subject', 'google', 'new-google', 2, 2)"),
    db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('other-account', 'other-subject', 'google', 'other-google', 2, 2)"),
    db.prepare("INSERT INTO players (player_id, display_name, created_at, updated_at, auth_user_id, account_type) VALUES ('new-guma-id', 'GUMA', 2, 2, 'new-google', 'google')"),
    db.prepare("INSERT INTO players (player_id, display_name, created_at, updated_at, auth_user_id, account_type) VALUES ('other-id', 'GUMA', 2, 2, 'other-google', 'google')"),
  ]);
  await claimLegacyGoogleEmblem(db, 'other-google', 'other-id', 3);
  expect(await db.prepare("SELECT emblem_id FROM player_emblems WHERE player_id = 'other-id'").first()).toBeNull();
  await claimLegacyGoogleEmblem(db, 'new-google', 'new-guma-id', 4);
  await claimLegacyGoogleEmblem(db, 'new-google', 'new-guma-id', 5);
  expect(await db.prepare("SELECT emblem_id FROM player_emblems WHERE player_id = 'new-guma-id'").first()).toEqual({ emblem_id: 'guma' });
  expect(await db.prepare("SELECT equipped_emblem FROM players WHERE player_id = 'new-guma-id'").first()).toEqual({ equipped_emblem: 'guma' });
  expect(await db.prepare('SELECT claimed_player_id, claimed_at FROM legacy_emblem_entitlements').first())
    .toEqual({ claimed_player_id: 'new-guma-id', claimed_at: 4 });
  await revokePlayerEmblem(db, 'new-guma-id', 'guma', 6);
  await claimLegacyGoogleEmblem(db, 'new-google', 'new-guma-id', 7);
  expect(await db.prepare("SELECT emblem_id FROM player_emblems WHERE player_id = 'new-guma-id'").first()).toBeNull();
});
