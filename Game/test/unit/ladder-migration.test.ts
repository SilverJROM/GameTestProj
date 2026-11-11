// Migration 0007 recalculates existing avatars onto the hours-long ladder, keeping earned xp, coins and gear.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { baseHp, mangoGearRows, papayaLevelRows } from '../../src/rules';
import { migrationStatements } from '../helpers/orchard';

const OLD_COST = [10, 15, 20, 30, 40];

function run(level: number, xp: number, armor: string | null, hp: number) {
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE characters (id TEXT, level INTEGER, xp INTEGER, hp INTEGER, max_hp INTEGER, coins INTEGER, sword TEXT, armor TEXT, place TEXT)`,
  );
  db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?,?,?)').run('a', level, xp, hp, 999, 77, 'longSword', armor, 'green');
  const sqlText = readFileSync(new URL('../../migrations/0007_ladder_hours.sql', import.meta.url), 'utf8');
  for (const statement of migrationStatements(sqlText)) db.exec(statement);
  return db.prepare('SELECT * FROM characters').get() as Record<string, number | string | null>;
}

// What the TypeScript ladder says for the same earned xp.
function expected(totalXp: number): { level: number; xp: number } {
  let level = 1;
  let xp = totalXp;
  while (level < 6) {
    const cost = papayaLevelRows[level - 1]!.xpToNext!;
    if (xp < cost) break;
    xp -= cost;
    level += 1;
  }
  return { level, xp: level === 6 ? 0 : xp };
}

describe('migration 0007 ladder recalculation', () => {
  it('matches the TypeScript ladder for every old level and leftover', () => {
    for (let level = 1; level <= 6; level += 1) {
      const spent = OLD_COST.slice(0, level - 1).reduce((a, b) => a + b, 0);
      const leftovers = level === 6 ? [0] : [0, 1, OLD_COST[level - 1]! - 1];
      for (const leftover of leftovers) {
        const row = run(level, leftover, null, 1);
        const want = expected(spent + leftover);
        expect({ level: row.level, xp: row.xp }).toEqual(want);
      }
    }
  });

  it('keeps coins, gear and place; max health follows the new level and armor; hp clamps; dead stays dead', () => {
    const plate = mangoGearRows.find((g) => g.id === 'plate')!.amount;
    const worn = run(6, 0, 'plate', 500);
    expect(worn).toMatchObject({ coins: 77, sword: 'longSword', armor: 'plate', place: 'green', level: 1, xp: 115 });
    expect(worn.max_hp).toBe(baseHp(1) + plate);
    expect(worn.hp).toBe(baseHp(1) + plate);
    expect(run(3, 5, null, 0).hp).toBe(0);
    expect(run(1, 3, null, 40).hp).toBe(40);
  });
});
