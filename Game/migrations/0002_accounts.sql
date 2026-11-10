-- Fresh start. Every fig planted before accounts is discarded on purpose.
-- The old characters table is dropped, then planted again under an account.
-- Nothing from before accounts is kept: coins, gear, and experience start over.
DROP TABLE IF EXISTS characters;

-- One row per account. username_key is the lowercased username, so "Bob" and "bob" collide.
-- password_hash is the whole pbkdf2 string (salt and iteration count live inside it).
-- The plain password is never stored.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Same columns as the apple-sized first schema, plus the account that owns the fig.
-- name_key stays unique across the whole world: trimmed and lowercased, so "Bob" and " bob " collide.
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
  y REAL NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);

-- One account's figs are looked up together. A character name stays unique on name_key, not here.
CREATE INDEX characters_account_id ON characters (account_id);
