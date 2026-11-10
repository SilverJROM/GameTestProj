// Click a monster: the fig walks to it and swings on its own attack clock until it dies or the player clicks the ground.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  type MonsterSnapshot,
  type SnapshotMessage,
  type WelcomeMessage,
} from '../../src/protocol';
import { maxHealth, type Hero } from '../../src/rules/logic';
import { skeletonRadiusPx, townSpawn } from '../../src/rules/regions';
import { kaleConstants, onionMonsterRows, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, readCoinLots, saveFacts, saveFactsPair, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';
import { ACCOUNT_COOKIE_NAME } from '../../src/server/cookie';

const guavaSecret = 'coin-session-secret';
const rowOf = (kind: string) => onionMonsterRows.find((row) => row.id === kind)!;
const biteTicksOf = (kind: string) => (rowOf(kind).attackGapSeconds * 1000) / kaleConstants.tickMs;


function grapeFromBeet(beetCookie: string): string {
  return beetCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
}

function mangoText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data as Uint8Array[]).toString('utf8');
  }
  return Buffer.from(data as Uint8Array).toString('utf8');
}

function connectFig(url: string, grape: string): Promise<{ socket: WebSocket; welcome: WelcomeMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${grape}`, [PAPAYA_CLOCK_HEADER]: PAPAYA_CLOCK_RIPE },
    });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('welcome timed out'));
    }, 8_000);
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve({ socket, welcome: JSON.parse(mangoText(data)) as WelcomeMessage });
    });
  });
}

function nextMango(socket: WebSocket): Promise<SnapshotMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('snapshot timed out')), 8_000);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(mangoText(data)) as SnapshotMessage);
    });
  });
}

async function broadcastMango(
  sender: WebSocket,
  other: WebSocket,
  payload: unknown,
): Promise<{ senderSnap: SnapshotMessage; otherSnap: SnapshotMessage }> {
  const senderHeard = nextMango(sender);
  const otherHeard = nextMango(other);
  sender.send(JSON.stringify(payload));
  const [senderSnap, otherSnap] = await Promise.all([senderHeard, otherHeard]);
  return { senderSnap, otherSnap };
}

function bootLemon(orchardDir: string): Promise<Unstable_DevWorker> {
  return unstable_dev('src/server/index.ts', {
    config: 'wrangler.jsonc',
    persistTo: orchardDir,
    vars: { SESSION_SECRET: guavaSecret },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}


function firstBeet(kind: string): MonsterSnapshot {
  const beet = plantCabbage().beets.find((candidate) => candidate.kind === kind)!;
  return { ...beet, swung: false, aggro: false };
}

// A later beet of a kind, so a test that needs an untouched monster does not share the first one.
function nthBeet(kind: string, nth: number): MonsterSnapshot {
  const beet = plantCabbage().beets.filter((candidate) => candidate.kind === kind)[nth]!;
  return { ...beet, swung: false, aggro: false };
}

function heroOf(facts: CharacterFacts): Hero {
  return {
    level: facts.level,
    xp: facts.xp,
    health: facts.hp,
    coins: facts.coins,
    sword: facts.sword,
    armor: facts.armor,
    place: facts.place,
  };
}

const DAY = 86_400_000;

describe('coin expiry', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];
  const fetchWorker = (path: string, init?: RequestInit) => worker!.fetch(`http://town.example${path}`, init as never);

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-coins-'));
    const v3Path = path.join(orchardDir, 'v3');
    const prep = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    try {
      await applyMigrations((prep.env as unknown as { DB: CharacterDb }).DB);
    } finally {
      await prep.dispose();
    }
    worker = await bootLemon(orchardDir);
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    kiwiDb = (proxy.env as unknown as { DB: CharacterDb }).DB;
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    await worker?.stop();
    await proxy?.dispose();
    if (orchardDir.length > 0) await rm(orchardDir, { recursive: true, force: true });
  }, 60_000);

  // An avatar with a chosen purse made of dated lots. The purse and the lots are written straight to the database.
  async function withLots(name: string, lots: readonly { amount: number; ageDays: number }[]) {
    const planted = await plantPlayingFig((p, init) => fetchWorker(p, init), name, 'woman');
    const total = lots.reduce((sum, row) => sum + row.amount, 0);
    await kiwiDb.prepare('UPDATE characters SET coins = ?, place = ? WHERE id = ?').bind(total, 'town', planted.facts.id).run();
    await kiwiDb.prepare('DELETE FROM coin_lots WHERE character_id = ?').bind(planted.facts.id).run();
    const now = Date.now();
    for (const row of lots) {
      await kiwiDb
        .prepare('INSERT INTO coin_lots (id, character_id, amount, picked_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), planted.facts.id, row.amount, Math.round(now - row.ageDays * DAY))
        .run();
    }
    return planted;
  }
  async function join(grape: string) {
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, grape);
    openSockets.push(joined.socket);
    return joined;
  }
  async function ask(socket: WebSocket, payload: unknown): Promise<SnapshotMessage> {
    const heard = nextMango(socket);
    socket.send(JSON.stringify(payload));
    return heard;
  }

  it('coins older than seven days are gone when the avatar joins; younger ones stay', async () => {
    const fig = await withLots('Expire', [
      { amount: 10, ageDays: 8 },
      { amount: 3, ageDays: 7.2 },
      { amount: 5, ageDays: 6.9 },
      { amount: 2, ageDays: 0.5 },
    ]);
    const joined = await join(fig.grape);
    expect(joined.welcome.character.coins).toBe(7);
    const stored = await getById(kiwiDb, fig.facts.id);
    expect(stored!.coins).toBe(7);
    expect((await readCoinLots(kiwiDb, fig.facts.id)).map((row) => row.amount).sort()).toEqual([2, 5]);
    // The page is told when the oldest living coins run out (about 0.1 day from now).
    expect(joined.welcome.character.coinExpiry?.amount).toBe(5);
    expect(joined.welcome.character.coinExpiry!.atMs).toBeGreaterThan(Date.now());
    expect(joined.welcome.character.coinExpiry!.atMs).toBeLessThan(Date.now() + 0.2 * DAY);
  }, 60_000);

  it('a purchase spends the oldest coins first and leaves the younger lot partly spent', async () => {
    const fig = await withLots('Spender', [
      { amount: 14, ageDays: 1 },
      { amount: 4, ageDays: 6 },
    ]);
    const joined = await join(fig.grape);
    expect(joined.welcome.character.coins).toBe(18);
    const snap = await ask(joined.socket, { type: 'buy', item: 'leather' });
    expect(snap.character.coins).toBe(2);
    const lots = await readCoinLots(kiwiDb, fig.facts.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.amount).toBe(2);
    expect(Date.now() - lots[0]!.pickedAtMs).toBeLessThan(1.1 * DAY);
    expect(Date.now() - lots[0]!.pickedAtMs).toBeGreaterThan(0.9 * DAY);
  }, 60_000);

  it('coins that run out while the avatar stays connected vanish on the next sweep', async () => {
    const fig = await withLots('Waiter', [{ amount: 6, ageDays: 1 }]);
    const joined = await join(fig.grape);
    expect(joined.welcome.character.coins).toBe(6);
    // 4 more coins whose seven days are already over (written straight to the database).
    await kiwiDb.prepare('UPDATE characters SET coins = 10 WHERE id = ?').bind(fig.facts.id).run();
    await kiwiDb
      .prepare('INSERT INTO coin_lots (id, character_id, amount, picked_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), fig.facts.id, 4, Date.now() - 8 * DAY)
      .run();
    let snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    for (let tries = 0; tries < 5 && snap.character.coins !== 6; tries += 1) {
      snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    }
    expect(snap.character.coins).toBe(6);
    expect((await getById(kiwiDb, fig.facts.id))!.coins).toBe(6);
  }, 60_000);

  it('a duel transfer takes the loser oldest coins and gives the winner one new lot', async () => {
    const loser = await withLots('Loser', [
      { amount: 6, ageDays: 5 },
      { amount: 6, ageDays: 1 },
    ]);
    const winner = await withLots('Winner', [{ amount: 2, ageDays: 3 }]);
    await saveFactsPair(kiwiDb, { id: loser.facts.id, patch: { coins: 6 } }, { id: winner.facts.id, patch: { coins: 8 } });
    const loserLots = await readCoinLots(kiwiDb, loser.facts.id);
    expect(loserLots.map((row) => row.amount)).toEqual([6]);
    expect(Date.now() - loserLots[0]!.pickedAtMs).toBeLessThan(1.1 * DAY);
    const winnerLots = await readCoinLots(kiwiDb, winner.facts.id);
    expect(winnerLots.map((row) => row.amount).sort()).toEqual([2, 6]);
    const fresh = winnerLots.find((row) => row.amount === 6)!;
    expect(Date.now() - fresh.pickedAtMs).toBeLessThan(60_000);
    expect((await getById(kiwiDb, winner.facts.id))!.coins).toBe(8);
  }, 60_000);

  it('a plain purse write (a pickup) adds one lot dated now', async () => {
    const fig = await withLots('Picker', [{ amount: 3, ageDays: 2 }]);
    await saveFacts(kiwiDb, fig.facts.id, { coins: 7 });
    const lots = await readCoinLots(kiwiDb, fig.facts.id);
    expect(lots.map((row) => row.amount).sort()).toEqual([3, 4]);
    expect(Date.now() - lots.find((row) => row.amount === 4)!.pickedAtMs).toBeLessThan(60_000);
  }, 60_000);
});
