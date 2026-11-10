// Axolotl pickup on the injected papaya clock: killer only, the whole seed value per pearTimings.coinPickupSeconds.
// Nothing here naps for a tick; ripen mangos sprout the clock.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  type SnapshotMessage,
  type WelcomeMessage,
} from '../../src/protocol';
import { kaleConstants, onionMonsterRows, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'pickup-session-secret';
const rowOf = (kind: string) => onionMonsterRows.find((row) => row.id === kind)!;
const wolfRow = rowOf('wolf');
// The dig starts at the first tick's start, so N ticks elapse N * tickMs. Pay on the tick that reaches the duration.
const ticksBeforePay = Math.ceil((pearTimings.coinPickupSeconds * 1000) / kaleConstants.tickMs) - 1;
const swingTicks = Math.ceil((pearTimings.playerAttackGapSeconds * 1000) / kaleConstants.tickMs);


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



const wolves = () => plantCabbage().beets.filter((beet) => beet.kind === 'wolf');

describe('axolotl coin pickup', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-pickup-'));
    const v3Path = path.join(orchardDir, 'v3');
    const prep = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
    } finally {
      await prep.dispose();
    }
    worker = await bootLemon(orchardDir);
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    kiwiDb = (proxy.env as unknown as { DB: CharacterDb }).DB;
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    await worker?.stop();
    await proxy?.dispose();
    if (orchardDir.length > 0) {
      await rm(orchardDir, { recursive: true, force: true });
    }
  }, 60_000);

  async function joinFig(name: string, patch: Partial<CharacterFacts>) {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, 'woman');
    const facts = planted.facts;
    const grape = planted.grape;
    await saveFacts(kiwiDb, facts.id, patch);
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, grape);
    openSockets.push(joined.socket);
    return { id: facts.id, grape, socket: joined.socket, welcome: joined.welcome };
  }

  async function ask(socket: WebSocket, payload: unknown): Promise<SnapshotMessage> {
    const heard = nextMango(socket);
    socket.send(JSON.stringify(payload));
    return heard;
  }

  const ripen = (socket: WebSocket, steps: number) => ask(socket, { type: 'ripen', steps });
  const coinsOf = async (id: string) => (await getById(kiwiDb, id))!.coins;
  const seedsOf = (snap: SnapshotMessage, ownerId: string) =>
    snap.snapshot.coins.filter((seed) => seed.ownerId === ownerId);

  // Hit the wolf on the rules gap until it falls. The last hit's clock time is the drop time.
  async function fellWolf(socket: WebSocket, wolfId: string): Promise<SnapshotMessage> {
    for (let hit = 0; hit < 40; hit += 1) {
      const snap = await ask(socket, { type: 'attack', monsterId: wolfId });
      if (!snap.snapshot.monsters.some((beet) => beet.id === wolfId)) {
        return snap;
      }
      await ripen(socket, swingTicks);
    }
    throw new Error('wolf did not fall');
  }

  const strong = { level: 6, hp: 80, maxHp: 80, place: 'green' as const, coins: 0 };

  it('pays the whole seed value after the pickup duration, not before, and the beside player gains nothing', async () => {
    const wolf = wolves()[0]!;
    const owner = await joinFig('Leek', { ...strong, x: wolf.x, y: wolf.y });
    const beside = await joinFig('Turnip', { ...strong, x: wolf.x, y: wolf.y, coins: 3 });
    const dropped = await fellWolf(owner.socket, wolf.id);
    const owned = seedsOf(dropped, owner.id);
    expect(owned).toHaveLength(1);
    expect(owned[0]).toMatchObject({ ownerId: owner.id, x: wolf.x, y: wolf.y, value: wolfRow.coins });
    expect(dropped.snapshot.pickups).toEqual([]);

    // Walk away during the dig. The timer keeps running from the drop, not from the fig's feet.
    let snap = await ripen(owner.socket, 5);
    expect(snap.character.coins).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(1);
    snap = await ask(owner.socket, { type: 'move', x: wolf.x + 180, y: wolf.y + 40 });
    expect(snap.character.coins).toBe(0);

    snap = await ripen(owner.socket, ticksBeforePay - 5);
    expect(snap.character.coins).toBe(0);
    expect(await coinsOf(owner.id)).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(1);
    expect(seedsOf(snap, owner.id)[0]!.value).toBe(wolfRow.coins);
    expect(snap.snapshot.pickups).toHaveLength(1);
    expect(snap.snapshot.pickups[0]).toMatchObject({ ownerId: owner.id, x: wolf.x, y: wolf.y });
    expect(snap.snapshot.pickups[0]!.elapsedSeconds).toBeLessThan(pearTimings.coinPickupSeconds);
    expect(snap.snapshot.pickups.every((dig) => dig.ownerId === owner.id)).toBe(true);

    snap = await ripen(owner.socket, 1);
    expect(snap.character.coins).toBe(wolfRow.coins);
    expect(await coinsOf(owner.id)).toBe(wolfRow.coins);
    expect(seedsOf(snap, owner.id)).toHaveLength(0);
    expect(snap.snapshot.pickups).toEqual([]);
    expect(await coinsOf(beside.id)).toBe(3);
    snap = await ripen(owner.socket, ticksBeforePay + 1);
    expect(await coinsOf(owner.id)).toBe(wolfRow.coins);
    expect(await coinsOf(beside.id)).toBe(3);
    expect(snap.snapshot.pickups).toEqual([]);
  }, 120_000);

  it('keeps the coin on the ground when the owner leaves, and restarts the timer on return', async () => {
    const wolf = wolves()[1]!;
    const owner = await joinFig('Beet', { ...strong, x: wolf.x, y: wolf.y });
    const waiter = await joinFig('Kale', { ...strong, x: wolf.x + 400, y: wolf.y });
    const dropped = await fellWolf(owner.socket, wolf.id);
    expect(seedsOf(dropped, owner.id)).toHaveLength(1);
    expect(seedsOf(dropped, owner.id)[0]!.value).toBe(wolfRow.coins);

    // Disconnect before the dig is ripe. The elapsed time is thrown away.
    await ripen(owner.socket, ticksBeforePay);
    const closed = new Promise<void>((resolve) => owner.socket.once('close', () => resolve()));
    owner.socket.terminate();
    await closed;

    // Time passes while the owner is away: no pickup runs, even with another fig connected.
    // The waiter's socket may still hold older broadcasts, so read the last snapshot it hears.
    const heardLast = new Promise<SnapshotMessage>((resolve) => {
      let last: SnapshotMessage | undefined;
      const onMango = (data: unknown) => {
        last = JSON.parse(mangoText(data)) as SnapshotMessage;
      };
      waiter.socket.on('message', onMango);
      setTimeout(() => {
        waiter.socket.off('message', onMango);
        resolve(last!);
      }, 400);
    });
    waiter.socket.send(JSON.stringify({ type: 'ripen', steps: ticksBeforePay * 5 }));
    let snap = await heardLast;
    expect(await coinsOf(owner.id)).toBe(0);
    expect(await coinsOf(waiter.id)).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(1);
    expect(seedsOf(snap, owner.id)[0]!.value).toBe(wolfRow.coins);
    expect(snap.snapshot.pickups).toEqual([]);

    // Return: the full duration starts over. The tick before it pays nothing.
    const back = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, owner.grape);
    openSockets.push(back.socket);
    expect(seedsOf({ snapshot: back.welcome.snapshot } as SnapshotMessage, owner.id)).toHaveLength(1);
    snap = await ripen(back.socket, ticksBeforePay);
    expect(await coinsOf(owner.id)).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(1);
    snap = await ripen(back.socket, 1);
    expect(await coinsOf(owner.id)).toBe(wolfRow.coins);
    expect(seedsOf(snap, owner.id)).toHaveLength(0);
    expect(await coinsOf(waiter.id)).toBe(0);
  }, 120_000);
});
