-- Intentional pre-release reset for fixed account types and readable player IDs.
DELETE FROM test_players;
DELETE FROM local_match_grants;
DELETE FROM local_progress_awards;
DELETE FROM match_results;
DELETE FROM analytics_events;
DELETE FROM analytics_daily;
DELETE FROM matchmaking_attempts;
DELETE FROM whiteboard_archive;
DELETE FROM email_signup_pending;
DELETE FROM email_signup_rate_limits;
DELETE FROM account_deletion_challenges;
DELETE FROM verification;
DELETE FROM session;
DELETE FROM account;
DELETE FROM user;
DELETE FROM players;

ALTER TABLE players ADD COLUMN account_type TEXT DEFAULT 'guest'
  CHECK (account_type IS NULL OR account_type IN ('guest', 'google', 'apple', 'email'));
