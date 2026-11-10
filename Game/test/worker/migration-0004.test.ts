// Migration 0004 moves every avatar's bag into the account's shared bag and keeps duplicates.
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CharacterDb } from '../../src/server/db';
import { migrationStatements } from '../helpers/orchard';

const sqlOf = (file: string) => migrationStatements(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));

describe('migration 0004 shared account bag', () => {
  let proxy: PlatformProxy | undefined;
  let db: CharacterDb;
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'fig-mig4-'));
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: path.join(dir, 'v3') } });
    db = (proxy.env as unknown as { DB: CharacterDb }).DB;
  }, 120_000);

  afterAll(async () => {
    await proxy?.dispose();
    if (dir.length > 0) await rm(dir, { recursive: true, force: true });
  }, 60_000);

  it('moves per-avatar bags into the account bag, keeps duplicates, and records who wears what', async () => {
    for (const file of ['0001_init.sql', '0002_accounts.sql', '0003_items.sql']) {
      for (const statement of sqlOf(file)) await db.prepare(statement).run();
    }
    await db.prepare("INSERT INTO accounts (id, username, username_key, password_hash, created_at) VALUES ('acc1', 'Pat', 'pat', 'x', 1)").run();
    const char = (id: string, name: string, sword: string | null, armor: string | null) =>
      db
        .prepare(
          "INSERT INTO characters (id, name, name_key, gender, level, xp, hp, max_hp, coins, sword, armor, place, x, y, account_id) VALUES (?, ?, ?, 'woman', 1, 0, 70, 70, 0, ?, ?, 'town', 300, 440, 'acc1')",
        )
        .bind(id, name, name.toLowerCase(), sword, armor)
        .run();
    await char('c1', 'One', 'shortSword', null);
    await char('c2', 'Two', null, 'leather');
    const give = (id: string, item: string) => db.prepare('INSERT INTO character_items (character_id, item_id) VALUES (?, ?)').bind(id, item).run();
    await give('c1', 'shortSword');
    await give('c1', 'leather');
    await give('c2', 'shortSword');
    await give('c2', 'leather');
    for (const statement of sqlOf('0004_account_items.sql')) await db.prepare(statement).run();
    const rows = (await db.prepare('SELECT item_id, worn_by FROM account_items WHERE account_id = ? ORDER BY item_id, worn_by').bind('acc1').all<{ item_id: string; worn_by: string | null }>()).results;
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.item_id === 'shortSword').map((row) => row.worn_by)).toEqual(expect.arrayContaining([null, 'c1']));
    expect(rows.filter((row) => row.item_id === 'leather').map((row) => row.worn_by)).toEqual(expect.arrayContaining([null, 'c2']));
    const gone = await db.prepare("SELECT name FROM sqlite_master WHERE name = 'character_items'").first();
    expect(gone).toBeNull();
    // Deleting an avatar frees what it wore.
    await db.prepare("DELETE FROM characters WHERE id = 'c1'").run();
    const freed = await db.prepare("SELECT COUNT(*) AS n FROM account_items WHERE worn_by IS NOT NULL").first<{ n: number }>();
    expect(Number(freed?.n)).toBe(1);
  });
});
