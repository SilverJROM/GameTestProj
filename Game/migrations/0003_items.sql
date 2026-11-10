-- Quinces a fig owns. One row per item, so the same quince cannot sit in the bag twice.
-- Deleting the avatar deletes these rows with it.
-- The worn quince stays on characters.sword or characters.armor, and only when this table has that item.
CREATE TABLE character_items (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  PRIMARY KEY (character_id, item_id)
);
