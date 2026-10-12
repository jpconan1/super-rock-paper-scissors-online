CREATE TABLE account_deletion_challenges (
  user_id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0 AND failed_attempts <= 3),
  requested_at INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL
);

CREATE INDEX account_deletion_challenges_expiry ON account_deletion_challenges(expires_at);
