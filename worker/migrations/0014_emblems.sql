ALTER TABLE players ADD COLUMN equipped_emblem TEXT;
ALTER TABLE players ADD COLUMN prestige_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE player_emblems (
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  emblem_id TEXT NOT NULL,
  awarded_at INTEGER NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('mission', 'contest', 'admin')),
  source_id TEXT,
  PRIMARY KEY (player_id, emblem_id)
);
CREATE INDEX player_emblems_emblem ON player_emblems(emblem_id, awarded_at);

CREATE TABLE emblem_mission_completions (
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, mission_id)
);

CREATE TABLE unlock_all_class_finishes (
  placement INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL UNIQUE REFERENCES players(player_id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL
);

CREATE TABLE custom_emblems (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  drawing_json TEXT NOT NULL,
  crop_x REAL NOT NULL,
  crop_y REAL NOT NULL,
  crop_width REAL NOT NULL,
  crop_height REAL NOT NULL,
  border_number INTEGER NOT NULL CHECK (border_number BETWEEN 1 AND 28),
  artwork_webp BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE emblem_contests (
  contest_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('inactive', 'active', 'closed')),
  activated_at INTEGER,
  closed_at INTEGER,
  capacity INTEGER NOT NULL
);

CREATE TABLE emblem_contest_placements (
  contest_id TEXT NOT NULL REFERENCES emblem_contests(contest_id),
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  placement INTEGER NOT NULL,
  prestige_count INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  emblem_id TEXT NOT NULL,
  PRIMARY KEY (contest_id, player_id),
  UNIQUE (contest_id, placement),
  UNIQUE (contest_id, emblem_id)
);

INSERT INTO emblem_contests VALUES ('first-prestige', 'inactive', NULL, NULL, 10);
