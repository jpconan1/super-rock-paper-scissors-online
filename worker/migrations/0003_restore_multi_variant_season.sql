DELETE FROM season_slots WHERE season_id = 'public-abm-test';

INSERT INTO season_slots (season_id, slot_id, variant_id, rules_version) VALUES
  ('public-abm-test', 'slot-1', 'dummy-rps', 1),
  ('public-abm-test', 'slot-2', 'dummy-dragon-spear', 1),
  ('public-abm-test', 'slot-3', 'dummy-pick-two', 1),
  ('public-abm-test', 'slot-4', 'dummy-gkf', 1),
  ('public-abm-test', 'slot-5', 'attack-block-mana', 1),
  ('public-abm-test', 'slot-6', 'dummy-fireball-war', 1),
  ('public-abm-test', 'slot-7', 'dummy-rps-rpg', 1),
  ('public-abm-test', 'slot-8', 'dummy-rps-poker', 1),
  ('public-abm-test', 'slot-9', 'dummy-tap-tap-shoot', 1);
