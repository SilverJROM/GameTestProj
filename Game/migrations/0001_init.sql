-- Apple-sized first schema: one row per character.
-- These are the facts that must survive a reload: level, experience, health, purse, gear, place, and position.
-- name_key is the trimmed, lowercased name, so "Bob" and " bob " collide on the UNIQUE index.
CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  gender TEXT NOT NULL CHECK (gender IN ('woman', 'man')),
  level INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  -- Gear ids (for example a banana-yellow short sword or a pear-shaped plate). NULL means nothing worn.
  sword TEXT,
  armor TEXT,
  -- Zone name: town, green, grey, or cemetery.
  place TEXT NOT NULL,
  -- Picture pixels, x to the right and y down.
  x REAL NOT NULL,
  y REAL NOT NULL
);
