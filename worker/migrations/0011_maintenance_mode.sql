CREATE TABLE maintenance_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 0,
  enabled_at INTEGER,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
INSERT INTO maintenance_state (singleton_id, enabled, version, updated_at) VALUES (1, 0, 0, unixepoch() * 1000);

CREATE TABLE test_players (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

ALTER TABLE analytics_events ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));
ALTER TABLE whiteboard_archive ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1));
