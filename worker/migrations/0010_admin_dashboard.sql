CREATE TABLE analytics_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  browser_id TEXT,
  visit_id TEXT,
  player_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX analytics_events_time ON analytics_events(occurred_at DESC);
CREATE INDEX analytics_events_type_time ON analytics_events(event_type, occurred_at DESC);
CREATE INDEX analytics_events_visit ON analytics_events(visit_id);

CREATE TABLE analytics_daily (
  day TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event_type)
);

CREATE TABLE matchmaking_attempts (
  attempt_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  outcome TEXT CHECK (outcome IN ('matched', 'cancelled', 'timed-out')),
  match_id TEXT
);
CREATE INDEX matchmaking_attempts_started ON matchmaking_attempts(started_at DESC);

CREATE TABLE whiteboard_archive (
  operation_id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  player_id TEXT,
  display_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('guest', 'protected', 'system', 'deleted')),
  operation_json TEXT NOT NULL
);
CREATE INDEX whiteboard_archive_time ON whiteboard_archive(occurred_at DESC);
CREATE INDEX whiteboard_archive_sequence ON whiteboard_archive(sequence DESC);
CREATE INDEX whiteboard_archive_player ON whiteboard_archive(player_id, occurred_at DESC);
