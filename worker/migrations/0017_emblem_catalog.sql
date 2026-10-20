CREATE TABLE emblem_catalog (
  emblem_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  frame_count INTEGER,
  player_visible INTEGER NOT NULL DEFAULT 1,
  ownable INTEGER NOT NULL DEFAULT 1,
  system_only INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL
);

CREATE TABLE emblem_missions (
  mission_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  available_from INTEGER NOT NULL,
  available_until INTEGER,
  reward_kind TEXT NOT NULL CHECK (reward_kind IN ('emblem', 'feature', 'placement-emblem', 'none')),
  reward_reference TEXT,
  sort_order INTEGER NOT NULL
);

CREATE TABLE emblem_contests (
  contest_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES emblem_missions(mission_id),
  status TEXT NOT NULL CHECK (status IN ('inactive', 'active', 'closed')),
  activated_at INTEGER,
  closed_at INTEGER,
  capacity INTEGER NOT NULL
);

CREATE TABLE emblem_contest_rewards (
  contest_id TEXT NOT NULL REFERENCES emblem_contests(contest_id),
  placement INTEGER NOT NULL,
  emblem_id TEXT NOT NULL REFERENCES emblem_catalog(emblem_id),
  PRIMARY KEY (contest_id, placement),
  UNIQUE (contest_id, emblem_id)
);

CREATE TABLE emblem_contest_placements (
  contest_id TEXT NOT NULL REFERENCES emblem_contests(contest_id),
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  placement INTEGER NOT NULL,
  prestige_count INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  emblem_id TEXT NOT NULL REFERENCES emblem_catalog(emblem_id),
  PRIMARY KEY (contest_id, player_id),
  UNIQUE (contest_id, placement)
);

ALTER TABLE players ADD COLUMN prestige_count INTEGER NOT NULL DEFAULT 0;

INSERT INTO emblem_catalog VALUES
  ('beta-og', 'Beta OG', '/emblems/beta-og-sheet.webp', NULL, 1, 1, 0, 1, 10),
  ('new-player', 'New Player', '/emblems/new-player-sheet.webp', NULL, 1, 1, 0, 1, 20),
  ('prestige', 'Prestige', '/emblems/prestige-sheet.webp', NULL, 1, 1, 0, 1, 30),
  ('first-place', '1st Place', '/emblems/first-place-sheet.webp', 18, 1, 1, 0, 1, 40),
  ('second-place', '2nd Place', '/emblems/second-place-sheet.webp', 18, 1, 1, 0, 1, 41),
  ('third-place', '3rd Place', '/emblems/third-place-sheet.webp', 18, 1, 1, 0, 1, 42),
  ('fourth-place', '4th Place', '/emblems/fourth-place-sheet.webp', 18, 1, 1, 0, 1, 43),
  ('fifth-place', '5th Place', '/emblems/fifth-place-sheet.webp', 18, 1, 1, 0, 1, 44),
  ('sixth-place', '6th Place', '/emblems/sixth-place-sheet.webp', 18, 1, 1, 0, 1, 45),
  ('seventh-place', '7th Place', '/emblems/seventh-place-sheet.webp', 18, 1, 1, 0, 1, 46),
  ('eighth-place', '8th Place', '/emblems/eighth-place-sheet.webp', 18, 1, 1, 0, 1, 47),
  ('ninth-place', '9th Place', '/emblems/ninth-place-sheet.webp', 18, 1, 1, 0, 1, 48),
  ('tenth-place', '10th Place', '/emblems/tenth-place-sheet.webp', 18, 1, 1, 0, 1, 49),
  ('computer', 'Computer', '/emblems/computer-sheet.webp', NULL, 0, 0, 1, 1, 100);

INSERT INTO emblem_missions VALUES
  ('finish-tutorial', 'Finish The Tutorial', 'Complete one tutorial match.', 1, unixepoch('now') * 1000, NULL, 'emblem', 'new-player', 10),
  ('claim-account', 'Claim Your Account', 'Protect your guest account.', 1, unixepoch('now') * 1000, NULL, 'emblem', 'beta-og', 20),
  ('win-online-match', 'Win Online', 'Win one online match.', 1, unixepoch('now') * 1000, NULL, 'feature', 'custom-emblem', 30),
  ('prestige', 'Prestige', 'Complete progression and prestige.', 0, unixepoch('now') * 1000, NULL, 'emblem', 'prestige', 40),
  ('prestige-contest', 'Prestige Contest', 'Be among the first ten to prestige.', 0, unixepoch('now') * 1000, NULL, 'placement-emblem', 'first-prestige', 50);

INSERT INTO emblem_contests VALUES ('first-prestige', 'prestige-contest', 'inactive', NULL, NULL, 10);
INSERT INTO emblem_contest_rewards VALUES
  ('first-prestige', 1, 'first-place'), ('first-prestige', 2, 'second-place'),
  ('first-prestige', 3, 'third-place'), ('first-prestige', 4, 'fourth-place'),
  ('first-prestige', 5, 'fifth-place'), ('first-prestige', 6, 'sixth-place'),
  ('first-prestige', 7, 'seventh-place'), ('first-prestige', 8, 'eighth-place'),
  ('first-prestige', 9, 'ninth-place'), ('first-prestige', 10, 'tenth-place');

UPDATE players SET equipped_emblem = NULL WHERE equipped_emblem IN ('prestige', 'first-place')
  AND NOT EXISTS (SELECT 1 FROM player_emblems pe WHERE pe.player_id = players.player_id
    AND pe.emblem_id = players.equipped_emblem AND pe.revoked_at IS NULL);
