CREATE TABLE local_progress_awards (
  result_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(player_id),
  gained_progress_units INTEGER NOT NULL CHECK (gained_progress_units >= 0),
  award_json TEXT NOT NULL,
  progress_applied INTEGER NOT NULL DEFAULT 0 CHECK (progress_applied IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX local_progress_awards_player ON local_progress_awards(player_id, created_at DESC);
