import { describe, expect, it } from 'vitest';
import * as tablesModule from '../../src/rules/tables';
import * as indexModule from '../../src/rules/index';
import tablesSource from '../../src/rules/tables.ts?raw';
import {
  LEVEL_CAP,
  mangoGearRows,
  kaleConstants,
  onionMonsterRows,
  papayaLevelRows,
  pearTimings,
  ZOOM_CLOSE,
  ZOOM_DEFAULT,
  ZOOM_FAR,
} from '../../src/rules/tables';

// Expected values are typed out here on purpose. They do not come from tables.ts,
// so any drift in the tables fails this file.

describe('level table', () => {
  it('matches the requirements rows', () => {
    expect(papayaLevelRows).toEqual([
      { level: 1, baseHp: 70, strike: 4, xpToNext: 200 },
      { level: 2, baseHp: 80, strike: 5, xpToNext: 400 },
      { level: 3, baseHp: 92, strike: 6, xpToNext: 900 },
      { level: 4, baseHp: 106, strike: 8, xpToNext: 2200 },
      { level: 5, baseHp: 122, strike: 10, xpToNext: 4400 },
      { level: 6, baseHp: 140, strike: 12, xpToNext: null },
    ]);
  });

  it('has a cap of 6', () => {
    expect(LEVEL_CAP).toBe(6);
  });

  it('raises base HP at every level', () => {
    const column = papayaLevelRows.map((row) => row.baseHp);
    expect(column).toEqual([70, 80, 92, 106, 122, 140]);
    for (let i = 1; i < column.length; i += 1) {
      expect(column[i]).toBeGreaterThan(column[i - 1]!);
    }
  });

  it('sums the experience costs from level 1 to level 6 to 8100', () => {
    const costs = papayaLevelRows
      .map((row) => row.xpToNext)
      .filter((cost): cost is number => cost !== null);
    expect(costs).toHaveLength(5);
    expect(costs.reduce((sum, cost) => sum + cost, 0)).toBe(8100);
  });
});

describe('gear table', () => {
  it('matches the forge prices and effects', () => {
    expect(mangoGearRows).toEqual([
      { id: 'shortSword', slot: 'sword', effect: 'strike', amount: 2, price: 900 },
      { id: 'longSword', slot: 'sword', effect: 'strike', amount: 4, price: 2000 },
      { id: 'greatSword', slot: 'sword', effect: 'strike', amount: 7, price: 3500 },
      { id: 'leather', slot: 'armor', effect: 'maxHp', amount: 12, price: 800 },
      { id: 'chain', slot: 'armor', effect: 'maxHp', amount: 24, price: 1800 },
      { id: 'plate', slot: 'armor', effect: 'maxHp', amount: 40, price: 3200 },
    ]);
  });
});

describe('monster table', () => {
  it('matches the three monsters with seven of each', () => {
    expect(onionMonsterRows).toEqual([
      { id: 'wolf', zone: 'green', hp: 20, attack: 5, xp: 2, coins: 4, aggro: 'hit', count: 7, attackGapSeconds: 1 },
      { id: 'bear', zone: 'grey', hp: 45, attack: 9, xp: 5, coins: 10, aggro: 'hit', count: 7, attackGapSeconds: 0.8 },
      {
        id: 'skeleton',
        zone: 'cemetery',
        hp: 72,
        attack: 12,
        xp: 10,
        coins: 18,
        aggro: 'proximity',
        count: 7,
        attackGapSeconds: 0.75,
      },
    ]);
  });

  it('does not carry a skeleton radius on any monster row', () => {
    for (const row of onionMonsterRows) {
      expect(Object.keys(row)).not.toContain('radius');
    }
  });
});

describe('timing and frozen constants', () => {
  it('matches the timing values in seconds', () => {
    expect(pearTimings).toEqual({
      playerAttackGapSeconds: 0.45,
      respawnSeconds: 5,
      coinPickupSeconds: 2.25,
    });
  });

  it('matches the tick, walk speed, chase speed, and melee reach', () => {
    expect(kaleConstants).toEqual({
      tickMs: 100,
      walkSpeedPxPerSec: 120,
      monsterChaseSpeedPxPerSec: 90,
      monsterPatrolSpeedPxPerSec: 11,
      monsterBearPatrolSpeedPxPerSec: 8,
      monsterLeashPx: 250,
      meleeReachPx: 48,
      viewPadPx: 150,
      coinPickupPx: 24,
    });
  });

  it('pins the camera area shares', () => {
    expect(ZOOM_CLOSE).toBe(0.24);
    expect(ZOOM_DEFAULT).toBe(0.45);
    expect(ZOOM_FAR).toBe(0.77);
  });
});

describe('module shape', () => {
  it('exports no skeleton radius', () => {
    for (const name of Object.keys(tablesModule)) {
      expect(name.toLowerCase()).not.toContain('radius');
    }
  });

  it('has no imports', () => {
    expect(tablesSource).not.toMatch(/^\s*import\b/m);
    expect(tablesSource).not.toMatch(/\brequire\s*\(/);
    expect(tablesSource).not.toMatch(/\bfrom\s+['"]/);
  });

  it('index re-exports every table export', () => {
    const exported = Object.keys(indexModule);
    for (const name of Object.keys(tablesModule)) {
      expect(exported).toContain(name);
    }
  });
});
