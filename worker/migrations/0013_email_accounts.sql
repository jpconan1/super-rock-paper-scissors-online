CREATE TABLE email_auth_challenges (
  challenge_key TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'password')),
  user_id TEXT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  requested_at INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL
);

CREATE INDEX email_auth_challenges_expiry ON email_auth_challenges(expires_at);
CREATE INDEX email_auth_challenges_email ON email_auth_challenges(email, purpose);
