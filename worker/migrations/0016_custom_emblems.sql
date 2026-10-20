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
