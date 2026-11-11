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
    vars: { SESSION_SECRET: guavaSecret, ALLOW_TEST_CLOCK: '1' },
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
    // 4 of the 10 coins have about 2.5 seconds of their seven days left when the avatar joins.
    const fig = await withLots('Waiter', [
      { amount: 6, ageDays: 1 },
      { amount: 4, ageDays: 7 - 2500 / DAY },
    ]);
    const joined = await join(fig.grape);
    expect(joined.welcome.character.coins).toBe(10);
    await new Promise((resolve) => setTimeout(resolve, 3200));
    let snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    for (let tries = 0; tries < 5 && snap.character.coins !== 6; tries += 1) {
      snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    }
    expect(snap.character.coins).toBe(6);
    expect((await getById(kiwiDb, fig.facts.id))!.coins).toBe(6);
    expect((await readCoinLots(kiwiDb, fig.facts.id)).map((row) => row.amount)).toEqual([6]);
  }, 60_000);

  it('a purchase that overlaps the expiry sweep never brings expired coins back', async () => {
    // 100 good coins and 30 that run out in about 2.5 seconds; the purchase and the sweep arrive together.
    for (let round = 0; round < 3; round += 1) {
      const fig = await withLots(`Overlap${round}`, [
        { amount: 100, ageDays: 1 },
        { amount: 30, ageDays: 7 - 2500 / DAY },
      ]);
      const joined = await join(fig.grape);
      expect(joined.welcome.character.coins).toBe(130);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      joined.socket.send(JSON.stringify({ type: 'ripen', steps: 1 }));
      joined.socket.send(JSON.stringify({ type: 'buy', item: 'leather' }));
      let snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
      for (let tries = 0; tries < 8 && (snap.character.coins !== 84 || !snap.character.items.includes('leather')); tries += 1) {
        snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
      }
      expect(snap.character.coins).toBe(84);
      const stored = await getById(kiwiDb, fig.facts.id);
      expect(stored!.coins).toBe(84);
      const lots = await readCoinLots(kiwiDb, fig.facts.id);
      expect(lots.reduce((sum, row) => sum + row.amount, 0)).toBe(84);
    }
  }, 90_000);

  it('a pickup that overlaps the sweep keeps both the new coins and the expiry', async () => {
    const fig = await withLots('PickOverlap', [
      { amount: 5, ageDays: 1 },
      { amount: 3, ageDays: 7 - 2500 / DAY },
    ]);
    const joined = await join(fig.grape);
    expect(joined.welcome.character.coins).toBe(8);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // A pickup arrives as an amount added; the sweep removes the 3 expired coins. Both must show.
    await saveFacts(kiwiDb, fig.facts.id, { coinsDelta: 4 });
    let snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    for (let tries = 0; tries < 5 && snap.character.coins !== 5; tries += 1) {
      snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    }
    const stored = await getById(kiwiDb, fig.facts.id);
    const lots = await readCoinLots(kiwiDb, fig.facts.id);
    expect(stored!.coins).toBe(lots.reduce((sum, row) => sum + row.amount, 0));
    expect(stored!.coins).toBe(9);
  }, 60_000);

  it('a duel takes coins at random from the loser lots and they reach the winner under their old dates', async () => {
    const loser = await withLots('Loser', [
      { amount: 6, ageDays: 5 },
      { amount: 6, ageDays: 1 },
    ]);
    const winner = await withLots('Winner', [{ amount: 2, ageDays: 3 }]);
    const before = await readCoinLots(kiwiDb, loser.facts.id);
    const stamps = new Set(before.map((row) => row.pickedAtMs));
    // A fixed draw: always the first coin of the pool, so the oldest lot pays first.
    await saveFactsPair(
      kiwiDb,
      { id: loser.facts.id, patch: { coins: 6, coinsDelta: -6, duelPot: 6 } },
      { id: winner.facts.id, patch: { coins: 8, coinsDelta: 6, duelPot: 6 } },
      () => 0,
    );
    const loserLots = await readCoinLots(kiwiDb, loser.facts.id);
    expect(loserLots.reduce((n, r) => n + r.amount, 0)).toBe(6);
    const winnerLots = await readCoinLots(kiwiDb, winner.facts.id);
    expect(winnerLots.reduce((n, r) => n + r.amount, 0)).toBe(8);
    // Every received coin carries a date the loser had; none is dated now.
    const received = winnerLots.filter((row) => row.amount !== 2 || stamps.has(row.pickedAtMs));
    for (const row of winnerLots) {
      if (row.pickedAtMs !== winnerLots.find((r) => r.amount === 2 && !stamps.has(r.pickedAtMs))?.pickedAtMs) {
        expect(stamps.has(row.pickedAtMs)).toBe(true);
      }
    }
    expect(received.length).toBeGreaterThan(0);
    expect((await getById(kiwiDb, winner.facts.id))!.coins).toBe(8);
    expect((await getById(kiwiDb, loser.facts.id))!.coins).toBe(6);
  }, 60_000);

  it('coins that lost a duel and were won keep the old expiry, so the sweep removes them on the old date', async () => {
    const loser = await withLots('Old', [{ amount: 10, ageDays: 6.9 }]);
    const winner = await withLots('Keeper', []);
    await saveFactsPair(
      kiwiDb,
      { id: loser.facts.id, patch: { coinsDelta: -5, duelPot: 5 } },
      { id: winner.facts.id, patch: { coinsDelta: 5, duelPot: 5 } },
      () => 0.5,
    );
    const lots = await readCoinLots(kiwiDb, winner.facts.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.amount).toBe(5);
    expect(Date.now() - lots[0]!.pickedAtMs).toBeGreaterThan(6.8 * DAY);
  }, 60_000);

  it('a duel pot bigger than the live lots moves only live coins and never creates coins', async () => {
    // Purse 12: 8 coins expired a moment ago (not swept yet) and 4 live ones. The strike thought the pot was 6.
    const loser = await withLots('Short', [
      { amount: 8, ageDays: 7.5 },
      { amount: 4, ageDays: 2 },
    ]);
    const winner = await withLots('Gets', []);
    const { moved, expired } = await saveFactsPair(
      kiwiDb,
      { id: loser.facts.id, patch: { coinsDelta: -6, duelPot: 6 } },
      { id: winner.facts.id, patch: { coinsDelta: 6, duelPot: 6 } },
      () => 0.3,
    );
    expect(moved).toBe(4);
    expect(expired).toBe(8);
    expect((await getById(kiwiDb, loser.facts.id))!.coins).toBe(0);
    expect((await getById(kiwiDb, winner.facts.id))!.coins).toBe(4);
    const winnerLots = await readCoinLots(kiwiDb, winner.facts.id);
    expect(winnerLots.reduce((n, r) => n + r.amount, 0)).toBe(4);
    expect(Date.now() - winnerLots[0]!.pickedAtMs).toBeGreaterThan(1.9 * DAY);
    expect(await readCoinLots(kiwiDb, loser.facts.id)).toEqual([]);
  }, 60_000);

  it('a duel pot that is not a whole number or not finite never makes fractional or infinite lots', async () => {
    const loser = await withLots('Odd', [{ amount: 10, ageDays: 2 }]);
    const winner = await withLots('Odd2', []);
    expect(
      (await saveFactsPair(kiwiDb, { id: loser.facts.id, patch: { duelPot: 2.5 } }, { id: winner.facts.id, patch: { duelPot: 2.5 } }, () => 0)).moved,
    ).toBe(2);
    expect(
      (await saveFactsPair(kiwiDb, { id: loser.facts.id, patch: { duelPot: Number.POSITIVE_INFINITY } }, { id: winner.facts.id, patch: { duelPot: Number.POSITIVE_INFINITY } }, () => 0)).moved,
    ).toBe(0);
    const lots = await readCoinLots(kiwiDb, winner.facts.id);
    expect(lots.every((row) => Number.isInteger(row.amount))).toBe(true);
    expect(lots.reduce((n, r) => n + r.amount, 0)).toBe(2);
    expect((await getById(kiwiDb, winner.facts.id))!.coins).toBe(2);
    expect((await getById(kiwiDb, loser.facts.id))!.coins).toBe(8);
  }, 60_000);

  it('coins arriving with a stamp the winner already has join that lot instead of piling up lots', async () => {
    const loser = await withLots('Src', [{ amount: 6, ageDays: 3 }]);
    const before = await readCoinLots(kiwiDb, loser.facts.id);
    const winner = await withLots('Dst', []);
    await kiwiDb.prepare('INSERT INTO coin_lots (id, character_id, amount, picked_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), winner.facts.id, 2, before[0]!.pickedAtMs).run();
    await kiwiDb.prepare('UPDATE characters SET coins = 2 WHERE id = ?').bind(winner.facts.id).run();
    await saveFactsPair(kiwiDb, { id: loser.facts.id, patch: { duelPot: 3 } }, { id: winner.facts.id, patch: { duelPot: 3 } }, () => 0);
    const lots = await readCoinLots(kiwiDb, winner.facts.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.amount).toBe(5);
  }, 60_000);

  it('a plain purse write (a pickup) adds one lot dated now', async () => {
    const fig = await withLots('Picker', [{ amount: 3, ageDays: 2 }]);
    await saveFacts(kiwiDb, fig.facts.id, { coins: 7 });
    const lots = await readCoinLots(kiwiDb, fig.facts.id);
    expect(lots.map((row) => row.amount).sort()).toEqual([3, 4]);
    expect(Date.now() - lots.find((row) => row.amount === 4)!.pickedAtMs).toBeLessThan(60_000);
  }, 60_000);

  it('coins whose seven days just ended cannot pay for a purchase, even before the next sweep', async () => {
    const fig = await withLots('Stale', [
      { amount: 10, ageDays: 1 },
      { amount: 30, ageDays: 7 - 2500 / DAY },
    ]);
    const joined = await join(fig.grape);
    expect(joined.welcome.character.coins).toBe(40);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // Leather costs 16: only 10 live coins are left, so the purchase is refused.
    let snap = await ask(joined.socket, { type: 'buy', item: 'leather' });
    for (let tries = 0; tries < 4 && snap.character.coins !== 10; tries += 1) {
      snap = await ask(joined.socket, { type: 'ripen', steps: 1 });
    }
    expect(snap.character.items).not.toContain('leather');
    expect(snap.character.coins).toBe(10);
    const stored = await getById(kiwiDb, fig.facts.id);
    expect(stored!.coins).toBe(10);
    expect(stored!.items).not.toContain('leather');
  }, 60_000);
});
