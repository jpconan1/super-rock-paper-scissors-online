DELETE FROM season_slots
WHERE season_id = 'public-abm-test' AND slot_id = 'slot-1';

INSERT INTO season_slots (season_id, slot_id, variant_id, rules_version)
VALUES ('public-abm-test', 'slot-1', 'rock-paper-scissors', 1);
