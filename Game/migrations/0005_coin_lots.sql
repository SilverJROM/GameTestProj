-- Coins expire seven days after they are picked up. Each pickup is its own lot, so the oldest coins
-- are spent first and the oldest expire first. The purse on characters.coins stays the total of the lots.
CREATE TABLE coin_lots (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  -- Milliseconds since 1970 when these coins were picked up.
  picked_at INTEGER NOT NULL
);

CREATE INDEX coin_lots_character ON coin_lots (character_id, picked_at);

-- Balances that exist today have no pickup dates, so none are invented: each becomes one lot that
-- starts its seven days when this migration runs.
INSERT INTO coin_lots (id, character_id, amount, picked_at)
SELECT lower(hex(randomblob(16))), id, coins, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM characters
WHERE coins > 0;
