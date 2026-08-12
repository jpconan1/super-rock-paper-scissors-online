PRAGMA foreign_keys = ON;

CREATE TABLE players (
  player_id TEXT PRIMARY KEY,
  guest_secret_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1500,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE seasons (
  season_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'complete')),
  starts_at INTEGER,
  ends_at INTEGER
);

CREATE TABLE season_slots (
  season_id TEXT NOT NULL REFERENCES seasons(season_id),
  slot_id TEXT NOT NULL CHECK (slot_id IN ('slot-1','slot-2','slot-3','slot-4','slot-5','slot-6','slot-7','slot-8','slot-9')),
  variant_id TEXT NOT NULL,
  rules_version INTEGER NOT NULL,
  PRIMARY KEY (season_id, slot_id),
  UNIQUE (season_id, variant_id)
);

CREATE TABLE match_results (
  result_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE,
  season_id TEXT NOT NULL REFERENCES seasons(season_id),
  p1_id TEXT NOT NULL REFERENCES players(player_id),
  p2_id TEXT NOT NULL REFERENCES players(player_id),
  winner_id TEXT REFERENCES players(player_id),
  summary_json TEXT NOT NULL,
  ratings_applied INTEGER NOT NULL DEFAULT 0 CHECK (ratings_applied IN (0, 1)),
  completed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX match_results_season_completed ON match_results(season_id, completed_at DESC);
CREATE INDEX players_rating ON players(rating DESC);
