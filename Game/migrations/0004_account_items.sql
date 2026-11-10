-- Shared account bag. Gear belongs to the account; each copy is its own row, so duplicates are kept.
-- worn_by names the avatar wearing that copy (NULL when it sits in the bag). One avatar's worn gear
-- cannot be worn by the other avatar at the same time. Deleting an avatar frees what it wore.
CREATE TABLE account_items (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  worn_by TEXT REFERENCES characters(id) ON DELETE SET NULL
);

CREATE INDEX account_items_account_id ON account_items (account_id);
CREATE INDEX account_items_worn_by ON account_items (worn_by);

-- Move every avatar's bag into its account's bag. Two avatars that both owned the same item keep both copies.
-- A copy is worn by the avatar whose sword or armor slot holds that item.
INSERT INTO account_items (id, account_id, item_id, worn_by)
SELECT lower(hex(randomblob(16))), c.account_id, ci.item_id,
       CASE WHEN c.sword = ci.item_id OR c.armor = ci.item_id THEN c.id ELSE NULL END
FROM character_items ci
JOIN characters c ON c.id = ci.character_id;

DROP TABLE character_items;
