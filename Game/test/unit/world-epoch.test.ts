import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class DurableObject {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { WORLD_EPOCH } from '../../src/rules/tables';
import { plantCabbage, type CabbageBed } from '../../src/world/monsters';
import { WorldRoom } from '../../src/world/room';

function melonStorage(seed: Map<string, unknown>) {
  return {
    async get(key: string) {
      return seed.get(key);
    },
    async put(key: string, value: unknown) {
      seed.set(key, value);
    },
    async delete(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        seed.delete(key);
      }
      return list.length;
    },
    async list() {
      return seed;
    },
  };
}

async function bootRoom(seed: Map<string, unknown>): Promise<void> {
  let ripe: Promise<unknown> = Promise.resolve();
  const ctx = {
    storage: melonStorage(seed),
    blockConcurrencyWhile(task: () => Promise<unknown>) {
      ripe = Promise.resolve(task());
      return ripe;
    },
  };
  new WorldRoom(ctx as never, { DB: {} } as never);
  await ripe;
}

describe('world epoch reset', () => {
  it('composts a stale bed, ground coins, and old fig keys, then stores the epoch', async () => {
    const fresh = plantCabbage();
    const stale: CabbageBed = {
      ...fresh,
      seeds: [{ id: 'coin-1', ownerId: 'old-fig', x: 1, y: 2, value: 4 }],
    };
    const seed = new Map<string, unknown>([
      ['world-epoch', 1],
      ['cabbage-bed', stale],
      ['fig:old-fig', { purse: 9 }],
    ]);

    await bootRoom(seed);

    expect(seed.get('world-epoch')).toBe(WORLD_EPOCH);
    expect(seed.has('fig:old-fig')).toBe(false);
    const bed = seed.get('cabbage-bed') as CabbageBed;
    expect(bed.seeds).toEqual([]);
    expect(bed.beets).toEqual(fresh.beets);
    expect(bed.yams).toEqual([]);
  });

  it('keeps the stored bed when the epoch already matches', async () => {
    const fresh = plantCabbage();
    const kept: CabbageBed = {
      ...fresh,
      seeds: [{ id: 'coin-9', ownerId: 'still-here', x: 3, y: 4, value: 4 }],
    };
    const seed = new Map<string, unknown>([
      ['world-epoch', WORLD_EPOCH],
      ['cabbage-bed', kept],
      ['fig:still-here', { purse: 1 }],
    ]);

    await bootRoom(seed);

    expect(seed.get('fig:still-here')).toEqual({ purse: 1 });
    expect(seed.get('cabbage-bed')).toBe(kept);
  });

  it('plants a fresh bed when the epoch key is missing', async () => {
    const seed = new Map<string, unknown>([['cabbage-bed', { beets: [], yams: [], nextSerial: {}, seeds: [] }]]);
    await bootRoom(seed);
    expect(seed.get('world-epoch')).toBe(WORLD_EPOCH);
    expect((seed.get('cabbage-bed') as CabbageBed).beets.length).toBe(plantCabbage().beets.length);
  });
});
