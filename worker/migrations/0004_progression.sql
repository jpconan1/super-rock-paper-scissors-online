ALTER TABLE players ADD COLUMN total_progress_units INTEGER NOT NULL DEFAULT 0
  CHECK (total_progress_units >= 0 AND total_progress_units <= 200000);

ALTER TABLE match_results ADD COLUMN progress_applied INTEGER NOT NULL DEFAULT 1
  CHECK (progress_applied IN (0, 1));

ALTER TABLE match_results ADD COLUMN p1_progress_award INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_results ADD COLUMN p2_progress_award INTEGER NOT NULL DEFAULT 0;
