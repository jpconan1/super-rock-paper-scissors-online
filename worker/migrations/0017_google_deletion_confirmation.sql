CREATE TABLE google_deletion_confirmations (
  state TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER
);
CREATE INDEX google_deletion_confirmations_session ON google_deletion_confirmations(session_id);
CREATE INDEX google_deletion_confirmations_expiry ON google_deletion_confirmations(expires_at);
