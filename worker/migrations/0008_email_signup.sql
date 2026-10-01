ALTER TABLE players ADD COLUMN terms_version TEXT;
ALTER TABLE players ADD COLUMN privacy_version TEXT;
ALTER TABLE players ADD COLUMN legal_accepted_at INTEGER;

CREATE TABLE email_signup_pending (
  anonymous_user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX email_signup_pending_expiry ON email_signup_pending(expires_at);

CREATE TABLE email_signup_rate_limits (
  rate_key TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);
CREATE INDEX email_signup_rate_expiry ON email_signup_rate_limits(window_started_at);
