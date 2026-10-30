-- Earlier local databases ran 0007 before the GUMA entitlement was added to it.
-- Keep the table for the player-session claim check on those databases.
CREATE TABLE IF NOT EXISTS legacy_emblem_entitlements (
  provider_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  emblem_id TEXT NOT NULL,
  claimed_player_id TEXT,
  claimed_at INTEGER,
  PRIMARY KEY (provider_id, provider_account_id, emblem_id)
);
