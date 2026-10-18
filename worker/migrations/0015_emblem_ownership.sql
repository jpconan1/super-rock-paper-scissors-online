ALTER TABLE players RENAME COLUMN equipped_emblem TO legacy_equipped_emblem;
ALTER TABLE players ADD COLUMN equipped_emblem TEXT;
ALTER TABLE players DROP COLUMN legacy_equipped_emblem;

CREATE TABLE player_emblems (
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  emblem_id TEXT NOT NULL,
  award_source TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  awarded_at INTEGER NOT NULL,
  awarded_by TEXT,
  award_reason TEXT,
  revoked_at INTEGER,
  revoked_by TEXT,
  revocation_reason TEXT,
  PRIMARY KEY (player_id, emblem_id)
);
CREATE INDEX player_emblems_emblem ON player_emblems(emblem_id, awarded_at);

CREATE TABLE emblem_mission_completions (
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  reward_emblem_id TEXT,
  placement INTEGER,
  PRIMARY KEY (player_id, mission_id),
  UNIQUE (mission_id, placement)
);

CREATE TABLE unlock_all_class_finishes (
  placement INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL UNIQUE REFERENCES players(player_id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL
);
