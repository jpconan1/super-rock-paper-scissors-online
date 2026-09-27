ALTER TABLE players ADD COLUMN unlock_all_classes INTEGER NOT NULL DEFAULT 0
  CHECK (unlock_all_classes IN (0, 1));
