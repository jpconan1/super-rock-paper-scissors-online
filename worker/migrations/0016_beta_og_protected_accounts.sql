INSERT OR IGNORE INTO emblem_mission_completions (player_id, mission_id, completed_at)
SELECT player_id, 'claim-account', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM players WHERE account_type IN ('google', 'email', 'apple');

INSERT OR IGNORE INTO player_emblems (player_id, emblem_id, awarded_at, source_kind, source_id)
SELECT player_id, 'beta-og', CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'mission', 'claim-account'
FROM players WHERE account_type IN ('google', 'email', 'apple');

UPDATE players SET equipped_emblem = 'beta-og'
WHERE account_type IN ('google', 'email', 'apple') AND equipped_emblem IS NULL
  AND EXISTS (SELECT 1 FROM player_emblems WHERE player_emblems.player_id = players.player_id AND emblem_id = 'beta-og');
