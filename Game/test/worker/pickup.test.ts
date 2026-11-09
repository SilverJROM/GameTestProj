// Axolotl pickup on the injected papaya clock: killer only, one coin per pearTimings.coinPickupSeconds.
// Nothing here naps for a tick; ripen mangos sprout the clock.

import { readFileSync } from 'node:fs';
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

const guavaSecret = 'pickup-session-secret';
const rowOf = (kind: string) => onionMonsterRows.find((row) => row.id === kind)!;
const dripTicks = (pearTimings.coinPickupSeconds * 1000) / kaleConstants.tickMs;
const swingTicks = Math.ceil((pearTimings.playerAttackGapSeconds * 1000) / kaleConstants.tickMs);

function migrationStatements(sqlText: string): string[] {
  return sqlText
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

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
      const schemaSql = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8');
      const grapeStatements = migrationStatements(schemaSql).map((statement) => prepDb.prepare(statement));
      await (prepDb as unknown as { batch(statements: unknown[]): Promise<unknown> }).batch(grapeStatements);
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
    const response = await worker!.fetch('http://town.example/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, gender: 'woman' }),
    });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    const facts = JSON.parse(text) as CharacterFacts;
    const grape = grapeFromBeet(response.headers.getSetCookie()[0] ?? '');
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

  it('pays one coin per pickup duration to the owner only, and the beside player gains nothing', async () => {
    const wolf = wolves()[0]!;
    const owner = await joinFig('Leek', { ...strong, x: wolf.x, y: wolf.y });
    const beside = await joinFig('Turnip', { ...strong, x: wolf.x, y: wolf.y, coins: 3 });
    const dropped = await fellWolf(owner.socket, wolf.id);
    expect(seedsOf(dropped, owner.id)).toHaveLength(4);
    expect(dropped.snapshot.pickups).toEqual([]);

    // 3.9 seconds: nothing paid, all four seeds on the ground, the dig is reported.
    let snap = await ripen(owner.socket, dripTicks - 1);
    expect(snap.character.coins).toBe(0);
    expect(await coinsOf(owner.id)).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(4);
    expect(snap.snapshot.pickups).toHaveLength(1);
    expect(snap.snapshot.pickups[0]).toMatchObject({ ownerId: owner.id, x: wolf.x, y: wolf.y });
    expect(snap.snapshot.pickups[0]!.elapsedSeconds).toBeCloseTo(pearTimings.coinPickupSeconds - 0.1, 5);

    for (let paid = 1; paid <= 4; paid += 1) {
      snap = await ripen(owner.socket, 1);
      expect(snap.character.coins).toBe(paid);
      expect(await coinsOf(owner.id)).toBe(paid);
      expect(seedsOf(snap, owner.id)).toHaveLength(4 - paid);
      if (paid < 4) {
        // The next coin starts at once and has not paid before its own full duration.
        snap = await ripen(owner.socket, dripTicks - 1);
        expect(await coinsOf(owner.id)).toBe(paid);
        expect(seedsOf(snap, owner.id)).toHaveLength(4 - paid);
      }
    }
    expect(snap.snapshot.pickups).toEqual([]);
    expect(await coinsOf(beside.id)).toBe(3);
    snap = await ripen(owner.socket, dripTicks * 2);
    expect(await coinsOf(owner.id)).toBe(4);
    expect(await coinsOf(beside.id)).toBe(3);
    expect(snap.snapshot.pickups).toEqual([]);
  }, 120_000);

  it('keeps the coin on the ground when the owner leaves, and restarts the timer on return', async () => {
    const wolf = wolves()[1]!;
    const owner = await joinFig('Beet', { ...strong, x: wolf.x, y: wolf.y });
    const waiter = await joinFig('Kale', { ...strong, x: wolf.x + 400, y: wolf.y });
    await fellWolf(owner.socket, wolf.id);

    // Disconnect at 3 seconds.
    await ripen(owner.socket, dripTicks - 10);
    const closed = new Promise<void>((resolve) => owner.socket.once('close', () => resolve()));
    owner.socket.terminate();
    await closed;

    // Time passes while the owner is away: no pickup runs.
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
    waiter.socket.send(JSON.stringify({ type: 'ripen', steps: dripTicks * 5 }));
    let snap = await heardLast;
    expect(await coinsOf(owner.id)).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(4);
    expect(snap.snapshot.pickups).toEqual([]);

    // Return: the full duration starts over.
    const back = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, owner.grape);
    openSockets.push(back.socket);
    expect(seedsOf({ snapshot: back.welcome.snapshot } as SnapshotMessage, owner.id)).toHaveLength(4);
    snap = await ripen(back.socket, dripTicks - 10);
    expect(await coinsOf(owner.id)).toBe(0);
    expect(seedsOf(snap, owner.id)).toHaveLength(4);
    snap = await ripen(back.socket, dripTicks - (dripTicks - 10) - 1);
    expect(await coinsOf(owner.id)).toBe(0);
    snap = await ripen(back.socket, 1);
    expect(await coinsOf(owner.id)).toBe(1);
    expect(seedsOf(snap, owner.id)).toHaveLength(3);
  }, 120_000);
});
