ALTER TABLE players ADD COLUMN equipped_emblem TEXT NOT NULL DEFAULT 'beta-og'
  CHECK (equipped_emblem IN ('beta-og', 'new-player', 'computer'));
