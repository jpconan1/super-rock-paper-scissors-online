INSERT OR IGNORE INTO seasons (season_id, name, status, starts_at)
VALUES ('public-abm-test', 'Public ABM Test', 'active', unixepoch() * 1000);

INSERT OR IGNORE INTO season_slots (season_id, slot_id, variant_id, rules_version)
VALUES ('public-abm-test', 'slot-1', 'attack-block-mana', 1);
