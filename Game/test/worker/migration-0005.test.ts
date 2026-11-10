// Migration 0005: every existing balance becomes one coin lot that starts its seven days when the migration runs.
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CharacterDb } from '../../src/server/db';
import { migrationStatements } from '../helpers/orchard';

const sqlOf = (file: string) => migrationStatements(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));

describe('migration 0005 coin lots', () => {
  let proxy: PlatformProxy | undefined;
  let db: CharacterDb;
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'fig-mig5-'));
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: path.join(dir, 'v3') } });
    db = (proxy.env as unknown as { DB: CharacterDb }).DB;
  }, 120_000);

  afterAll(async () => {
    await proxy?.dispose();
    if (dir.length > 0) await rm(dir, { recursive: true, force: true });
  }, 60_000);

  it('gives each balance one lot dated at migration time, skips empty purses, and cascades on delete', async () => {
    for (const file of ['0001_init.sql', '0002_accounts.sql', '0003_items.sql', '0004_account_items.sql']) {
      for (const statement of sqlOf(file)) await db.prepare(statement).run();
    }
    await db.prepare("INSERT INTO accounts (id, username, username_key, password_hash, created_at) VALUES ('acc1', 'Pat', 'pat', 'x', 1)").run();
    const char = (id: string, name: string, coins: number) =>
      db
        .prepare(
          "INSERT INTO characters (id, name, name_key, gender, level, xp, hp, max_hp, coins, sword, armor, place, x, y, account_id) VALUES (?, ?, ?, 'woman', 1, 0, 70, 70, ?, NULL, NULL, 'town', 300, 440, 'acc1')",
        )
        .bind(id, name, name.toLowerCase(), coins)
        .run();
    await char('c1', 'Rich', 7);
    await char('c2', 'Broke', 0);
    const before = Date.now();
    for (const statement of sqlOf('0005_coin_lots.sql')) await db.prepare(statement).run();
    const after = Date.now();
    const lots = (await db.prepare('SELECT character_id, amount, picked_at FROM coin_lots ORDER BY character_id').all<{ character_id: string; amount: number; picked_at: number }>()).results;
    expect(lots).toHaveLength(1);
    expect(lots[0]!.character_id).toBe('c1');
    expect(lots[0]!.amount).toBe(7);
    // Dated when the migration ran (whole seconds), not invented from the past.
    expect(lots[0]!.picked_at).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000 - 1000);
    expect(lots[0]!.picked_at).toBeLessThanOrEqual(after + 1000);
    await db.prepare("DELETE FROM characters WHERE id = 'c1'").run();
    const left = await db.prepare('SELECT COUNT(*) AS n FROM coin_lots').first<{ n: number }>();
    expect(Number(left?.n)).toBe(0);
  });
});
