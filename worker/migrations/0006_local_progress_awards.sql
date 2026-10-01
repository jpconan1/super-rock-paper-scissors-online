CREATE TABLE local_progress_awards (
  result_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(player_id),
  kind TEXT NOT NULL CHECK (kind IN ('tutorial', 'computer')),
  gained_progress_units INTEGER NOT NULL CHECK (gained_progress_units >= 0),
  award_json TEXT NOT NULL,
  full_reward INTEGER NOT NULL CHECK (full_reward IN (0, 1)),
  progress_applied INTEGER NOT NULL DEFAULT 0 CHECK (progress_applied IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX local_progress_awards_player ON local_progress_awards(player_id, kind, created_at DESC);

CREATE TABLE local_match_grants (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('tutorial', 'computer')),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER
);
