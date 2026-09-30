-- Intentional pre-release auth reset. No legacy guest credentials survive.
DELETE FROM verification;
DELETE FROM session;
DELETE FROM account;
DELETE FROM user;
DELETE FROM local_progress_awards;

UPDATE players
SET display_name = 'Deleted player', auth_user_id = NULL, rating = 1500,
    total_progress_units = 0, unlock_all_classes = 0, updated_at = unixepoch() * 1000;

DELETE FROM players
WHERE NOT EXISTS (SELECT 1 FROM match_results WHERE p1_id = players.player_id OR p2_id = players.player_id);

ALTER TABLE players DROP COLUMN guest_secret_hash;
