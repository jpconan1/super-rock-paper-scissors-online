-- Intentional pre-release auth reset. No legacy guest credentials survive.
-- Keep one Google identity entitlement before the old auth rows are removed.
CREATE TABLE legacy_emblem_entitlements (
  provider_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  emblem_id TEXT NOT NULL,
  claimed_player_id TEXT,
  claimed_at INTEGER,
  PRIMARY KEY (provider_id, provider_account_id, emblem_id)
);

INSERT INTO legacy_emblem_entitlements (provider_id, provider_account_id, emblem_id)
SELECT a.providerId, a.accountId, 'guma'
FROM players p JOIN account a ON a.userId = p.auth_user_id
WHERE p.player_id = '86136ceb-a00a-4e52-8037-d9cbec09be65' AND a.providerId = 'google';

DELETE FROM verification;
DELETE FROM session;
DELETE FROM account;
DELETE FROM user;
DELETE FROM local_match_grants;
DELETE FROM local_progress_awards;

UPDATE players
SET display_name = 'Deleted player', auth_user_id = NULL, rating = 1500,
    total_progress_units = 0, unlock_all_classes = 0, updated_at = unixepoch() * 1000;

DELETE FROM players
WHERE NOT EXISTS (SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id);

ALTER TABLE players DROP COLUMN guest_secret_hash;
